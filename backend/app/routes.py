"""
API Routes — All REST + WebSocket endpoints.
"""
import datetime
import csv
import io
import json
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import (
    User, Case, CaseInvestigator, Person, Edge, Event,
    CDRRecord, TransactionRecord, FIRRecord, SurveillanceRecord,
    SocialMediaRecord, CriminalHistoryRecord, LocationPing,
    PatternAlert, ApprovalRequest, AuditLog, CustomRule,
    GraphRelationship, GroundTruthNetwork
)
from app.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_role, Token, UserCreate, UserOut
)
from app.graph_store import get_graph_store
from app.scoring import compute_suspicion_score, assign_confidence_band, recompute_all_scores
from app.detectors import run_all_detectors


router = APIRouter()


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc)


def _utcnow_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _parse_datetime(val) -> datetime.datetime:
    if isinstance(val, datetime.datetime):
        return val
    if isinstance(val, str) and val.strip():
        try:
            return datetime.datetime.fromisoformat(val.strip().replace("Z", "+00:00"))
        except Exception:
            pass
    return datetime.datetime.now(datetime.timezone.utc)


# ═══════════════════════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════════════════════

class CaseCreate(BaseModel):
    title: str
    description: str = ""

class CaseOut(BaseModel):
    id: str
    case_number: Optional[str] = None
    case_type: Optional[str] = None
    title: str
    description: Optional[str] = ""
    status: Optional[str] = "active"
    standing_authorisation: Optional[bool] = False
    opened_date: Optional[str] = None
    closed_date: Optional[str] = None
    jurisdiction_location_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime.datetime] = None
    class Config:
        from_attributes = True

class PersonOut(BaseModel):
    id: str
    name: str
    photo_url: Optional[str] = ""
    phone_numbers: Optional[list] = []
    criminal_history_flag: Optional[bool] = False
    suspicion_score: Optional[float] = 0.0
    hierarchy_score: Optional[float] = 0.0
    confidence_band: Optional[str] = "unexplored"
    explored: Optional[bool] = False
    is_seed: Optional[bool] = False
    aadhaar_id: Optional[str] = None
    city: Optional[str] = None
    occupation: Optional[str] = None
    network_role: Optional[str] = None
    aliases: Optional[list] = []
    class Config:
        from_attributes = True

class ApprovalRequestCreate(BaseModel):
    person_id: str
    request_type: str = "expansion"
    justification: str = ""

class ApprovalDecision(BaseModel):
    status: str  # approved | rejected

class ScoreOverride(BaseModel):
    override_value: float
    reason: str = ""

class CustomRuleCreate(BaseModel):
    name: str
    description: str = ""
    rule_type: str = "threshold"
    conditions: dict

class InvestigatorAskRequest(BaseModel):
    case_id: str
    question: str
    selected_person_id: Optional[str] = None

class InvestigatorAskResponse(BaseModel):
    answer: str
    case_id: str
    selected_person_id: Optional[str] = None
    evidence_used: List[str] = []
    model: Optional[str] = None
    status: Optional[str] = "success"


# ═══════════════════════════════════════════════════════════════
# Auth Routes
# ═══════════════════════════════════════════════════════════════

@router.post("/api/auth/register", response_model=UserOut)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    user = User(
        id=str(uuid.uuid4()),
        username=user_data.username,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.username, "role": user.role})

    # Audit log
    db.add(AuditLog(
        user_id=user.id, action="login",
        details={"ip": "local"}
    ))
    db.commit()

    return Token(
        access_token=token, token_type="bearer",
        role=user.role, user_id=user.id, full_name=user.full_name
    )


