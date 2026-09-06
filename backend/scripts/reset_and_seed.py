"""
reset_and_seed.py

Completely purges all legacy database data and cached graphs,
re-initializes the database with standard users,
creates the primary clean case 'Operation Garuda',
seeds the focused 7-person multi-source dataset,
and runs all pattern detectors to surface actionable intelligence alerts.
"""

import os
import sys
import shutil
import json
from pathlib import Path
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.database import engine, Base, SessionLocal, init_db
from app.models import (
    User, Case, CaseInvestigator, Person, Edge, Event,
    CDRRecord, TransactionRecord, FIRRecord, SurveillanceRecord,
    SocialMediaRecord, CriminalHistoryRecord, LocationPing,
    PatternAlert, ApprovalRequest, AuditLog
)
from app.auth import hash_password
from app.graph_store import get_graph_store
from app.scoring import recompute_all_scores
from app.detectors import run_all_detectors
from app.routes import _parse_batch_json


def reset_and_seed():
    print("=" * 60)
    print("PURGING ALL CURRENT DATA...")
    print("=" * 60)

    # 1. Close all sessions and drop all tables
    db = SessionLocal()
    try:
        # Delete from all tables cleanly
        db.query(AuditLog).delete()
        db.query(PatternAlert).delete()
        db.query(ApprovalRequest).delete()
        db.query(CDRRecord).delete()
        db.query(TransactionRecord).delete()
        db.query(FIRRecord).delete()
        db.query(SurveillanceRecord).delete()
        db.query(SocialMediaRecord).delete()
        db.query(CriminalHistoryRecord).delete()
        db.query(LocationPing).delete()
        db.query(Event).delete()
        db.query(Edge).delete()
        db.query(Person).delete()
        db.query(CaseInvestigator).delete()
        db.query(Case).delete()
        db.query(User).delete()
        db.commit()
    except Exception as e:
        print(f"Notice during table purge: {e}")
        db.rollback()
    finally:
        db.close()

    # 2. Clear graph store pickle files & in-memory cache
    store = get_graph_store()
    store.clear("case-garuda-001")
    graphs_dir = BACKEND_DIR / "data" / "graphs"
    if graphs_dir.exists():
        for item in list(graphs_dir.glob("*.pkl")) + list(graphs_dir.glob("*.gpickle")):
            try:
                item.unlink(missing_ok=True)
            except Exception as e:
                print(f"Could not delete {item}: {e}")
    graphs_dir.mkdir(parents=True, exist_ok=True)
    print("[OK] Legacy tables and graph caches cleared.")

    # 3. Re-init tables & default users
    init_db()
    db = SessionLocal()

    admin_user = User(
        username="admin", email="admin@cnap.local",
        hashed_password=hash_password("admin123"),
        full_name="System Administrator", role="admin"
    )
    investigator_user = User(
        username="investigator", email="investigator@cnap.local",
        hashed_password=hash_password("invest123"),
        full_name="Det. Rajesh Kumar", role="investigator"
    )
    senior_user = User(
        username="senior", email="senior@cnap.local",
        hashed_password=hash_password("senior123"),
        full_name="DCP Priya Sharma", role="senior_authority"
    )
    db.add_all([admin_user, investigator_user, senior_user])
    db.commit()
    db.refresh(investigator_user)
    print("[OK] Created default users: admin, investigator, senior")

    # 4. Create fresh primary case
    case_id = "case-garuda-001"
    primary_case = Case(
        id=case_id,
        title="Operation Garuda — F-492 (Cyber-Fraud Syndicate)",
        description="Investigation into organized corporate spear-phishing, mule laundering ring, and hawala network led by Vikram Malhotra.",
        status="active",
        standing_authorisation=True,
        created_by=investigator_user.id
    )
    db.add(primary_case)
    db.flush()

    # Assign investigator
    db.add(CaseInvestigator(
        case_id=case_id,
        user_id=investigator_user.id,
        can_approve_expansion=True,
        can_track_location=True
    ))
    db.commit()
    print(f"[OK] Created Case: {primary_case.title} (ID: {case_id})")

    # 5. Ingest clean demo dataset
    demo_file = BACKEND_DIR.parent / "data-generator" / "output" / "complete_case_data.json"
    if not demo_file.exists():
        raise FileNotFoundError(f"Missing demo dataset at {demo_file}. Run generate_clean_demo.py first.")

    with open(demo_file, "r", encoding="utf-8") as f:
        demo_text = f.read()

    store = get_graph_store()
    parse_result = _parse_batch_json(case_id, demo_text, db, store)
    print(f"[OK] Ingested Clean Batch: {parse_result}")

    # 6. Populate raw evidence tables (FIR, Surveillance, Social Media, Criminal History)
    fir_file = BACKEND_DIR.parent / "data-generator" / "output" / "fir_records.json"
    if fir_file.exists():
        with open(fir_file, "r", encoding="utf-8") as f:
            for fir in json.load(f):
                # find person if matching
                p = db.query(Person).filter(Person.case_id == case_id, Person.name == fir["accused"][0]).first()
                db.add(FIRRecord(
                    case_id=case_id,
                    person_id=p.id if p else None,
                    fir_number=fir["fir_number"],
                    date=datetime.fromisoformat(fir["date"]),
                    offence=fir["offence"],
                    description=fir["description"],
                    police_station=fir["police_station"]
                ))

    surv_file = BACKEND_DIR.parent / "data-generator" / "output" / "surveillance_records.json"
    if not surv_file.exists():
        surv_file = BACKEND_DIR / "data_seed" / "surveillance_records.json"
    if surv_file.exists():
        with open(surv_file, "r", encoding="utf-8") as f:
            for s in json.load(f):
                p = db.query(Person).filter(Person.case_id == case_id, Person.name == s["person_name"]).first()
                lat = s.get("lat") if s.get("lat") is not None else s.get("location_lat")
                lng = s.get("lng") if s.get("lng") is not None else s.get("location_lng")
                db.add(SurveillanceRecord(
                    case_id=case_id,
                    person_id=p.id if p else None,
                    source=s.get("source", "field_surveillance"),
                    timestamp=datetime.fromisoformat(s["timestamp"]) if s.get("timestamp") else None,
                    description=s.get("description", ""),
                    observed_person_ids=s.get("observed_with", []),
                    location_lat=float(lat) if lat is not None else None,
                    location_lng=float(lng) if lng is not None else None
                ))

    crim_file = BACKEND_DIR.parent / "data-generator" / "output" / "criminal_history_records.json"
    if not crim_file.exists():
        crim_file = BACKEND_DIR / "data_seed" / "criminal_history_records.json"
    if crim_file.exists():
        with open(crim_file, "r", encoding="utf-8") as f:
            for c in json.load(f):
                p = db.query(Person).filter(Person.case_id == case_id, Person.name == c["person_name"]).first()
                db.add(CriminalHistoryRecord(
                    case_id=case_id,
                    person_id=p.id if p else None,
                    shared_case_ref=c.get("shared_case_ref", ""),
                    offence=c.get("offence", ""),
                    sentence=c.get("sentence", "")
                ))

    # Location Pings (GPS mesh across Mumbai, Delhi, Bengaluru)
    loc_file = BACKEND_DIR.parent / "data-generator" / "output" / "location_pings.csv"
    if not loc_file.exists():
        loc_file = BACKEND_DIR / "data_seed" / "location_pings.csv"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                p = db.query(Person).filter(Person.case_id == case_id, Person.name == row.get("person_name", "").strip()).first()
                if p:
                    lat = float(row.get("lat", 0) or 0)
                    lng = float(row.get("lng", 0) or 0)
                    ts = datetime.fromisoformat(row["timestamp"]) if row.get("timestamp") else None
                    db.add(LocationPing(
                        case_id=case_id,
                        person_id=p.id,
                        lat=lat,
                        lng=lng,
                        timestamp=ts
                    ))
                    node = store.get_node(case_id, p.id)
                    trail = node.get("location_trail", [])
                    trail.append({"lat": lat, "lng": lng, "timestamp": row.get("timestamp", "")})
                    store.update_node_attrs(case_id, p.id, {"location_trail": trail})

    db.commit()
    print("[OK] Populated raw evidence tables: FIRs, Surveillance, Criminal History, Location Pings")

    # 7. Recompute scores & hierarchy
    recompute_all_scores(case_id)
    store.save(case_id)
    print("[OK] Suspicion scores and hierarchy scores computed.")

    # 8. Run pattern detection and persist alerts
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
    db.commit()

    # 8b. Generate and persist baseline predictive forecasts
    from app.forecasting import generate_predictions
    preds = generate_predictions(case_id, db)
    for pred in preds:
        ts = datetime.fromisoformat(pred["timestamp"]) if isinstance(pred.get("timestamp"), str) else pred.get("timestamp")
        db.add(Event(
            case_id=case_id,
            event_name=pred.get("title", "Projected Intelligence Event"),
            timestamp=ts,
            event_type="predicted_event",
            description=pred.get("description", ""),
            linked_entity_ids=pred.get("linked_entity_ids", []),
            is_predicted=True,
            source_refs=pred,
        ))
    db.commit()
    print(f"[OK] Generated {len(preds)} baseline predictive future timeline events.")

    print("\n" + "=" * 60)
    print(f"PATTERN DETECTION COMPLETE: {len(alerts)} ALERTS GENERATED")
    print("=" * 60)
    for idx, a in enumerate(alerts, 1):
        print(f"{idx}. [{a['severity'].upper()}] {a['title']}")
        print(f"   -> {a['description']}")

    # 9. Verify Persons
    persons = db.query(Person).filter(Person.case_id == case_id).all()
    print("\n" + "=" * 60)
    print("SYNDICATE PERSONS IN CASE:")
    print("=" * 60)
    for p in persons:
        print(f"• {p.name:<20} | Score: {p.suspicion_score:.2f} | Band: {p.confidence_band:<10} | Seed: {p.is_seed}")

    db.close()
    print("\nReset & Seed process finished successfully!")


if __name__ == "__main__":
    reset_and_seed()
