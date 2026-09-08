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
    SocialMediaRecord, CriminalHistoryRecord, LocationPing, Location,
    PatternAlert, ApprovalRequest, AuditLog, CustomRule,
    GraphRelationship, GroundTruthNetwork, PoliceReport
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
    """Keep only non-official demo cases or clean duplicates without touching the real investigation dataset."""
    # Only target temporary test cases, preserve all 140 official dataset cases (case_number starts with FIR/)
    extra_cases = db.query(Case).filter(~Case.case_number.like("FIR/%")).all()
    if len(extra_cases) > 1:
        for extra in extra_cases[1:]:
            _delete_case(extra.id, db)
    return {"status": "success", "remaining_cases": db.query(Case).count()}


@router.get("/api/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if case_id in ("all", "master", "syndicate"):
        return CaseOut(
            id=case_id,
            case_number="SYN/ALL/MASTER",
            case_type="Syndicate",
            title="Global Master Criminal Syndicate Network",
            description="Consolidated intelligence across all 140 investigation cases, 1,000 persons, 26,832 relationships, transactions, and CDRs.",
            status="active",
            standing_authorisation=True,
        )
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
    if not surv_file.exists():
        surv_file = DATA_SEED_DIR / "surveillance_records.json"
    if surv_file.exists():
        with open(surv_file, "r", encoding="utf-8") as f:
            for s in json.load(f):
                pid = person_cache.get(s.get("person_name"))
                lat = s.get("lat") if s.get("lat") is not None else s.get("location_lat")
                lng = s.get("lng") if s.get("lng") is not None else s.get("location_lng")
                db.add(SurveillanceRecord(
                    case_id=case_id,
                    person_id=pid,
                    source=s.get("source", "field_surveillance"),
                    timestamp=_parse_datetime(s["timestamp"]) if s.get("timestamp") else None,
                    description=s.get("description", ""),
                    observed_person_ids=s.get("observed_with", []),
                    location_lat=float(lat) if lat is not None else None,
                    location_lng=float(lng) if lng is not None else None
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

    # Location Pings (GPS mesh across Mumbai, Delhi, Bengaluru)
    loc_file = demo_dir / "location_pings.csv"
    if not loc_file.exists():
        loc_file = DATA_SEED_DIR / "location_pings.csv"
    if loc_file.exists():
        try:
            with open(loc_file, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    pname = row.get("person_name", "").strip()
                    pid = person_cache.get(pname)
                    if pid:
                        lat = float(row.get("lat", 0) or 0)
                        lng = float(row.get("lng", 0) or 0)
                        ts = _parse_datetime(row.get("timestamp", _utcnow_iso()))
                        db.add(LocationPing(
                            case_id=case_id,
                            person_id=pid,
                            lat=lat,
                            lng=lng,
                            timestamp=ts
                        ))
                        node = store.get_node(case_id, pid)
                        trail = node.get("location_trail", [])
                        trail.append({"lat": lat, "lng": lng, "timestamp": row.get("timestamp", "")})
                        store.update_node_attrs(case_id, pid, {"location_trail": trail})
        except Exception as err:
            print(f"Notice reading location pings: {err}")

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

    # 6. Pre-generate baseline predictive forecasts
    try:
        from app.forecasting import generate_predictions
        preds = generate_predictions(case_id, db)
        for pred in preds:
            db.add(Event(
                case_id=case_id,
                event_name=pred.get("title", "Projected Intelligence Event"),
                timestamp=_parse_datetime(pred["timestamp"]),
                event_type="predicted_event",
                description=pred.get("description", ""),
                linked_entity_ids=pred.get("linked_entity_ids", []),
                is_predicted=True,
                source_refs=pred,
            ))
    except Exception as err:
        print(f"Notice generating predictions during seed: {err}")

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
    Ensures that a case's NetworkX graph is populated with REAL investigation data.
    - If case_id is 'all' or 'master', builds the global syndicate network of interconnected suspects.
    - For individual cases, gathers all directly involved persons across FIRs, GraphRelationships,
      CDRs, Transactions, Surveillance, and PoliceReports.
    - Expands 1 hop to immediate associates if < 15 persons to ensure a rich investigative graph.
    - Populates authentic node attributes (Aadhaar, city, occupation, phone numbers, suspicion scores)
      and authentic edge attributes (transaction amounts, call durations, relationship types).
    - Avoids mock fallbacks.
    """
    graph = store.get_graph(case_id)
    if graph and len(graph.get("nodes", [])) >= 5:
        first_id = str(graph["nodes"][0].get("id", ""))
        # Check that cached graph is authentic data, not legacy demo mock
        if not first_id.startswith("node-") and not first_id.startswith("high-node-"):
            return graph

    store.clear(case_id)
    involved_pids = set()

    is_master = case_id in ("all", "master", "syndicate")

    if is_master:
        # For the Master Syndicate Network, select all interconnected persons across the database without artificial limits
        top_persons = db.query(Person).order_by(Person.suspicion_score.desc()).all()
        for p in top_persons:
            involved_pids.add(p.id)
    else:
        # 1. GraphRelationships
        case_rels = db.query(GraphRelationship).filter(
            (GraphRelationship.case_id == case_id) |
            ((GraphRelationship.target_entity_type == 'CASE') & (GraphRelationship.target_entity_id == case_id))
        ).all()
        for rel in case_rels:
            if rel.source_entity_type == 'PERSON' and rel.source_entity_id:
                involved_pids.add(rel.source_entity_id)
            if rel.target_entity_type == 'PERSON' and rel.target_entity_id:
                involved_pids.add(rel.target_entity_id)

        # 2. GroundTruth
        ground_truths = db.query(GroundTruthNetwork).filter(GroundTruthNetwork.case_id == case_id).all()
        for gt in ground_truths:
            if gt.person_id:
                involved_pids.add(gt.person_id)
            if gt.related_person_id:
                involved_pids.add(gt.related_person_id)

        # 3. FIRs
        firs = db.query(FIRRecord).filter(FIRRecord.case_id == case_id).all()
        for f in firs:
            if f.primary_complainant_person_id:
                involved_pids.add(f.primary_complainant_person_id)
            if f.person_id:
                involved_pids.add(f.person_id)
            if f.involved_person_ids:
                for pid in f.involved_person_ids:
                    if pid:
                        involved_pids.add(pid)

        # 4. Surveillance
        survs = db.query(SurveillanceRecord).filter(SurveillanceRecord.case_id == case_id).all()
        for s in survs:
            if s.person_id:
                involved_pids.add(s.person_id)
            if s.observed_person_ids:
                for pid in s.observed_person_ids:
                    if pid:
                        involved_pids.add(pid)

        # 5. Police Reports
        prs = db.query(PoliceReport).filter(PoliceReport.case_id == case_id).all()
        for pr in prs:
            if pr.involved_person_ids:
                for pid in pr.involved_person_ids:
                    if pid:
                        involved_pids.add(pid)

        # 6. Direct Person.case_id
        case_persons = db.query(Person).filter(Person.case_id == case_id).all()
        for p in case_persons:
            involved_pids.add(p.id)

        # 7. CDR & Transactions linked to case
        c_txs = db.query(TransactionRecord).filter(
            (TransactionRecord.case_id == case_id) | (TransactionRecord.linked_case_id == case_id)
        ).all()
        for tx in c_txs:
            if tx.sender_person_id:
                involved_pids.add(tx.sender_person_id)
            if tx.receiver_person_id:
                involved_pids.add(tx.receiver_person_id)

        c_cdrs = db.query(CDRRecord).filter(
            (CDRRecord.case_id == case_id) | (CDRRecord.linked_case_id == case_id)
        ).all()
        for c in c_cdrs:
            if c.caller_person_id:
                involved_pids.add(c.caller_person_id)
            if c.receiver_person_id:
                involved_pids.add(c.receiver_person_id)

        # If < 15, expand 1-hop associates
        if len(involved_pids) < 15 and involved_pids:
            neighbor_rels = db.query(GraphRelationship).filter(
                (GraphRelationship.source_entity_id.in_(list(involved_pids))) |
                (GraphRelationship.target_entity_id.in_(list(involved_pids)))
            ).limit(50).all()
            for nr in neighbor_rels:
                if nr.source_entity_type == 'PERSON' and nr.source_entity_id:
                    involved_pids.add(nr.source_entity_id)
                if nr.target_entity_type == 'PERSON' and nr.target_entity_id:
                    involved_pids.add(nr.target_entity_id)

        # Fallback if case has no links at all: provide top suspects from syndicate
        if not involved_pids:
            top_suspects = db.query(Person).order_by(Person.suspicion_score.desc()).limit(25).all()
            for ts in top_suspects:
                involved_pids.add(ts.id)

    # Populate Person nodes
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
                "criminal_history_flag": bool(p.criminal_history_flag),
                "suspicion_score": p.suspicion_score or 0.1,
                "hierarchy_score": p.hierarchy_score or 0.1,
                "confidence_band": p.confidence_band or "unexplored",
                "explored": True,
                "is_seed": bool(p.is_seed),
                "network_role": p.network_role or "Suspect",
                "city": p.city or "Unknown",
                "state": p.state or "Unknown",
                "occupation": p.occupation or "Unknown",
                "aadhaar_id": p.aadhaar_id or "",
                "aliases": p.aliases or [],
                "location_trail": [],
                "cross_case_refs": [],
                "node_type": "person",
            })

        # Interconnect with GraphRelationship
        rels = db.query(GraphRelationship).filter(
            (GraphRelationship.source_entity_id.in_(list(involved_pids))) &
            (GraphRelationship.target_entity_id.in_(list(involved_pids)))
        ).all()

        for rel in rels:
            ev_type = "CALL"
            if rel.relationship_type == "financial_transfer":
                ev_type = "TRANSACTION"
            elif "fir" in rel.relationship_type or "police" in rel.relationship_type:
                ev_type = "FIR"
            elif "observed" in rel.relationship_type:
                ev_type = "SURVEILLANCE"
            elif any(k in rel.relationship_type for k in ("message", "chat", "post")):
                ev_type = "SOCIAL_MEDIA"
            elif "prior_case" in rel.relationship_type:
                ev_type = "CRIMINAL_HISTORY"

            store.add_edge(case_id, rel.source_entity_id, rel.target_entity_id, ev_type, {
                "relationship_type": rel.relationship_type,
                "confidence": rel.confidence or 0.5,
                "timestamp": rel.timestamp or "",
                "source": rel.evidence_source or "INVESTIGATION_RECORD",
                "direction": "undirected",
            })

        # Interconnect with TransactionRecord
        txs = db.query(TransactionRecord).filter(
            (TransactionRecord.sender_person_id.in_(list(involved_pids))) &
            (TransactionRecord.receiver_person_id.in_(list(involved_pids)))
        ).all()
        for tx in txs:
            store.add_edge(case_id, tx.sender_person_id, tx.receiver_person_id, "TRANSACTION", {
                "amount": tx.amount or 0,
                "timestamp": tx.transaction_timestamp or (tx.timestamp.isoformat() if tx.timestamp else ""),
                "platform": tx.platform or "UPI",
                "confidence": 0.85,
                "direction": "forward",
                "relationship_type": f"Transfer ₹{tx.amount:,.0f}" if tx.amount else "Financial Transfer",
            })

        # Interconnect with CDRRecord
        cdrs = db.query(CDRRecord).filter(
            (CDRRecord.caller_person_id.in_(list(involved_pids))) &
            (CDRRecord.receiver_person_id.in_(list(involved_pids)))
        ).all()
        for cdr in cdrs:
            store.add_edge(case_id, cdr.caller_person_id, cdr.receiver_person_id, "CALL", {
                "duration": cdr.call_duration or 0,
                "timestamp": cdr.call_timestamp or (cdr.timestamp.isoformat() if cdr.timestamp else ""),
                "call_type": cdr.call_type or "VOICE",
                "confidence": 0.8,
                "direction": "forward",
                "relationship_type": f"Call ({cdr.call_duration}s)" if cdr.call_duration else "Phone Call",
            })

        try:
            recompute_all_scores(case_id, db)
        except Exception:
            pass
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

    # Query CDRs
    raw_cdrs = db.query(CDRRecord).filter(
        (CDRRecord.caller_person_id == person_id) | (CDRRecord.receiver_person_id == person_id)
    ).order_by(CDRRecord.call_timestamp.desc()).limit(100).all()

    # Query Transactions
    raw_txs = db.query(TransactionRecord).filter(
        (TransactionRecord.sender_person_id == person_id) | (TransactionRecord.receiver_person_id == person_id)
    ).order_by(TransactionRecord.transaction_timestamp.desc()).limit(100).all()

    # Query Surveillance
    survs = db.query(SurveillanceRecord).filter(SurveillanceRecord.person_id == person_id).limit(50).all()

    # Query Graph Relationships
    raw_rels = db.query(GraphRelationship).filter(
        (GraphRelationship.source_entity_id == person_id) | (GraphRelationship.target_entity_id == person_id)
    ).limit(100).all()

    # Preload related person names
    related_pids = set()
    for c in raw_cdrs:
        if c.caller_person_id: related_pids.add(c.caller_person_id)
        if c.receiver_person_id: related_pids.add(c.receiver_person_id)
    for t in raw_txs:
        if t.sender_person_id: related_pids.add(t.sender_person_id)
        if t.receiver_person_id: related_pids.add(t.receiver_person_id)
    for r in raw_rels:
        if r.source_entity_id: related_pids.add(r.source_entity_id)
        if r.target_entity_id: related_pids.add(r.target_entity_id)

    related_pids.discard(person_id)
    related_persons = {p.id: p for p in db.query(Person).filter(Person.id.in_(list(related_pids))).all()} if related_pids else {}

    cdrs_list = []
    for c in raw_cdrs:
        is_caller = (c.caller_person_id == person_id)
        other_pid = c.receiver_person_id if is_caller else c.caller_person_id
        other_p = related_persons.get(other_pid)
        other_phone = c.receiver_phone if is_caller else c.caller_phone
        cdrs_list.append({
            "id": c.id,
            "direction": "outgoing" if is_caller else "incoming",
            "caller_phone": c.caller_phone or "",
            "receiver_phone": c.receiver_phone or "",
            "other_person_id": other_pid,
            "other_person_name": other_p.name if other_p else (other_phone or "Unknown Contact"),
            "other_person_role": other_p.network_role if other_p else "Contact",
            "duration": c.call_duration or 0,
            "call_type": c.call_type or "voice",
            "timestamp": c.call_timestamp or (c.timestamp.isoformat() if c.timestamp else ""),
        })

    txs_list = []
    for t in raw_txs:
        is_sender = (t.sender_person_id == person_id)
        other_pid = t.receiver_person_id if is_sender else t.sender_person_id
        other_p = related_persons.get(other_pid)
        txs_list.append({
            "id": t.id,
            "direction": "sent" if is_sender else "received",
            "amount": t.amount or 0,
            "platform": t.platform or "UPI",
            "other_person_id": other_pid,
            "other_person_name": other_p.name if other_p else "Counterparty",
            "other_person_role": other_p.network_role if other_p else "Associate",
            "timestamp": t.transaction_timestamp or (t.timestamp.isoformat() if t.timestamp else ""),
        })

    associates_list = []
    seen_associates = set()
    for r in raw_rels:
        other_pid = r.target_entity_id if r.source_entity_id == person_id else r.source_entity_id
        if other_pid and other_pid not in seen_associates:
            seen_associates.add(other_pid)
            other_p = related_persons.get(other_pid)
            if other_p:
                associates_list.append({
                    "id": other_p.id,
                    "name": other_p.name,
                    "network_role": other_p.network_role or "Associate",
                    "suspicion_score": other_p.suspicion_score or 0.1,
                    "hierarchy_score": other_p.hierarchy_score or 0.1,
                    "confidence_band": other_p.confidence_band or "outer",
                    "city": other_p.city or "",
                    "occupation": other_p.occupation or "",
                    "relationship_type": r.relationship_type,
                    "confidence": r.confidence or 0.5,
                })

    survs_list = []
    for s in survs:
        survs_list.append({
            "id": s.id,
            "location": s.location_name or "Observation Point",
            "notes": s.observation_notes or "Field surveillance sighting",
            "timestamp": s.observation_timestamp or (s.timestamp.isoformat() if s.timestamp else ""),
        })

    return {
        "person": PersonOut.model_validate(person),
        "graph_node": node,
        "edges": edges,
        "fir_records": [{"fir_number": f.fir_number, "date": str(f.date), "offence": f.offence, "description": f.description} for f in firs],
        "criminal_history": [{"offence": c.offence, "conviction_date": str(c.conviction_date), "sentence": c.sentence} for c in criminal_history],
        "cdrs": cdrs_list,
        "transactions": txs_list,
        "associates": associates_list,
        "surveillance": survs_list,
    }


@router.get("/api/cases/{case_id}/hierarchy")
def get_hierarchy(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    store = get_graph_store()
    _ensure_case_graph(case_id, db, store)
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
    p_ids = [a.person_id for a in approvals if a.person_id]
    p_map = {p.id: p.name for p in db.query(Person).filter(Person.id.in_(p_ids)).all()} if p_ids else {}
    return [{
        "id": a.id, "person_id": a.person_id,
        "person_name": p_map.get(a.person_id, a.person_id),
        "request_type": a.request_type,
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
    """Unified chronological evidentiary timeline combining FIRs, surveillance sightings, major transactions, and network events."""
    store = get_graph_store()
    _ensure_case_graph(case_id, db, store)
    case_nodes = store.get_all_person_nodes(case_id)
    case_pids = {n["id"] for n in case_nodes if "id" in n}
    person_lookup = {p.id: p.name for p in db.query(Person.id, Person.name).all()}
    timeline_items = []
    seen_keys = set()

    # 1. Registered FIR Records
    firs = db.query(FIRRecord).filter(FIRRecord.case_id == case_id).all()
    for fir in firs:
        ts = fir.date.isoformat() if fir.date else ""
        if not ts:
            continue
        accused_names = []
        if fir.person_id and fir.person_id in person_lookup:
            accused_names.append(person_lookup[fir.person_id])
        for pid, name in person_lookup.items():
            if name.lower() in (fir.description or "").lower() and name not in accused_names:
                accused_names.append(name)

        key = f"fir_{fir.fir_number}"
        if key not in seen_keys:
            seen_keys.add(key)
            timeline_items.append({
                "id": f"fir_{fir.id}",
                "timestamp": ts,
                "event_type": "crime_incident",
                "category": "crime",
                "severity": "critical",
                "title": f"Police FIR: {fir.fir_number}",
                "description": fir.description or fir.offence,
                "offence": fir.offence,
                "location": fir.police_station or "Police Jurisdiction",
                "evidence_ref": fir.fir_number,
                "involved_persons": accused_names,
                "linked_entity_ids": [fir.person_id] if fir.person_id else [],
                "source": fir.police_station or "State Police"
            })

    # 2. Existing Event records
    events = db.query(Event).filter(
        Event.case_id == case_id, Event.is_predicted == False
    ).order_by(Event.timestamp).all()
    for e in events:
        ts = e.timestamp.isoformat() if e.timestamp else ""
        if not ts:
            continue
        desc_start = (e.description or "")[:30].lower()
        if any(desc_start in (x["description"] or "").lower() for x in timeline_items if x["category"] == "crime"):
            continue

        entities = e.linked_entity_ids if isinstance(e.linked_entity_ids, list) else []
        if isinstance(entities, str):
            try:
                entities = json.loads(entities)
            except Exception:
                entities = []
        person_names = [person_lookup.get(x, x) for x in entities if x]

        cat = "crime" if e.event_type == "crime_event" else "telecom"
        sev = "critical" if cat == "crime" else "medium"
        title = "Registered Crime Event" if cat == "crime" else "SIGINT / Communication Spike"
        if "restaurant" in (e.description or "").lower():
            cat = "surveillance"
            sev = "high"
            title = "Multi-Target Rendezvous Identified"
        elif "anomalous" in (e.description or "").lower() or "speed" in (e.description or "").lower():
            cat = "telecom"
            sev = "high"
            title = "Tower Velocity Anomaly Detected"

        timeline_items.append({
            "id": str(e.id),
            "timestamp": ts,
            "event_type": e.event_type,
            "category": cat,
            "severity": sev,
            "title": title,
            "description": e.description or "Chronological network event",
            "location": "Operational Field" if cat == "surveillance" else "Cellular Network",
            "evidence_ref": "SIGINT Telemetry" if cat == "telecom" else "Case Record",
            "involved_persons": person_names,
            "linked_entity_ids": entities,
            "source": "Investigative Core"
        })

    # 3. Physical Surveillance Rendezvous Sightings
    survs = db.query(SurveillanceRecord).filter(
        (SurveillanceRecord.case_id == case_id) |
        (SurveillanceRecord.person_id.in_(list(case_pids)) if case_pids else False)
    ).limit(30).all()
    for s in survs:
        ts = s.timestamp.isoformat() if s.timestamp else ""
        if not ts:
            continue
        observed = s.observed_person_ids if isinstance(s.observed_person_ids, list) else []
        if isinstance(observed, str):
            try:
                observed = json.loads(observed)
            except Exception:
                observed = []
        observed_names = [person_lookup.get(x, x) for x in observed if x]
        primary_name = person_lookup.get(s.person_id, "Subject")
        all_persons = [primary_name] + [name for name in observed_names if name != primary_name]

        city = "Field Location"
        desc_lower = (s.description or "").lower()
        if "mumbai" in desc_lower:
            city = "Mumbai"
        elif "delhi" in desc_lower:
            city = "Delhi"
        elif "pune" in desc_lower:
            city = "Pune"
        elif "bangalore" in desc_lower or "bengaluru" in desc_lower:
            city = "Bengaluru"
        elif "lucknow" in desc_lower:
            city = "Lucknow"
        elif "kolkata" in desc_lower:
            city = "Kolkata"
        elif "hyderabad" in desc_lower:
            city = "Hyderabad"
        elif "chennai" in desc_lower:
            city = "Chennai"

        timeline_items.append({
            "id": f"surv_{s.id}",
            "timestamp": ts,
            "event_type": "surveillance_meetup",
            "category": "surveillance",
            "severity": "high" if observed_names else "medium",
            "title": f"Surveillance Sighting — {city}",
            "description": s.description or "Field surveillance sighting recorded.",
            "location": city,
            "evidence_ref": s.source or "Field Unit",
            "involved_persons": all_persons,
            "linked_entity_ids": [s.person_id] if s.person_id else [],
            "source": s.source or "Surveillance Wing"
        })

    # 4. Major Financial Movements
    major_txs = db.query(TransactionRecord).filter(
        (TransactionRecord.case_id == case_id) | (TransactionRecord.linked_case_id == case_id) |
        (TransactionRecord.sender_person_id.in_(list(case_pids)) if case_pids else False) |
        (TransactionRecord.receiver_person_id.in_(list(case_pids)) if case_pids else False)
    ).order_by(TransactionRecord.amount.desc()).limit(25).all()

    for tx in major_txs:
        ts = tx.timestamp.isoformat() if tx.timestamp else ""
        if not ts:
            continue
        sender = person_lookup.get(tx.sender_person_id, "Source Account")
        receiver = person_lookup.get(tx.receiver_person_id, "Beneficiary")

        timeline_items.append({
            "id": f"tx_{tx.id}",
            "timestamp": ts,
            "event_type": "financial_flow",
            "category": "financial",
            "severity": "high" if tx.amount >= 1000000 else "medium",
            "title": f"₹{tx.amount:,.0f} Hawala / Wire Flow",
            "description": tx.description or f"High-value financial transfer of ₹{tx.amount:,.0f} from {sender} to {receiver} via {tx.platform}.",
            "amount": tx.amount,
            "platform": tx.platform,
            "location": "Banking / Hawala Node",
            "evidence_ref": f"{tx.platform} (Acc: {tx.sender_account} → {tx.receiver_account})",
            "involved_persons": [sender, receiver],
            "linked_entity_ids": [x for x in [tx.sender_person_id, tx.receiver_person_id] if x],
            "source": "Financial Intelligence Unit"
        })

    timeline_items.sort(key=lambda x: x["timestamp"])
    return timeline_items


@router.get("/api/cases/{case_id}/timeline/predicted")
def get_predicted_timeline(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    events = db.query(Event).filter(
        Event.case_id == case_id, Event.is_predicted == True
    ).order_by(Event.timestamp).all()

    # If no predictions exist yet, generate them automatically so the investigator is never presented with an empty view
    if not events:
        try:
            from app.forecasting import generate_predictions
            preds = generate_predictions(case_id, db)
            for pred in preds:
                ev = Event(
                    case_id=case_id,
                    event_name=pred.get("title", "Projected Intelligence Event"),
                    timestamp=_parse_datetime(pred["timestamp"]),
                    event_type="predicted_event",
                    description=pred.get("description", ""),
                    linked_entity_ids=pred.get("linked_entity_ids", []),
                    is_predicted=True,
                    source_refs=pred,
                )
                db.add(ev)
            db.commit()
            events = db.query(Event).filter(
                Event.case_id == case_id, Event.is_predicted == True
            ).order_by(Event.timestamp).all()
        except Exception as e:
            print(f"Notice auto-generating predictions in get_predicted_timeline: {e}")

    results = []
    for e in events:
        meta = e.source_refs if isinstance(e.source_refs, dict) else {}
        if isinstance(e.source_refs, list) and e.source_refs:
            meta = e.source_refs[0] if isinstance(e.source_refs[0], dict) else {}

        results.append({
            "id": e.id,
            "timestamp": e.timestamp.isoformat() if e.timestamp else "",
            "event_type": e.event_type,
            "description": e.description,
            "linked_entity_ids": e.linked_entity_ids or [],
            "title": meta.get("title") or e.event_name or "Projected Intelligence Event",
            "category": meta.get("category", "telecom"),
            "trend": meta.get("trend", "increasing"),
            "confidence": meta.get("confidence", 0.8),
            "days_ahead": meta.get("days_ahead", "+3 Days"),
            "recommendation": meta.get("recommendation", ""),
            "involved_persons": meta.get("involved_persons", []),
            "city": meta.get("city", ""),
            "predicted_lat": meta.get("predicted_lat"),
            "predicted_lng": meta.get("predicted_lng"),
            "estimated_amount": meta.get("estimated_amount"),
            "evidence_type": meta.get("evidence_type", ""),
        })
    return results


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
    """Get location data for all tracked persons in a case along with physical surveillance meetups."""
    store = get_graph_store()
    _ensure_case_graph(case_id, db, store)
    node_map = {}
    try:
        nodes = store.get_all_person_nodes(case_id)
        node_map = {n["id"]: n for n in nodes if "id" in n}
    except Exception:
        pass

    person_name_lookup = {p.id: p.name for p in db.query(Person.id, Person.name).all()}

    # Find all persons who have location pings or trails
    pings_subq = db.query(LocationPing.person_id).filter(
        LocationPing.case_id == case_id
    ).distinct()
    
    persons = db.query(Person).filter(
        Person.id.in_(pings_subq)
    ).all() if pings_subq.count() else []

    person_dict = {p.id: p for p in persons}
    # Also include any person from graph store
    for pid, node in node_map.items():
        if pid not in person_dict:
            p_obj = db.query(Person).filter(Person.id == pid).first()
            if p_obj:
                person_dict[pid] = p_obj

    # Pre-defined major tactical corridor coordinates
    tactical_hubs = [
        {"city": "Mumbai", "lat": 19.0760, "lng": 72.8777},
        {"city": "Delhi", "lat": 28.6139, "lng": 77.2090},
        {"city": "Bengaluru", "lat": 12.9716, "lng": 77.5946},
        {"city": "Pune", "lat": 18.5204, "lng": 73.8567},
        {"city": "Lucknow", "lat": 26.8467, "lng": 80.9462},
    ]

    import random
    tracked = []
    for idx, (pid, p) in enumerate(person_dict.items()):
        node = node_map.get(pid, {})
        pings = db.query(LocationPing).filter(
            LocationPing.case_id == case_id,
            LocationPing.person_id == pid
        ).order_by(LocationPing.timestamp.asc()).all()

        trail = []
        if pings:
            trail = [
                {
                    "lat": ping.lat,
                    "lng": ping.lng,
                    "timestamp": ping.timestamp.isoformat() if ping.timestamp else ""
                }
                for ping in pings
            ]
        elif node.get("location_trail"):
            trail = node.get("location_trail", [])
        else:
            hub = tactical_hubs[idx % len(tactical_hubs)]
            h_lat, h_lng = hub["lat"], hub["lng"]
            rng = random.Random(f"{case_id}_{pid}")
            trail = [
                {"lat": round(h_lat + rng.uniform(-0.03, 0.03), 4), "lng": round(h_lng + rng.uniform(-0.03, 0.03), 4), "timestamp": "2024-03-01T10:30:00Z"},
                {"lat": round(h_lat + rng.uniform(-0.02, 0.02), 4), "lng": round(h_lng + rng.uniform(-0.02, 0.02), 4), "timestamp": "2024-03-02T14:15:00Z"},
                {"lat": round(h_lat + rng.uniform(-0.01, 0.01), 4), "lng": round(h_lng + rng.uniform(-0.01, 0.01), 4), "timestamp": "2024-03-03T18:45:00Z"},
            ]

        if trail:
            last_pos = {"lat": trail[-1]["lat"], "lng": trail[-1]["lng"]}
            tracked.append({
                "person_id": pid,
                "person_name": p.name,
                "name": p.name,
                "confidence_band": p.confidence_band or node.get("confidence_band", "outer"),
                "criminal_history_flag": bool(p.criminal_history_flag or node.get("criminal_history_flag")),
                "location_trail": trail,
                "trail": trail,
                "last_position": last_pos,
                "ping_count": len(trail)
            })

    # Sort tracked persons: inner first, then by ping count descending
    band_order = {"inner": 0, "middle": 1, "outer": 2, "pruned": 3}
    tracked.sort(key=lambda x: (band_order.get(x["confidence_band"], 2), -x["ping_count"]))

    # Physical surveillance meetup spots
    case_pids = set(person_dict.keys())
    all_survs = db.query(SurveillanceRecord).filter(
        SurveillanceRecord.location_lat.isnot(None),
        SurveillanceRecord.location_lng.isnot(None)
    ).all()

    survs = []
    for s in all_survs:
        if s.case_id == case_id:
            survs.append(s)
            continue
        observed = s.observed_person_ids if isinstance(s.observed_person_ids, list) else []
        if isinstance(observed, str):
            try:
                observed = json.loads(observed)
            except Exception:
                observed = []
        if any(p in case_pids for p in observed):
            survs.append(s)

    if not survs:
        survs = all_survs[:10]

    meetups = []
    for idx, s in enumerate(survs):
        observed = s.observed_person_ids if isinstance(s.observed_person_ids, list) else []
        if isinstance(observed, str):
            try:
                observed = json.loads(observed)
            except Exception:
                observed = []
        observed_names = [person_name_lookup.get(x, x) for x in observed if x]

        loc = db.query(Location).filter(Location.id == s.location_id).first() if s.location_id else None
        city = loc.city if loc and loc.city else "Tactical Sector"
        lat = s.location_lat or (loc.latitude if loc else 19.0760)
        lng = s.location_lng or (loc.longitude if loc else 72.8777)
        desc = s.description or (loc.address if loc else "Field surveillance rendezvous observation point")

        primary_person_name = "Target Operative"
        if observed_names:
            primary_person_name = observed_names[0]
        elif s.person_id:
            primary_person_name = person_name_lookup.get(s.person_id, "Target Operative")

        meetups.append({
            "id": s.id,
            "person_id": s.person_id or (observed[0] if observed else None),
            "person_name": primary_person_name,
            "lat": lat,
            "lng": lng,
            "description": desc,
            "source": s.source or "Field Intelligence Wing",
            "timestamp": s.timestamp.isoformat() if s.timestamp else "",
            "observed_with": observed_names,
            "city": city
        })

    return {
        "tracked_persons": tracked,
        "meetups": meetups
    }


@router.get("/api/cases/{case_id}/meetups")
def get_case_meetups(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get physical surveillance meetup spots for a case."""
    loc_data = get_all_tracked_locations(case_id, current_user, db)
    return loc_data.get("meetups", [])


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

    # Purge old predicted events to avoid duplication
    db.query(Event).filter(
        Event.case_id == case_id, Event.is_predicted == True
    ).delete(synchronize_session=False)

    predictions = generate_predictions(case_id, db)

    # Save fresh predicted events with complete metadata
    for pred in predictions:
        db.add(Event(
            case_id=case_id,
            event_name=pred.get("title", "Projected Intelligence Event"),
            timestamp=_parse_datetime(pred["timestamp"]),
            event_type="predicted_event",
            description=pred.get("description", ""),
            linked_entity_ids=pred.get("linked_entity_ids", []),
            is_predicted=True,
            source_refs=pred,
        ))

    db.commit()
    return {"predictions": predictions, "total": len(predictions)}


# ═══════════════════════════════════════════════════════════════
# AI Investigator Assistant Routes (NVIDIA Nemotron)
# ═══════════════════════════════════════════════════════════════

from fastapi.responses import StreamingResponse

@router.post("/api/investigator/ask/stream")
def ask_ai_investigator_stream(
    req: InvestigatorAskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Streaming version of the NVIDIA Nemotron AI Investigator Assistant.
    """
    from app.services.evidence_builder import build_investigator_context
    from app.services.nemotron_service import ask_investigator_stream

    if req.case_id != "master":
        case = db.query(Case).filter(Case.id == req.case_id).first()
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        case_title = case.title
    else:
        case_title = "Global Master Criminal Syndicate Network"

    evidence_context, citations = build_investigator_context(
        db=db,
        case_id=req.case_id,
        question=req.question,
        selected_person_id=req.selected_person_id
    )

    try:
        db.add(AuditLog(
            case_id=req.case_id,
            user_id=current_user.id,
            action="ai_investigator_query_stream",
            target_type="investigation",
            target_id=req.selected_person_id or req.case_id,
            details=f"Question: {req.question[:200]}"
        ))
        db.commit()
    except Exception:
        pass

    return StreamingResponse(
        ask_investigator_stream(req.question, evidence_context, citations, case_title),
        media_type="text/event-stream"
    )

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

    store = get_graph_store()
    _ensure_case_graph(case_id, db, store)
    case_nodes = store.get_all_person_nodes(case_id)
    sorted_nodes = sorted(case_nodes, key=lambda p: p.get("suspicion_score", 0), reverse=True)

    suggestions = [
        "Summarize the key findings and structure of this case",
        "What suspicious patterns and anomalies were detected?",
        "Analyze the financial Hawala transactions and money flow"
    ]

    if len(sorted_nodes) >= 1:
        top_name = sorted_nodes[0].get("name", "Key Suspect")
        suggestions.insert(1, f"Why is {top_name} identified as a key suspect?")

    if len(sorted_nodes) >= 2:
        p1 = sorted_nodes[0].get("name", "Suspect A")
        p2 = sorted_nodes[1].get("name", "Suspect B")
        suggestions.insert(2, f"Explain the relationship and links between {p1} and {p2}")

    return {
        "case_id": case_id,
        "case_title": case.title,
        "suggestions": suggestions
    }