@router.get("/api/auth/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ═══════════════════════════════════════════════════════════════
# Case Routes
# ═══════════════════════════════════════════════════════════════

@router.post("/api/cases", response_model=CaseOut)
def create_case(
    case_data: CaseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    case = Case(
        id=str(uuid.uuid4()),
        title=case_data.title,
        description=case_data.description,
        created_by=current_user.id,
    )
    db.add(case)
    # Add creator as investigator
    db.add(CaseInvestigator(
        case_id=case.id, user_id=current_user.id,
        can_approve_expansion=True
    ))
    db.add(AuditLog(
        case_id=case.id, user_id=current_user.id,
        action="case_created", details={"title": case.title}
    ))
    db.commit()
    db.refresh(case)
    return case


def _delete_case(case_id: str, db: Session):
    """Cleanly purge a case and all associated child records."""
    db.query(PatternAlert).filter(PatternAlert.case_id == case_id).delete()
    db.query(ApprovalRequest).filter(ApprovalRequest.case_id == case_id).delete()
    db.query(Event).filter(Event.case_id == case_id).delete()
    db.query(LocationPing).filter(LocationPing.case_id == case_id).delete()
    db.query(Edge).filter(Edge.case_id == case_id).delete()
    db.query(CDRRecord).filter(CDRRecord.case_id == case_id).delete()
    db.query(TransactionRecord).filter(TransactionRecord.case_id == case_id).delete()
    db.query(FIRRecord).filter(FIRRecord.case_id == case_id).delete()
    db.query(SurveillanceRecord).filter(SurveillanceRecord.case_id == case_id).delete()
    db.query(SocialMediaRecord).filter(SocialMediaRecord.case_id == case_id).delete()
    db.query(CriminalHistoryRecord).filter(CriminalHistoryRecord.case_id == case_id).delete()
    db.query(Person).filter(Person.case_id == case_id).delete()
    db.query(CaseInvestigator).filter(CaseInvestigator.case_id == case_id).delete()
    db.query(Case).filter(Case.id == case_id).delete()
    db.commit()


@router.get("/api/cases", response_model=List[CaseOut])
def list_cases(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Automatically clean up duplicate demo cases on visit/login so only 1 primary case is retained
    garuda_cases = db.query(Case).filter(Case.title.like("%Operation Garuda%")).order_by(Case.created_at.asc()).all()
    if len(garuda_cases) > 1:
        for extra in garuda_cases[1:]:
            _delete_case(extra.id, db)

    if current_user.role in ("admin", "senior_authority"):
        return db.query(Case).all()
    case_ids = [ci.case_id for ci in db.query(CaseInvestigator).filter(
        CaseInvestigator.user_id == current_user.id
    ).all()]
    cases = db.query(Case).filter(Case.id.in_(case_ids)).all()
    if not cases:
        return db.query(Case).all()
    return cases


@router.delete("/api/cases/{case_id}")
def delete_case(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    _delete_case(case_id, db)
    return {"status": "success", "message": f"Case {case_id} deleted"}


@router.post("/api/cases/reset-clean")
def reset_clean_cases(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Keep only the first primary demo case and remove all duplicates/extras."""
    all_cases = db.query(Case).order_by(Case.created_at.asc()).all()
    if len(all_cases) > 1:
        for extra in all_cases[1:]:
            _delete_case(extra.id, db)
    return {"status": "success", "remaining_cases": db.query(Case).count()}


@router.get("/api/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.patch("/api/cases/{case_id}/standing-auth")
def toggle_standing_auth(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    case.standing_authorisation = not case.standing_authorisation
    db.add(AuditLog(
        case_id=case_id, user_id=current_user.id,
        action="standing_auth_toggled",
        details={"new_value": case.standing_authorisation}
    ))
    db.commit()
    return {"standing_authorisation": case.standing_authorisation}


# ═══════════════════════════════════════════════════════════════
# Upload / Ingestion Routes
# ═══════════════════════════════════════════════════════════════

@router.post("/api/cases/{case_id}/upload")
async def upload_data(
    case_id: str,
    file: UploadFile = File(...),
    data_type: str = Form(...),
    person_name: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload data files (CDR CSV, Transaction CSV, FIR text, etc.)"""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    store = get_graph_store()
    result = {"records_parsed": 0, "entities_found": 0, "edges_created": 0}

    if data_type == "cdr":
        result = _parse_cdr(case_id, text, person_name, db, store)
    elif data_type == "transactions":
        result = _parse_transactions(case_id, text, person_name, db, store)
    elif data_type == "fir":
        result = _parse_fir(case_id, text, person_name, db, store)
    elif data_type == "surveillance":
        result = _parse_surveillance(case_id, text, person_name, db, store)
    elif data_type == "social_media":
        result = _parse_social_media(case_id, text, person_name, db, store)
    elif data_type == "criminal_history":
        result = _parse_criminal_history(case_id, text, person_name, db, store)
    elif data_type == "location_pings":
        result = _parse_location_pings(case_id, text, person_name, db, store)
    elif data_type == "batch_json":
        result = _parse_batch_json(case_id, text, db, store)

    # Recompute scores after ingestion
    recompute_all_scores(case_id, db)
    store.save(case_id)

    # Run pattern detectors on newly ingested data
    alerts = run_all_detectors(case_id, store, db)
    for alert in alerts:
        existing_alert = db.query(PatternAlert).filter(
            PatternAlert.case_id == case_id,
            PatternAlert.detector_name == alert["detector_name"],
            PatternAlert.title == alert["title"]
        ).first()
        if not existing_alert:
            db.add(PatternAlert(
                id=alert["id"],
                case_id=case_id,
                detector_name=alert["detector_name"],
                severity=alert["severity"],
                title=alert["title"],
                description=alert["description"],
                involved_person_ids=alert["involved_person_ids"],
                involved_edge_ids=alert.get("involved_edge_ids", []),
                evidence_data=alert.get("evidence_data", {}),
            ))
    db.commit()
    result["alerts_detected"] = len(alerts)

    db.add(AuditLog(
        case_id=case_id, user_id=current_user.id,
        action="data_upload",
        details={"data_type": data_type, "file": file.filename, **result}
    ))
    db.commit()

    return {"status": "success", **result}


@router.post("/api/cases/{case_id}/seed-demo")
def seed_demo_case(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Seed clean, focused 7-person syndicate dataset across all categories and run detectors."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    candidate_files = [
        Path(__file__).resolve().parent.parent.parent / "data-generator" / "output" / "complete_case_data.json",
        Path(__file__).resolve().parent.parent / "data_seed" / "complete_case_data.json",
        Path(__file__).resolve().parent.parent / "data-generator" / "output" / "complete_case_data.json",
        Path.cwd() / "backend" / "data_seed" / "complete_case_data.json",
        Path.cwd() / "data-generator" / "output" / "complete_case_data.json",
    ]
    demo_file = next((p for p in candidate_files if p.exists()), None)
    if not demo_file:
        raise HTTPException(status_code=500, detail="Demo dataset not found. Run generator first.")
    demo_dir = demo_file.parent

    # 1. Purge existing case records
    store = get_graph_store()
    try:
        db.query(PatternAlert).filter(PatternAlert.case_id == case_id).delete()
        db.query(ApprovalRequest).filter(ApprovalRequest.case_id == case_id).delete()
        db.query(CDRRecord).filter(CDRRecord.case_id == case_id).delete()
        db.query(TransactionRecord).filter(TransactionRecord.case_id == case_id).delete()
        db.query(FIRRecord).filter(FIRRecord.case_id == case_id).delete()
        db.query(SurveillanceRecord).filter(SurveillanceRecord.case_id == case_id).delete()
        db.query(SocialMediaRecord).filter(SocialMediaRecord.case_id == case_id).delete()
        db.query(CriminalHistoryRecord).filter(CriminalHistoryRecord.case_id == case_id).delete()
        db.query(LocationPing).filter(LocationPing.case_id == case_id).delete()
        db.query(Event).filter(Event.case_id == case_id).delete()
        db.query(Edge).filter(Edge.case_id == case_id).delete()
        db.query(Person).filter(Person.case_id == case_id).delete()
        db.flush()
    except Exception as e:
        print(f"Notice during case purge: {e}")

    # Reset graph cleanly
    if hasattr(store, "reset"):
        store.reset(case_id)
    elif hasattr(store, "_graphs"):
        import networkx as nx
        store._graphs[case_id] = nx.Graph()

    # 2. Ingest batch JSON (Persons, Edges, Events, Location Pings)
    with open(demo_file, "r", encoding="utf-8") as f:
        text = f.read()
    result = _parse_batch_json(case_id, text, db, store)
    person_cache = result.get("person_cache", {})

    # 3. Populate raw evidence tables
    # FIRs
    fir_file = demo_dir / "fir_records.json"
    if fir_file.exists():
        with open(fir_file, "r", encoding="utf-8") as f:
            for fir in json.load(f):
                accused_name = fir.get("accused", [""])[0] if fir.get("accused") else ""
                pid = person_cache.get(accused_name)
                db.add(FIRRecord(
                    case_id=case_id,
                    person_id=pid,
                    fir_number=fir["fir_number"],
                    date=_parse_datetime(fir["date"]),
                    offence=fir["offence"],
                    description=fir["description"],
                    police_station=fir["police_station"]
                ))

    # Surveillance
    surv_file = demo_dir / "surveillance_records.json"
    if surv_file.exists():
        with open(surv_file, "r", encoding="utf-8") as f:
            for s in json.load(f):
                pid = person_cache.get(s.get("person_name"))
                db.add(SurveillanceRecord(
                    case_id=case_id,
                    person_id=pid,
                    source=s["source"],
                    timestamp=_parse_datetime(s["timestamp"]),
                    description=s["description"],
                    location_lat=s.get("location_lat"),
                    location_lng=s.get("location_lng")
                ))

    # Criminal History
    crim_file = demo_dir / "criminal_history_records.json"
    if crim_file.exists():
        with open(crim_file, "r", encoding="utf-8") as f:
            for c in json.load(f):
                pid = person_cache.get(c.get("person_name"))
                db.add(CriminalHistoryRecord(
                    case_id=case_id,
                    person_id=pid,
                    shared_case_ref=c.get("shared_case_ref", ""),
                    offence=c.get("offence", ""),
                    sentence=c.get("sentence", "")
                ))

    # CDR records (Call Detail Records)
    cdr_file = demo_dir / "cdr_records.csv"
    if cdr_file.exists():
        try:
            with open(cdr_file, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    c_name = row.get("caller_name")
                    r_name = row.get("callee_name")
                    c_pid = person_cache.get(c_name)
                    r_pid = person_cache.get(r_name)
                    ts = _parse_datetime(row.get("timestamp", _utcnow_iso()))
                    dur = int(row.get("duration_seconds", 0) or 0)
                    db.add(CDRRecord(
                        case_id=case_id,
                        caller_person_id=c_pid,
                        receiver_person_id=r_pid,
                        caller_phone=row.get("caller_number", "+919800000000"),
                        receiver_phone=row.get("callee_number", "+919800000001"),
                        timestamp=ts,
                        call_timestamp=row.get("timestamp", ""),
                        duration_seconds=dur,
                        call_duration=dur,
                        call_type="voice",
                    ))
        except Exception as err:
            print(f"Notice reading CDRs: {err}")

    # Financial Transactions
    tx_file = demo_dir / "transaction_records.csv"
    if tx_file.exists():
        try:
            with open(tx_file, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    s_name = row.get("sender_name")
                    r_name = row.get("receiver_name")
                    s_pid = person_cache.get(s_name)
                    r_pid = person_cache.get(r_name)
                    ts = _parse_datetime(row.get("timestamp", _utcnow_iso()))
                    db.add(TransactionRecord(
                        case_id=case_id,
                        sender_person_id=s_pid,
                        receiver_person_id=r_pid,
                        sender_account=row.get("sender_account", "ACC0001"),
                        receiver_account=row.get("receiver_account", "ACC0002"),
                        amount=float(row.get("amount", 0) or 0),
                        timestamp=ts,
                        transaction_timestamp=row.get("timestamp", ""),
                        platform="IMPS",
                        description=f"Fund transfer from {s_name} to {r_name}",
                    ))
        except Exception as err:
            print(f"Notice reading transactions: {err}")

    # Social Media
    sm_file = demo_dir / "social_media_records.json"
    if sm_file.exists():
        try:
            with open(sm_file, "r", encoding="utf-8") as f:
                for sm in json.load(f):
                    pid = person_cache.get(sm.get("person_name"))
                    if pid:
                        db.add(SocialMediaRecord(
                            case_id=case_id,
                            person_id=pid,
                            platform=sm.get("platform", "telegram"),
                            content=sm.get("content", sm.get("message", "")),
                            timestamp=_parse_datetime(sm.get("timestamp", _utcnow_iso())),
                        ))
        except Exception as err:
            print(f"Notice reading social media: {err}")

    db.flush()

    # 4. Recompute scores and save graph
    recompute_all_scores(case_id, db)
    store.save(case_id)

    # 5. Run detectors & persist pattern alerts
    alerts = run_all_detectors(case_id, store, db)
    for alert in alerts:
        db.add(PatternAlert(
            id=alert["id"],
            case_id=case_id,
            detector_name=alert["detector_name"],
            severity=alert["severity"],
            title=alert["title"],
            description=alert["description"],
            involved_person_ids=alert["involved_person_ids"],
            involved_edge_ids=alert.get("involved_edge_ids", []),
            evidence_data=alert.get("evidence_data", {}),
        ))

    clean_result = {k: v for k, v in result.items() if k != "person_cache"}
    if current_user:
        db.add(AuditLog(
            case_id=case_id, user_id=current_user.id,
            action="seed_demo_syndicate",
            details={"case_title": case.title, "alerts_detected": len(alerts), **clean_result}
        ))
    db.commit()

    return {"status": "success", "alerts_detected": len(alerts), **clean_result}


def _get_or_create_person(case_id: str, name: str, db: Session, store, **kwargs) -> str:
    """Find or create a person by name in a case."""
    existing = db.query(Person).filter(Person.case_id == case_id, Person.name == name).first()
    if existing:
        return existing.id
    person_id = str(uuid.uuid4())
    person = Person(
        id=person_id, case_id=case_id, name=name,
        phone_numbers=kwargs.get("phone_numbers", []),
        criminal_history_flag=kwargs.get("criminal_history_flag", False),
        is_seed=kwargs.get("is_seed", False),
    )
    db.add(person)
    db.flush()

    # Add to graph
    initials = "".join([w[0].upper() for w in name.split() if w][:2])
    store.add_person_node(case_id, person_id, {
        "name": name,
        "initials": initials,
        "phone_numbers": kwargs.get("phone_numbers", []),
        "criminal_history_flag": kwargs.get("criminal_history_flag", False),
        "suspicion_score": 0.0,
        "hierarchy_score": 0.0,
        "confidence_band": "unexplored",
        "explored": False,
        "is_seed": kwargs.get("is_seed", False),
        "photo_url": "",
        "aliases": kwargs.get("aliases", []),
        "location_trail": [],
        "cross_case_refs": kwargs.get("cross_case_refs", []),
    })
    return person_id


def _parse_cdr(case_id, text, person_name, db, store):
    reader = csv.DictReader(io.StringIO(text))
    records = 0
    edges = 0
    person_cache = {}

    for row in reader:
        caller = row.get("caller_name", row.get("caller", "")).strip()
        callee = row.get("callee_name", row.get("callee", "")).strip()
        if not caller or not callee:
            continue

        caller_id = person_cache.get(caller) or _get_or_create_person(
            case_id, caller, db, store,
            phone_numbers=[row.get("caller_number", "")]
        )
        person_cache[caller] = caller_id

        callee_id = person_cache.get(callee) or _get_or_create_person(
            case_id, callee, db, store,
            phone_numbers=[row.get("callee_number", "")]
        )
        person_cache[callee] = callee_id

        ts = row.get("timestamp", _utcnow_iso())
        duration = int(row.get("duration_seconds", row.get("duration", 0)))

        db.add(CDRRecord(
            case_id=case_id, person_id=caller_id,
            caller_number=row.get("caller_number", ""),
            callee_number=row.get("callee_number", ""),
            timestamp=_parse_datetime(ts), duration_seconds=duration
        ))

        store.add_edge(case_id, caller_id, callee_id, "CALL", {
            "timestamp": ts,
            "duration": duration,
            "frequency": int(row.get("frequency", 1)),
            "confidence": 0.6,
            "frequency_history": json.loads(row.get("frequency_history", "[]")) if row.get("frequency_history") else [],
        })
        records += 1
        edges += 1

    db.flush()
    return {"records_parsed": records, "edges_created": edges}


def _parse_transactions(case_id, text, person_name, db, store):
    reader = csv.DictReader(io.StringIO(text))
    records = 0
    edges = 0
    person_cache = {}

    for row in reader:
        sender = row.get("sender_name", row.get("sender", "")).strip()
        receiver = row.get("receiver_name", row.get("receiver", "")).strip()
        if not sender or not receiver:
            continue

        sender_id = person_cache.get(sender) or _get_or_create_person(case_id, sender, db, store)
        person_cache[sender] = sender_id
        receiver_id = person_cache.get(receiver) or _get_or_create_person(case_id, receiver, db, store)
        person_cache[receiver] = receiver_id

        amount = float(row.get("amount", 0))
        ts = row.get("timestamp", _utcnow_iso())

        db.add(TransactionRecord(
            case_id=case_id, person_id=sender_id,
            sender_account=row.get("sender_account", ""),
            receiver_account=row.get("receiver_account", ""),
            amount=amount, timestamp=_parse_datetime(ts)
        ))

        store.add_edge(case_id, sender_id, receiver_id, "TRANSACTION", {
            "amount": amount,
            "timestamp": ts,
            "direction": "forward",
            "frequency": int(row.get("frequency", 1)),
            "confidence": 0.7,
        })
        records += 1
        edges += 1

    db.flush()
    return {"records_parsed": records, "edges_created": edges}


def _parse_fir(case_id, text, person_name, db, store):
    """Parse FIR text documents. Expects JSON array of FIR objects."""
    try:
        firs = json.loads(text)
    except json.JSONDecodeError:
        # Treat as single FIR text
        firs = [{"fir_number": "FIR-001", "date": _utcnow_iso(),
                 "offence": "Under investigation", "description": text,
                 "accused_names": [person_name] if person_name else [],
                 "police_station": "Unknown"}]

    records = 0
    person_cache = {}
    for fir in firs:
        raw_accused = fir.get("accused") or fir.get("accused_names") or []
        accused_names = [raw_accused] if isinstance(raw_accused, str) else list(raw_accused)
        for name in accused_names:
            name = name.strip()
            if not name:
                continue
            pid = person_cache.get(name) or _get_or_create_person(
                case_id, name, db, store, criminal_history_flag=True
            )
            person_cache[name] = pid

            db.add(FIRRecord(
                case_id=case_id, person_id=pid,
                fir_number=fir.get("fir_number", ""),
                date=_parse_datetime(fir.get("date", _utcnow_iso())),
                offence=fir.get("offence", ""),
                description=fir.get("description", ""),
                police_station=fir.get("police_station", "")
            ))
            records += 1

        # Create FIR edges between co-accused
        pids = [person_cache[n.strip()] for n in accused_names if n.strip() in person_cache]
        for i in range(len(pids)):
            for j in range(i+1, len(pids)):
                store.add_edge(case_id, pids[i], pids[j], "FIR", {
                    "case_ref": fir.get("fir_number", ""),
                    "offence": fir.get("offence", ""),
                    "confidence": 0.8,
                    "timestamp": fir.get("date", ""),
                })

    db.flush()
    return {"records_parsed": records}


def _parse_surveillance(case_id, text, person_name, db, store):
    try:
        records_data = json.loads(text)
    except json.JSONDecodeError:
        records_data = [{"source": "field_report", "description": text,
                         "timestamp": _utcnow_iso(),
                         "person_name": person_name or "Unknown",
                         "observed_with": []}]

    records = 0
    person_cache = {}
    for rec in records_data:
        raw_name = rec.get("person_name") or person_name or "Unknown"
        if isinstance(raw_name, list):
            raw_name = raw_name[0] if raw_name else "Unknown"
        pname = str(raw_name).strip()
        pid = person_cache.get(pname) or _get_or_create_person(case_id, pname, db, store)
        person_cache[pname] = pid

        lat = float(rec.get("location_lat") or rec.get("lat") or 0) if (rec.get("location_lat") or rec.get("lat")) else None
        lng = float(rec.get("location_lng") or rec.get("lng") or 0) if (rec.get("location_lng") or rec.get("lng")) else None

        db.add(SurveillanceRecord(
            case_id=case_id, person_id=pid,
            source=rec.get("source", ""),
            timestamp=_parse_datetime(rec.get("timestamp", _utcnow_iso())),
            description=rec.get("description", ""),
            location_lat=lat,
            location_lng=lng,
        ))

        # Location trail
        if lat and lng:
            node = store.get_node(case_id, pid)
            trail = node.get("location_trail", [])
            trail.append({"lat": lat, "lng": lng, "timestamp": rec.get("timestamp", "")})
            store.update_node_attrs(case_id, pid, {"location_trail": trail})

        # Surveillance edges
        for observed_name in rec.get("observed_with", []):
            observed_name = observed_name.strip()
            if not observed_name:
                continue
            oid = person_cache.get(observed_name) or _get_or_create_person(case_id, observed_name, db, store)
            person_cache[observed_name] = oid
            store.add_edge(case_id, pid, oid, "SURVEILLANCE", {
                "source": rec.get("source", ""),
                "timestamp": rec.get("timestamp", ""),
                "description": rec.get("description", "")[:100],
                "confidence": 0.5,
            })

        records += 1

    db.flush()
    return {"records_parsed": records}


def _parse_social_media(case_id, text, person_name, db, store):
    try:
        records_data = json.loads(text)
    except json.JSONDecodeError:
        return {"records_parsed": 0}

    records = 0
    person_cache = {}
    for rec in records_data:
        pname = rec.get("person_name", "").strip()
        if not pname:
            continue
        pid = person_cache.get(pname) or _get_or_create_person(case_id, pname, db, store)
        person_cache[pname] = pid

        target_name = rec.get("target_person_name", "").strip()
        target_id = None
        if target_name:
            target_id = person_cache.get(target_name) or _get_or_create_person(case_id, target_name, db, store)
            person_cache[target_name] = target_id

        db.add(SocialMediaRecord(
            case_id=case_id, person_id=pid,
            platform=rec.get("platform", ""),
            interaction_type=rec.get("interaction_type", ""),
            content=rec.get("content", ""),
            target_person_id=target_id,
            timestamp=_parse_datetime(rec.get("timestamp", _utcnow_iso())),
        ))

        if target_id:
            store.add_edge(case_id, pid, target_id, "SOCIAL_MEDIA", {
                "platform": rec.get("platform", ""),
                "interaction_type": rec.get("interaction_type", ""),
                "confidence": 0.4,
                "timestamp": rec.get("timestamp", ""),
            })

        records += 1

    db.flush()
    return {"records_parsed": records}


def _parse_criminal_history(case_id, text, person_name, db, store):
    try:
        records_data = json.loads(text)
    except json.JSONDecodeError:
        return {"records_parsed": 0}

    records = 0
    person_cache = {}
    for rec in records_data:
        pname = rec.get("person_name", "").strip()
        if not pname:
            continue
        pid = person_cache.get(pname) or _get_or_create_person(
            case_id, pname, db, store, criminal_history_flag=True
        )
        person_cache[pname] = pid
        store.update_node_attrs(case_id, pid, {"criminal_history_flag": True})

        conv_date = rec.get("conviction_date")
        db.add(CriminalHistoryRecord(
            case_id=case_id, person_id=pid,
            shared_case_ref=rec.get("shared_case_ref", ""),
            offence=rec.get("offence", ""),
            conviction_date=_parse_datetime(conv_date) if conv_date else None,
            sentence=rec.get("sentence", ""),
        ))

        # Edges between co-accused in same shared case
        shared_ref = rec.get("shared_case_ref", "")
        co_accused = rec.get("co_accused", [])
        for co_name in co_accused:
            co_name = co_name.strip()
            if not co_name:
                continue
            cid = person_cache.get(co_name) or _get_or_create_person(
                case_id, co_name, db, store, criminal_history_flag=True
            )
            person_cache[co_name] = cid
            store.add_edge(case_id, pid, cid, "CRIMINAL_HISTORY", {
                "shared_case": shared_ref,
                "confidence": 0.9,
            })

        records += 1

    db.flush()
    return {"records_parsed": records}


def _parse_location_pings(case_id, text, person_name, db, store):
    reader = csv.DictReader(io.StringIO(text))
    records = 0
    person_cache = {}

    for row in reader:
        pname = row.get("person_name", person_name or "").strip()
        if not pname:
            continue
        pid = person_cache.get(pname) or _get_or_create_person(case_id, pname, db, store)
        person_cache[pname] = pid

        lat = float(row.get("lat", 0))
        lng = float(row.get("lng", 0))
        ts = row.get("timestamp", _utcnow_iso())

        db.add(LocationPing(
            case_id=case_id, person_id=pid,
            lat=lat, lng=lng, timestamp=_parse_datetime(ts)
        ))

        node = store.get_node(case_id, pid)
        trail = node.get("location_trail", [])
        trail.append({"lat": lat, "lng": lng, "timestamp": ts})
        store.update_node_attrs(case_id, pid, {"location_trail": trail})
        records += 1

    db.flush()
    return {"records_parsed": records}


def _parse_batch_json(case_id, text, db, store):
    """Parse a complete batch JSON with all data types."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    result = {"records_parsed": 0, "edges_created": 0, "persons_created": 0}
    person_cache = {}

    # First pass: create all persons
    for p in data.get("persons", []):
        pid = _get_or_create_person(
            case_id, p["name"], db, store,
            phone_numbers=p.get("phone_numbers", []),
            criminal_history_flag=p.get("criminal_history_flag", False),
            is_seed=p.get("is_seed", False),
            aliases=p.get("aliases", []),
            cross_case_refs=p.get("cross_case_refs", []),
        )
        person_cache[p["name"]] = pid
        result["persons_created"] += 1

    # Second pass: create edges
    for e in data.get("edges", []):
        src_name = e.get("source_name", "")
        tgt_name = e.get("target_name", "")
        if src_name not in person_cache or tgt_name not in person_cache:
            continue
        store.add_edge(
            case_id,
            person_cache[src_name],
            person_cache[tgt_name],
            e.get("evidence_type", "CALL"),
            {
                "confidence": e.get("confidence", 0.5),
                "timestamp": e.get("timestamp", ""),
                "amount": e.get("amount", 0),
                "frequency": e.get("frequency", 1),
                "frequency_history": e.get("frequency_history", []),
                "direction": e.get("direction", "forward"),
                "is_new_connection": e.get("is_new_connection", False),
            }
        )
        result["edges_created"] += 1

    # Third pass: events
    for ev in data.get("events", []):
        linked_ids = []
        for name in ev.get("linked_person_names", []):
            if name in person_cache:
                linked_ids.append(person_cache[name])
        db.add(Event(
            case_id=case_id,
            timestamp=_parse_datetime(ev.get("timestamp", _utcnow_iso())),
            event_type=ev.get("event_type", "network_event"),
            description=ev.get("description", ""),
            linked_entity_ids=linked_ids,
            is_predicted=ev.get("is_predicted", False),
        ))
        result["records_parsed"] += 1

    # Fourth pass: location pings (attach to person nodes)
    for ping in data.get("location_pings", []):
        pname = ping.get("person_name", "")
        if pname in person_cache:
            pid = person_cache[pname]
            db.add(LocationPing(
                case_id=case_id, person_id=pid,
                lat=ping["lat"], lng=ping["lng"],
                timestamp=_parse_datetime(ping.get("timestamp", _utcnow_iso()))
            ))
            node = store.get_node(case_id, pid)
            trail = node.get("location_trail", [])
            trail.append({"lat": ping["lat"], "lng": ping["lng"], "timestamp": ping.get("timestamp", "")})
            store.update_node_attrs(case_id, pid, {"location_trail": trail})

    db.flush()
    result["person_cache"] = person_cache
    return result


# ═══════════════════════════════════════════════════════════════
# Graph Routes
# ═══════════════════════════════════════════════════════════════

def _ensure_case_graph(case_id: str, db: Session, store):
    """
    Ensures that a case's NetworkX graph is populated.
    If already cached and has complete nodes (>= 20 nodes), returns it immediately.
    If empty or incomplete, auto-seeds the full demo dataset so the graph is never empty or partial.
    """
    graph = store.get_graph(case_id)
    if graph and len(graph.get("nodes", [])) >= 20:
        return graph

    person_count = db.query(Person).filter(Person.case_id == case_id).count()
    if person_count < 20:
        seed_demo_case(case_id, current_user=None, db=db)
        return store.get_graph(case_id)

    case_rels = db.query(GraphRelationship).filter(GraphRelationship.case_id == case_id).all()
    ground_truths = db.query(GroundTruthNetwork).filter(GroundTruthNetwork.case_id == case_id).all()
    txs = db.query(TransactionRecord).filter(
        (TransactionRecord.case_id == case_id) | (TransactionRecord.linked_case_id == case_id)
    ).all()
    cdrs = db.query(CDRRecord).filter(
        (CDRRecord.case_id == case_id) | (CDRRecord.linked_case_id == case_id)
    ).all()
    firs = db.query(FIRRecord).filter(FIRRecord.case_id == case_id).all()
    survs = db.query(SurveillanceRecord).filter(SurveillanceRecord.case_id == case_id).all()

    involved_pids = set()
    for rel in case_rels:
        if rel.source_entity_type == 'PERSON':
            involved_pids.add(rel.source_entity_id)
        if rel.target_entity_type == 'PERSON':
            involved_pids.add(rel.target_entity_id)
    for gt in ground_truths:
        involved_pids.add(gt.person_id)
        if gt.related_person_id:
            involved_pids.add(gt.related_person_id)
    for tx in txs:
        if tx.sender_person_id:
            involved_pids.add(tx.sender_person_id)
        if tx.receiver_person_id:
            involved_pids.add(tx.receiver_person_id)
    for c in cdrs:
        if c.caller_person_id:
            involved_pids.add(c.caller_person_id)
        if c.receiver_person_id:
            involved_pids.add(c.receiver_person_id)
    for f in firs:
        if f.primary_complainant_person_id:
            involved_pids.add(f.primary_complainant_person_id)
        if f.person_id:
            involved_pids.add(f.person_id)
        if f.involved_person_ids:
            for pid in f.involved_person_ids:
                involved_pids.add(pid)
    for s in survs:
        if s.person_id:
            involved_pids.add(s.person_id)
        if s.observed_person_ids:
            for pid in s.observed_person_ids:
                involved_pids.add(pid)

    if not involved_pids:
        case_persons = db.query(Person).filter(Person.case_id == case_id).all()
        for p in case_persons:
            involved_pids.add(p.id)

    if involved_pids:
        persons = db.query(Person).filter(Person.id.in_(list(involved_pids))).all()
        person_map = {p.id: p for p in persons}

        for pid in involved_pids:
            p = person_map.get(pid)
            if not p:
                continue
            initials = "".join([w[0].upper() for w in p.name.split() if w][:2])
            store.add_person_node(case_id, pid, {
                "name": p.name,
                "initials": initials,
                "phone_numbers": p.phone_numbers or [],
                "criminal_history_flag": p.criminal_history_flag,
                "suspicion_score": p.suspicion_score,
                "hierarchy_score": p.hierarchy_score,
                "confidence_band": p.confidence_band,
                "explored": True,
                "is_seed": p.is_seed,
                "network_role": p.network_role,
                "city": p.city,
                "occupation": p.occupation,
                "aadhaar_id": p.aadhaar_id,
                "aliases": p.aliases or [],
                "location_trail": [],
                "cross_case_refs": [],
            })

        for rel in case_rels:
            ev_type = "CALL"
            if rel.relationship_type == "financial_transfer":
                ev_type = "TRANSACTION"
            elif "fir" in rel.relationship_type or "police" in rel.relationship_type:
                ev_type = "FIR"
            elif "observed" in rel.relationship_type:
                ev_type = "SURVEILLANCE"
            elif "message" in rel.relationship_type or "chat" in rel.relationship_type or "post" in rel.relationship_type:
                ev_type = "SOCIAL_MEDIA"
            elif "prior_case" in rel.relationship_type:
                ev_type = "CRIMINAL_HISTORY"

            store.add_edge(case_id, rel.source_entity_id, rel.target_entity_id, ev_type, {
                "relationship_type": rel.relationship_type,
                "confidence": rel.confidence,
                "timestamp": rel.timestamp,
                "source": rel.evidence_source,
            })

        for tx in txs:
            if tx.sender_person_id and tx.receiver_person_id:
                store.add_edge(case_id, tx.sender_person_id, tx.receiver_person_id, "TRANSACTION", {
                    "amount": tx.amount,
                    "timestamp": tx.transaction_timestamp or (tx.timestamp.isoformat() if tx.timestamp else ""),
                    "platform": tx.platform,
                    "confidence": 0.85,
                    "direction": "forward",
                })

        for cdr in cdrs:
            if cdr.caller_person_id and cdr.receiver_person_id:
                store.add_edge(case_id, cdr.caller_person_id, cdr.receiver_person_id, "CALL", {
                    "duration": cdr.call_duration,
                    "timestamp": cdr.call_timestamp or (cdr.timestamp.isoformat() if cdr.timestamp else ""),
                    "call_type": cdr.call_type,
                    "confidence": 0.8,
                    "direction": "forward",
                })

        recompute_all_scores(case_id, db)
        store.save(case_id)

    return store.get_graph(case_id)


@router.get("/api/cases/{case_id}/graph")
def get_graph(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    store = get_graph_store()
    return _ensure_case_graph(case_id, db, store)


@router.get("/api/cases/{case_id}/persons")
def list_persons(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    store = get_graph_store()
    _ensure_case_graph(case_id, db, store)
    graph_nodes = store.get_all_person_nodes(case_id)
    node_pids = [n["id"] for n in graph_nodes]
    if node_pids:
        persons = db.query(Person).filter(Person.id.in_(node_pids)).all()
    else:
        persons = db.query(Person).filter(Person.case_id == case_id).all()
    return [PersonOut.model_validate(p) for p in persons]


@router.get("/api/cases/{case_id}/persons/{person_id}")
def get_person_detail(case_id: str, person_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    store = get_graph_store()
    node = store.get_node(case_id, person_id)
    edges = store.get_edges_for_node(case_id, person_id)

    firs = db.query(FIRRecord).filter(
        (FIRRecord.person_id == person_id) | (FIRRecord.primary_complainant_person_id == person_id)
    ).all()
    criminal_history = db.query(CriminalHistoryRecord).filter(CriminalHistoryRecord.person_id == person_id).all()

    return {
        "person": PersonOut.model_validate(person),
        "graph_node": node,
        "edges": edges,
        "fir_records": [{"fir_number": f.fir_number, "date": str(f.date), "offence": f.offence, "description": f.description} for f in firs],
        "criminal_history": [{"offence": c.offence, "conviction_date": str(c.conviction_date), "sentence": c.sentence} for c in criminal_history],
    }


@router.get("/api/cases/{case_id}/hierarchy")
def get_hierarchy(case_id: str, current_user: User = Depends(get_current_user)):
    store = get_graph_store()
    persons = store.get_all_person_nodes(case_id)
    sorted_persons = sorted(persons, key=lambda p: p.get("hierarchy_score", 0), reverse=True)
    return {"hierarchy": sorted_persons}


@router.post("/api/cases/{case_id}/persons/{person_id}/override-score")
def override_score(
    case_id: str, person_id: str,
    override: ScoreOverride,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    store = get_graph_store()
    node = store.get_node(case_id, person_id)
    if not node:
        raise HTTPException(status_code=404, detail="Person not found in graph")

    store.update_node_attrs(case_id, person_id, {
        "investigator_override": override.override_value,
    })
    recompute_all_scores(case_id)
    store.save(case_id)

    db.add(AuditLog(
        case_id=case_id, user_id=current_user.id,
        action="manual_override",
        target_type="person", target_id=person_id,
        details={"override_value": override.override_value, "reason": override.reason}
    ))
    db.commit()

    updated_node = store.get_node(case_id, person_id)
    return {"status": "updated", "new_score": updated_node.get("suspicion_score", 0)}


# ═══════════════════════════════════════════════════════════════
# Pattern Detection Routes
# ═══════════════════════════════════════════════════════════════

@router.post("/api/cases/{case_id}/detect-patterns")
def detect_patterns(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    store = get_graph_store()
    alerts = run_all_detectors(case_id, store, db)

    # Save alerts to DB
    for alert in alerts:
        db.add(PatternAlert(
            id=alert["id"],
            case_id=case_id,
            detector_name=alert["detector_name"],
            severity=alert["severity"],
            title=alert["title"],
            description=alert["description"],
            involved_person_ids=alert["involved_person_ids"],
            involved_edge_ids=alert.get("involved_edge_ids", []),
            evidence_data=alert.get("evidence_data", {}),
        ))

    db.add(AuditLog(
        case_id=case_id, user_id=current_user.id,
        action="pattern_detection",
        details={"alerts_found": len(alerts)}
    ))
    db.commit()

    return {"alerts": alerts, "total": len(alerts)}


@router.get("/api/cases/{case_id}/alerts")
def get_alerts(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alerts = db.query(PatternAlert).filter(PatternAlert.case_id == case_id).order_by(PatternAlert.created_at.desc()).all()
    return [{
        "id": a.id, "detector_name": a.detector_name, "severity": a.severity,
        "title": a.title, "description": a.description,
        "involved_person_ids": a.involved_person_ids,
        "evidence_data": a.evidence_data,
        "is_confirmed": a.is_confirmed,
        "created_at": a.created_at.isoformat() if a.created_at else "",
    } for a in alerts]


@router.patch("/api/cases/{case_id}/alerts/{alert_id}")
def review_alert(
    case_id: str, alert_id: str,
    decision: ApprovalDecision,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    alert = db.query(PatternAlert).filter(PatternAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_confirmed = (decision.status == "approved")
    alert.reviewed_by = current_user.id
    db.add(AuditLog(
        case_id=case_id, user_id=current_user.id,
        action="alert_review",
        target_type="alert", target_id=alert_id,
        details={"decision": decision.status}
    ))
    db.commit()
    return {"status": "reviewed"}


# ═══════════════════════════════════════════════════════════════
# Approval / Authorisation Routes
# ═══════════════════════════════════════════════════════════════

@router.post("/api/cases/{case_id}/approvals")
def create_approval_request(
    case_id: str,
    req: ApprovalRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    approval = ApprovalRequest(
        case_id=case_id,
        person_id=req.person_id,
        request_type=req.request_type,
        requested_by=current_user.id,
        justification=req.justification,
    )
    db.add(approval)
    db.add(AuditLog(
        case_id=case_id, user_id=current_user.id,
        action="approval_requested",
        target_type="person", target_id=req.person_id,
        details={"request_type": req.request_type}
    ))
    db.commit()
    db.refresh(approval)
    return {"id": approval.id, "status": approval.status}


@router.get("/api/cases/{case_id}/approvals")
def list_approvals(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    approvals = db.query(ApprovalRequest).filter(ApprovalRequest.case_id == case_id).all()
    return [{
        "id": a.id, "person_id": a.person_id, "request_type": a.request_type,
        "status": a.status, "justification": a.justification,
        "requested_by": a.requested_by, "created_at": a.created_at.isoformat() if a.created_at else "",
    } for a in approvals]


@router.patch("/api/cases/{case_id}/approvals/{approval_id}")
def decide_approval(
    case_id: str, approval_id: str,
    decision: ApprovalDecision,
    current_user: User = Depends(require_role("senior_authority", "admin")),
    db: Session = Depends(get_db)
):
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")

    approval.status = decision.status
    approval.reviewed_by = current_user.id
    approval.reviewed_at = _utcnow()

    if decision.status == "approved" and approval.request_type == "expansion":
        # Mark person as explored
        store = get_graph_store()
        store.update_node_attrs(case_id, approval.person_id, {"explored": True})
        store.save(case_id)

        person = db.query(Person).filter(Person.id == approval.person_id).first()
        if person:
            person.explored = True

    db.add(AuditLog(
        case_id=case_id, user_id=current_user.id,
        action="authorisation_decision",
        target_type="approval", target_id=approval_id,
        details={"decision": decision.status, "request_type": approval.request_type}
    ))
    db.commit()
    return {"status": decision.status}


# ═══════════════════════════════════════════════════════════════
# Events / Timeline Routes
# ═══════════════════════════════════════════════════════════════

@router.get("/api/cases/{case_id}/events")
def get_events(case_id: str, event_type: Optional[str] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Event).filter(Event.case_id == case_id)
    if event_type:
        query = query.filter(Event.event_type == event_type)
    events = query.order_by(Event.timestamp).all()
    return [{
        "id": e.id, "timestamp": e.timestamp.isoformat() if e.timestamp else "",
        "event_type": e.event_type, "description": e.description,
        "linked_entity_ids": e.linked_entity_ids, "is_predicted": e.is_predicted,
    } for e in events]


@router.get("/api/cases/{case_id}/timeline/past")
def get_past_timeline(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    events = db.query(Event).filter(
        Event.case_id == case_id, Event.is_predicted == False
    ).order_by(Event.timestamp).all()
    return [{
        "id": e.id, "timestamp": e.timestamp.isoformat() if e.timestamp else "",
        "event_type": e.event_type, "description": e.description,
        "linked_entity_ids": e.linked_entity_ids,
    } for e in events]


@router.get("/api/cases/{case_id}/timeline/predicted")
def get_predicted_timeline(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    events = db.query(Event).filter(
        Event.case_id == case_id, Event.is_predicted == True
    ).order_by(Event.timestamp).all()
    return [{
        "id": e.id, "timestamp": e.timestamp.isoformat() if e.timestamp else "",
        "event_type": e.event_type, "description": e.description,
        "linked_entity_ids": e.linked_entity_ids,
    } for e in events]


# ═══════════════════════════════════════════════════════════════
# Location Tracking Routes
# ═══════════════════════════════════════════════════════════════

@router.get("/api/cases/{case_id}/locations/{person_id}")
def get_location_trail(
    case_id: str, person_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    pings = db.query(LocationPing).filter(
        LocationPing.case_id == case_id,
        LocationPing.person_id == person_id
    ).order_by(LocationPing.timestamp).all()
    return [{
        "lat": p.lat, "lng": p.lng,
        "timestamp": p.timestamp.isoformat() if p.timestamp else "",
    } for p in pings]


@router.get("/api/cases/{case_id}/locations")
def get_all_tracked_locations(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get location data for all tracked persons in a case."""
    store = get_graph_store()
    persons = store.get_all_person_nodes(case_id)
    inner_persons = [p for p in persons if p.get("confidence_band") == "inner"]

    result = []
    for p in inner_persons:
        pings = db.query(LocationPing).filter(
            LocationPing.case_id == case_id,
            LocationPing.person_id == p["id"]
        ).order_by(LocationPing.timestamp).all()
        if pings:
            result.append({
                "person_id": p["id"],
                "name": p.get("name", ""),
                "trail": [{"lat": ping.lat, "lng": ping.lng, "timestamp": ping.timestamp.isoformat()} for ping in pings],
                "last_position": {"lat": pings[-1].lat, "lng": pings[-1].lng}
            })
    return result


# ═══════════════════════════════════════════════════════════════
# Audit Log Routes
# ═══════════════════════════════════════════════════════════════

@router.get("/api/audit-logs")
def get_audit_logs(
    case_id: Optional[str] = None,
    current_user: User = Depends(require_role("admin", "senior_authority")),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)
    if case_id:
        query = query.filter(AuditLog.case_id == case_id)
    logs = query.order_by(AuditLog.timestamp.desc()).limit(500).all()
    return [{
        "id": log.id, "case_id": log.case_id, "user_id": log.user_id,
        "action": log.action, "target_type": log.target_type,
        "target_id": log.target_id, "details": log.details,
        "timestamp": log.timestamp.isoformat() if log.timestamp else "",
    } for log in logs]


# ═══════════════════════════════════════════════════════════════
# Custom Rules Routes
# ═══════════════════════════════════════════════════════════════

@router.post("/api/cases/{case_id}/custom-rules")
def create_custom_rule(
    case_id: str,
    rule: CustomRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    custom_rule = CustomRule(
        case_id=case_id,
        created_by=current_user.id,
        name=rule.name,
        description=rule.description,
        rule_type=rule.rule_type,
        conditions=rule.conditions,
    )
    db.add(custom_rule)
    db.commit()
    db.refresh(custom_rule)
    return {"id": custom_rule.id, "name": custom_rule.name}


@router.get("/api/cases/{case_id}/custom-rules")
def list_custom_rules(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rules = db.query(CustomRule).filter(CustomRule.case_id == case_id).all()
    return [{
        "id": r.id, "name": r.name, "description": r.description,
        "rule_type": r.rule_type, "conditions": r.conditions, "is_active": r.is_active,
    } for r in rules]


# ═══════════════════════════════════════════════════════════════
# Forecasting Route
# ═══════════════════════════════════════════════════════════════

@router.post("/api/cases/{case_id}/forecast")
def run_forecast(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Run predictive forecasting on communication/transaction trends."""
    from app.forecasting import generate_predictions
    predictions = generate_predictions(case_id, db)

    # Save predicted events
    for pred in predictions:
        db.add(Event(
            case_id=case_id,
            timestamp=pred["timestamp"],
            event_type="predicted_event",
            description=pred["description"],
            linked_entity_ids=pred.get("linked_entity_ids", []),
            is_predicted=True,
        ))

    db.commit()
    return {"predictions": predictions, "total": len(predictions)}


# ═══════════════════════════════════════════════════════════════
# AI Investigator Assistant Routes (NVIDIA Nemotron)
# ═══════════════════════════════════════════════════════════════

@router.post("/api/investigator/ask", response_model=InvestigatorAskResponse)
def ask_ai_investigator(
    req: InvestigatorAskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    NVIDIA Nemotron AI Investigator Assistant.
    Provides natural-language answers grounded strictly in authorized case evidence.
    """
    from app.services.evidence_builder import build_investigator_context
    from app.services.nemotron_service import ask_investigator

    case = db.query(Case).filter(Case.id == req.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Selective evidence retrieval
    evidence_context, citations = build_investigator_context(
        db=db,
        case_id=req.case_id,
        question=req.question,
        selected_person_id=req.selected_person_id
    )

    # Call NVIDIA Nemotron service
    result = ask_investigator(
        question=req.question,
        evidence_context=evidence_context,
        citations=citations,
        case_title=case.title
    )

    # Record Audit Log for security and compliance
    try:
        db.add(AuditLog(
            case_id=req.case_id,
            user_id=current_user.id,
            action="ai_investigator_query",
            target_type="investigation",
            target_id=req.selected_person_id or req.case_id,
            details={
                "question": req.question,
                "evidence_citations_count": len(citations),
                "model": result.get("model")
            }
        ))
        db.commit()
    except Exception:
        db.rollback()

    return InvestigatorAskResponse(
        answer=result.get("answer", ""),
        case_id=req.case_id,
        selected_person_id=req.selected_person_id,
        evidence_used=result.get("evidence_used", []),
        model=result.get("model"),
        status=result.get("status", "success")
    )


@router.get("/api/investigator/suggestions/{case_id}")
def get_investigator_suggestions(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Provides intelligent quick-ask suggestion chips customized for the case.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    persons = db.query(Person).filter(Person.case_id == case_id).order_by(Person.suspicion_score.desc()).all()
    suggestions = [
        "Summarize the key findings and structure of this case",
        "What suspicious patterns and anomalies were detected?",
        "Analyze the financial Hawala transactions and money flow"
    ]

    if len(persons) >= 1:
        top_name = persons[0].name
        suggestions.insert(1, f"Why is {top_name} identified as a key suspect?")

    if len(persons) >= 2:
        p1 = persons[0].name
        p2 = persons[1].name
        suggestions.insert(2, f"Explain the relationship and links between {p1} and {p2}")

    return {
        "case_id": case_id,
        "case_title": case.title,
        "suggestions": suggestions
    }
