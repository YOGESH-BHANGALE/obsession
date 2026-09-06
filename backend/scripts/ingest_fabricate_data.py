"""
ingest_fabricate_data.py

High-performance ingestion script for the complete Fabricate Criminal Network Dataset:
- 140 Cases
- 1,000 Persons with full identities, Aadhaar, occupations, and family roles
- 1,112 Phone numbers & 1,105 Financial accounts
- 13,264 CDR Calls & 10,907 Financial Transactions
- 146 FIRs, 74 Police Reports, 55 Surveillance Records
- 83 Criminal History records & Social Media Chats
- 26,832 Master Graph Relationships & 830 Ground Truth Syndicate Roles

Builds NetworkX case graphs, calculates suspicion/hierarchy scores,
and runs pattern detectors across all major multi-source cases.
"""

import os
import sys
import csv
import json
import uuid
from pathlib import Path
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.database import engine, Base, SessionLocal
from app.models import (
    User, Case, CaseInvestigator, Person, PhoneNumber, FinancialAccount,
    TransactionRecord, CDRRecord, FIRRecord, PoliceReport,
    SurveillanceRecord, SurveillanceReport, CriminalHistoryRecord,
    SocialMediaAccount, SocialMediaChat, SocialMediaPost,
    Location, Organisation, Vehicle, Event,
    GraphRelationship, GroundTruthNetwork, Edge, PatternAlert, AuditLog
)
from app.auth import hash_password
from app.graph_store import get_graph_store
from app.scoring import recompute_all_scores
from app.detectors import run_all_detectors


DATA_DIR = BACKEND_DIR.parent / "data" / "criminal_investigation_data"


def _parse_dt(val):
    if not val:
        return None
    try:
        val = val.replace('Z', '+00:00')
        if len(val) == 10:  # YYYY-MM-DD
            return datetime.fromisoformat(f"{val}T00:00:00+00:00")
        return datetime.fromisoformat(val)
    except Exception:
        return None


def ingest_dataset():
    if not DATA_DIR.exists():
        raise FileNotFoundError(f"Dataset directory not found at {DATA_DIR}")

    print("=" * 65)
    print("INGESTING FABRICATE CRIMINAL NETWORK INVESTIGATION DATASET")
    print("=" * 65)

    # 1. Reset Database Tables
    print("1. Re-initializing database tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    # 2. Reset Graph Store Cache
    store = get_graph_store()
    graphs_dir = BACKEND_DIR / "data" / "graphs"
    if graphs_dir.exists():
        for f in list(graphs_dir.glob("*.pkl")) + list(graphs_dir.glob("*.gpickle")):
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass
    graphs_dir.mkdir(parents=True, exist_ok=True)
    print("[OK] Database tables and graph cache re-initialized.")

    db = SessionLocal()

    try:
        # 3. Create Default Users
        print("\n2. Creating standard platform users...")
        admin = User(
            username="admin", email="admin@cnap.local",
            hashed_password=hash_password("admin123"),
            full_name="System Administrator", role="admin"
        )
        investigator = User(
            username="investigator", email="investigator@cnap.local",
            hashed_password=hash_password("invest123"),
            full_name="Det. Rajesh Kumar", role="investigator"
        )
        senior = User(
            username="senior", email="senior@cnap.local",
            hashed_password=hash_password("senior123"),
            full_name="DCP Priya Sharma", role="senior_authority"
        )
        db.add_all([admin, investigator, senior])
        db.commit()
        db.refresh(investigator)
        print("[OK] Default users created.")

        # 4. Load Cases
        print("\n3. Ingesting Cases (cases.csv)...")
        case_objs = []
        case_map = {}
        with open(DATA_DIR / "cases.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                cid = r['case_id']
                c_num = r.get('case_number', '')
                c_type = r.get('case_type', 'cybercrime')
                title = f"{c_num} — {c_type.replace('_', ' ').title()} Network"
                case = Case(
                    id=cid,
                    case_number=c_num,
                    case_type=c_type,
                    title=title,
                    description=r.get('description', ''),
                    status=r.get('status', 'under_investigation'),
                    opened_date=r.get('opened_date', ''),
                    closed_date=r.get('closed_date', ''),
                    jurisdiction_location_id=r.get('jurisdiction_location_id', ''),
                    standing_authorisation=True,
                    created_by=investigator.id
                )
                case_objs.append(case)
                case_map[cid] = case

        db.bulk_save_objects(case_objs)
        db.commit()

        # Assign investigator to cases
        inv_assigns = [
            CaseInvestigator(case_id=c.id, user_id=investigator.id, can_approve_expansion=True, can_track_location=True)
            for c in case_objs
        ]
        db.bulk_save_objects(inv_assigns)
        db.commit()
        print(f"[OK] Ingested {len(case_objs)} cases.")

        # 5. Read Ground Truth Roles (to mark kingpins and roles on persons)
        print("\n4. Indexing Ground Truth Syndicate Roles (ground_truth_network.csv)...")
        person_roles = {}
        gt_objs = []
        with open(DATA_DIR / "ground_truth_network.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                pid = r['person_id']
                role = r.get('network_role', '')
                if pid not in person_roles or 'kingpin' in role:
                    person_roles[pid] = role

                gt_objs.append(GroundTruthNetwork(
                    id=r['ground_truth_id'],
                    person_id=pid,
                    network_role=role,
                    related_person_id=r.get('related_person_id', ''),
                    relationship_type=r.get('relationship_type', ''),
                    evidence_sources=r.get('evidence_sources', ''),
                    confidence=float(r.get('confidence', 0.5) or 0.5),
                    case_id=r.get('case_id', ''),
                    notes=r.get('notes', '')
                ))

        db.bulk_save_objects(gt_objs)
        db.commit()
        print(f"[OK] Ingested {len(gt_objs)} ground-truth network records.")

        # 6. Read Phone Numbers by Person
        print("\n5. Ingesting Phone Numbers (phone_numbers.csv)...")
        person_phones = {}
        phone_objs = []
        with open(DATA_DIR / "phone_numbers.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                pid = r['person_id']
                pnum = r.get('phone_number', '')
                if pid not in person_phones:
                    person_phones[pid] = []
                person_phones[pid].append(pnum)

                phone_objs.append(PhoneNumber(
                    id=r['phone_id'],
                    person_id=pid,
                    phone_number=pnum,
                    phone_type=r.get('phone_type', 'primary'),
                    carrier=r.get('carrier', ''),
                    activated_date=r.get('activated_date', ''),
                    is_active=bool(int(r.get('is_active', 1) or 1))
                ))
        db.bulk_save_objects(phone_objs)
        db.commit()
        print(f"[OK] Ingested {len(phone_objs)} phone numbers.")

        # 7. Read Criminal History (to set criminal_history_flag)
        print("\n6. Ingesting Criminal History (criminal_history.csv)...")
        crim_persons = set()
        crim_objs = []
        with open(DATA_DIR / "criminal_history.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                pid = r['person_id']
                crim_persons.add(pid)
                linked = [x.strip() for x in r.get('linked_person_ids', '').split(',') if x.strip()]

                crim_objs.append(CriminalHistoryRecord(
                    id=r['history_id'],
                    person_id=pid,
                    case_id=r.get('case_id', ''),
                    case_type=r.get('case_type', ''),
                    year=r.get('year', ''),
                    status=r.get('status', 'convicted'),
                    charges=r.get('charges', ''),
                    court_name=r.get('court_name', ''),
                    linked_person_ids=linked,
                    description=r.get('description', ''),
                    offence=r.get('charges', ''),
                    shared_case_ref=r.get('case_id', ''),
                ))
        db.bulk_save_objects(crim_objs)
        db.commit()
        print(f"[OK] Ingested {len(crim_objs)} criminal history records ({len(crim_persons)} persons flagged).")

        # 8. Ingest Persons (persons.csv)
        print("\n7. Ingesting Persons (persons.csv)...")
        person_objs = []
        person_dict = {}
        with open(DATA_DIR / "persons.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                pid = r['person_id']
                name = r.get('full_name', 'Unknown')
                role = person_roles.get(pid, '')
                is_kingpin = 'kingpin' in role
                is_crim = pid in crim_persons
                phones = person_phones.get(pid, [])
                aliases = [f"{r['first_name']} {r['last_name'][0]}."] if r.get('first_name') and r.get('last_name') else []

                p = Person(
                    id=pid,
                    name=name,
                    first_name=r.get('first_name', ''),
                    last_name=r.get('last_name', ''),
                    aadhaar_id=r.get('aadhaar_id', ''),
                    gender=r.get('gender', ''),
                    date_of_birth=r.get('date_of_birth', ''),
                    age=int(r['age']) if r.get('age') and r['age'].isdigit() else None,
                    city=r.get('city', ''),
                    state=r.get('state', ''),
                    occupation=r.get('occupation', ''),
                    email=r.get('email', ''),
                    marital_status=r.get('marital_status', ''),
                    household_id=r.get('household_id', ''),
                    family_role=r.get('family_role', ''),
                    notes=r.get('notes', ''),
                    phone_numbers=phones,
                    criminal_history_flag=is_crim,
                    network_role=role,
                    is_seed=is_kingpin,
                    suspicion_score=0.95 if is_kingpin else 0.65 if 'lieutenant' in role else 0.45 if 'mule' in role or 'operative' in role else 0.25,
                    hierarchy_score=1.0 if is_kingpin else 0.7 if 'lieutenant' in role else 0.4 if 'operative' in role else 0.2,
                    confidence_band="inner" if is_kingpin else "middle" if 'lieutenant' in role or is_crim else "outer",
                    aliases=aliases
                )
                person_objs.append(p)
                person_dict[pid] = p

        db.bulk_save_objects(person_objs)
        db.commit()
        print(f"[OK] Ingested {len(person_objs)} persons.")

        # 9. Ingest Financial Accounts & Transactions
        print("\n8. Ingesting Financial Accounts & Transactions...")
        acct_objs = []
        with open(DATA_DIR / "financial_accounts.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                acct_objs.append(FinancialAccount(
                    id=r['account_id'],
                    person_id=r['person_id'],
                    organization_id=r.get('organization_id', ''),
                    account_number=r.get('account_number', ''),
                    account_type=r.get('account_type', 'savings'),
                    ifsc_code=r.get('ifsc_code', ''),
                    opened_date=r.get('opened_date', ''),
                    status=r.get('status', 'active')
                ))
        db.bulk_save_objects(acct_objs)
        db.commit()

        tx_objs = []
        with open(DATA_DIR / "financial_transactions.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                amt = float(r.get('amount', 0) or 0)
                ts = _parse_dt(r.get('transaction_timestamp')) or datetime.now(timezone.utc)
                tx_objs.append(TransactionRecord(
                    id=r['transaction_id'],
                    case_id=r.get('linked_case_id') or None,
                    sender_person_id=r.get('sender_person_id') or None,
                    receiver_person_id=r.get('receiver_person_id') or None,
                    sender_account_id=r.get('sender_account_id', ''),
                    receiver_account_id=r.get('receiver_account_id', ''),
                    amount=amt,
                    timestamp=ts,
                    transaction_timestamp=r.get('transaction_timestamp', ''),
                    transaction_type=r.get('transaction_type', 'transfer'),
                    platform=r.get('platform', 'IMPS'),
                    location_id=r.get('location_id', ''),
                    description=r.get('description', ''),
                    linked_case_id=r.get('linked_case_id', '')
                ))
        db.bulk_save_objects(tx_objs)
        db.commit()
        print(f"[OK] Ingested {len(acct_objs)} financial accounts and {len(tx_objs)} transactions.")

        # 10. Ingest CDR Records
        print("\n9. Ingesting Call Detail Records (cdr_records.csv)...")
        cdr_objs = []
        with open(DATA_DIR / "cdr_records.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                ts = _parse_dt(r.get('call_timestamp')) or datetime.now(timezone.utc)
                dur = int(r.get('call_duration', 0) or 0)
                cdr_objs.append(CDRRecord(
                    id=r['call_id'],
                    case_id=r.get('linked_case_id') or None,
                    caller_person_id=r.get('caller_person_id') or None,
                    receiver_person_id=r.get('receiver_person_id') or None,
                    caller_phone=r.get('caller_phone', ''),
                    receiver_phone=r.get('receiver_phone', ''),
                    timestamp=ts,
                    call_timestamp=r.get('call_timestamp', ''),
                    duration_seconds=dur,
                    call_duration=dur,
                    call_type=r.get('call_type', 'voice'),
                    caller_location_id=r.get('caller_location_id', ''),
                    receiver_location_id=r.get('receiver_location_id', ''),
                    linked_case_id=r.get('linked_case_id', '')
                ))
        db.bulk_save_objects(cdr_objs)
        db.commit()
        print(f"[OK] Ingested {len(cdr_objs)} CDR call records.")

        # 11. Ingest FIRs & Police Reports
        print("\n10. Ingesting FIRs & Police Reports...")
        fir_objs = []
        with open(DATA_DIR / "firs.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                filed = _parse_dt(r.get('filed_date')) or datetime.now(timezone.utc)
                inv = [x.strip() for x in r.get('involved_person_ids', '').split(',') if x.strip()]
                fir_objs.append(FIRRecord(
                    id=r['fir_id'],
                    fir_number=r.get('fir_number', ''),
                    case_id=r.get('case_id') or None,
                    date=filed,
                    filed_date=r.get('filed_date', ''),
                    location_id=r.get('location_id', ''),
                    primary_complainant_person_id=r.get('primary_complainant_person_id', ''),
                    involved_person_ids=inv,
                    offence=r.get('status', 'IPC 420, 120B, IT Act 66D'),
                    description=r.get('narrative', ''),
                    narrative=r.get('narrative', ''),
                    police_station="Cyber Crime Unit",
                    status=r.get('status', 'under_investigation')
                ))
        db.bulk_save_objects(fir_objs)
        db.commit()

        pol_objs = []
        with open(DATA_DIR / "police_reports.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                inv = [x.strip() for x in r.get('involved_person_ids', '').split(',') if x.strip()]
                pol_objs.append(PoliceReport(
                    id=r['report_id'],
                    fir_id=r.get('fir_id', ''),
                    case_id=r.get('case_id') or None,
                    report_date=r.get('report_date', ''),
                    officer_name=r.get('officer_name', ''),
                    report_type=r.get('report_type', 'investigation'),
                    involved_person_ids=inv,
                    narrative=r.get('narrative', '')
                ))
        db.bulk_save_objects(pol_objs)
        db.commit()
        print(f"[OK] Ingested {len(fir_objs)} FIRs and {len(pol_objs)} police reports.")

        # 12. Ingest Surveillance Records & Reports
        print("\n11. Ingesting Surveillance Records...")
        surv_objs = []
        with open(DATA_DIR / "surveillance_records.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                ts = _parse_dt(r.get('observation_timestamp'))
                inv = [x.strip() for x in r.get('observed_person_ids', '').split(',') if x.strip()]
                surv_objs.append(SurveillanceRecord(
                    id=r['observation_id'],
                    case_id=r.get('case_id') or None,
                    source=r.get('officer_reference', 'Field Surveillance'),
                    timestamp=ts,
                    observation_timestamp=r.get('observation_timestamp', ''),
                    location_id=r.get('location_id', ''),
                    observed_person_ids=inv,
                    vehicle_id=r.get('vehicle_id', ''),
                    object_id=r.get('object_id', ''),
                    officer_reference=r.get('officer_reference', ''),
                    description=r.get('narrative', ''),
                    narrative=r.get('narrative', ''),
                    source_reliability=r.get('source_reliability', 'medium')
                ))
        db.bulk_save_objects(surv_objs)
        db.commit()
        print(f"[OK] Ingested {len(surv_objs)} surveillance records.")

        # 13. Ingest Social Media, Locations, Organizations, Vehicles
        print("\n12. Ingesting Locations, Organizations, Vehicles, Social Media...")
        loc_objs = []
        with open(DATA_DIR / "locations.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                lat = float(r['latitude']) if r.get('latitude') else None
                lng = float(r['longitude']) if r.get('longitude') else None
                loc_objs.append(Location(
                    id=r['location_id'],
                    city=r.get('city', ''),
                    state=r.get('state', ''),
                    area=r.get('area', ''),
                    location_type=r.get('location_type', 'commercial'),
                    latitude=lat,
                    longitude=lng,
                    lat=lat,
                    lng=lng,
                    pincode=r.get('pincode', ''),
                    address=f"{r.get('area', '')}, {r.get('city', '')}"
                ))
        db.bulk_save_objects(loc_objs)

        veh_objs = []
        with open(DATA_DIR / "vehicles.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                inv = [x.strip() for x in r.get('associated_person_ids', '').split(',') if x.strip()]
                veh_objs.append(Vehicle(
                    id=r['vehicle_id'],
                    registration_number=r.get('registration_number', ''),
                    vehicle_type=r.get('vehicle_type', 'car'),
                    make=r.get('make', ''),
                    model=r.get('model', ''),
                    color=r.get('color', ''),
                    owner_person_id=r.get('owner_person_id', ''),
                    associated_person_ids=inv
                ))
        db.bulk_save_objects(veh_objs)

        org_objs = []
        with open(DATA_DIR / "organizations.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                org_objs.append(Organisation(
                    id=r['organization_id'],
                    name=r.get('name', ''),
                    org_type=r.get('organization_type', ''),
                    location_id=r.get('location_id', ''),
                    description=r.get('description', '')
                ))
        db.bulk_save_objects(org_objs)

        soc_chats = []
        with open(DATA_DIR / "social_media_chats.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                soc_chats.append(SocialMediaChat(
                    id=r['chat_id'],
                    platform=r.get('platform', 'Telegram'),
                    sender_person_id=r['sender_person_id'],
                    receiver_person_id=r['receiver_person_id'],
                    chat_timestamp=r.get('chat_timestamp', ''),
                    message_text=r.get('message_text', ''),
                    mentioned_person_ids=[x.strip() for x in r.get('mentioned_person_ids', '').split(',') if x.strip()]
                ))
        db.bulk_save_objects(soc_chats)
        db.commit()
        print(f"[OK] Ingested Locations, Vehicles, Organizations, and Social Media chats.")

        # 14. Ingest Master Graph Relationships (26,832 edges)
        print("\n13. Ingesting Graph Relationships (graph_relationships.csv)...")
        rel_objs = []
        with open(DATA_DIR / "graph_relationships.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                rel_objs.append(GraphRelationship(
                    id=r['relationship_id'],
                    source_entity_id=r['source_entity_id'],
                    source_entity_type=r.get('source_entity_type', 'PERSON'),
                    target_entity_id=r['target_entity_id'],
                    target_entity_type=r.get('target_entity_type', 'PERSON'),
                    relationship_type=r.get('relationship_type', 'linked_to'),
                    timestamp=r.get('timestamp', ''),
                    evidence_source=r.get('evidence_source', ''),
                    case_id=r.get('case_id') or None,
                    confidence=float(r.get('confidence', 0.5) or 0.5),
                    suspicious_indicator=int(r.get('suspicious_indicator', 0) or 0)
                ))
        db.bulk_save_objects(rel_objs)
        db.commit()
        print(f"[OK] Ingested {len(rel_objs)} master graph relationships.")

        # 15. Build NetworkX Graphs & Run Pattern Detectors for Top Investigated Cases
        print("\n14. Building NetworkX graphs and running pattern detectors on cases...")
        top_cases = [
            "31b964e9-e0a0-4342-9d40-d7ea00c2e077", # FIR/HUN/2023/7466 Cybercrime
            "f2f115ab-5b0b-4cdc-a136-b775845814d5", # FIR/LUN/2025/1581 Narcotics
            "9e1a4a07-e50c-4870-864f-2d705f28fae5", # FIR/HUN/2025/1021 Fraud
            "a7849323-bce8-46b2-a835-75ac4446df2d", # FIR/CHO/2023/5936 Hawala Layering
            "7d104ee8-3694-4a75-ae8d-165f02f3074f", # FIR/CHA/2023/9060 Extortion
            "32e4d776-35df-4688-9259-7b74dd290ddc", # FIR/DHA/2024/5200 Narcotics
        ]

        total_alerts = 0
        for cid in top_cases:
            c = case_map.get(cid)
            if not c:
                continue

            # Find persons involved in this case
            involved_pids = set()
            case_edges = []
            for rel in rel_objs:
                if rel.case_id == cid and rel.source_entity_type == 'PERSON' and rel.target_entity_type == 'PERSON':
                    involved_pids.add(rel.source_entity_id)
                    involved_pids.add(rel.target_entity_id)
                    case_edges.append(rel)

            # If fewer than 4 explicitly tagged, pull direct transactions/CDRs
            if len(case_edges) < 5:
                for tx in tx_objs:
                    if tx.case_id == cid and tx.sender_person_id and tx.receiver_person_id:
                        involved_pids.add(tx.sender_person_id)
                        involved_pids.add(tx.receiver_person_id)
                for cdr in cdr_objs:
                    if cdr.case_id == cid and cdr.caller_person_id and cdr.receiver_person_id:
                        involved_pids.add(cdr.caller_person_id)
                        involved_pids.add(cdr.receiver_person_id)

            # Add nodes to graph store
            for pid in involved_pids:
                p = person_dict.get(pid)
                if not p:
                    continue
                initials = "".join([w[0].upper() for w in p.name.split() if w][:2])
                store.add_person_node(cid, pid, {
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

            # Add edges to graph store
            for rel in case_edges:
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

                store.add_edge(cid, rel.source_entity_id, rel.target_entity_id, ev_type, {
                    "relationship_type": rel.relationship_type,
                    "confidence": rel.confidence,
                    "timestamp": rel.timestamp,
                    "source": rel.evidence_source,
                })

            # Recompute scores & run detectors
            recompute_all_scores(cid, db)
            store.save(cid)

            alerts = run_all_detectors(cid, store, db)
            total_alerts += len(alerts)
            for a in alerts:
                db.add(PatternAlert(
                    id=a["id"],
                    case_id=cid,
                    detector_name=a["detector_name"],
                    severity=a["severity"],
                    title=a["title"],
                    description=a["description"],
                    involved_person_ids=a["involved_person_ids"],
                    involved_edge_ids=a.get("involved_edge_ids", []),
                    evidence_data=a.get("evidence_data", {}),
                ))
            db.commit()
            print(f" • [{c.case_number}] {c.title}: {len(involved_pids)} suspects, {len(case_edges)} links, {len(alerts)} alerts.")

        print("\n" + "=" * 65)
        print("INGESTION COMPLETED SUCCESSFULLY!")
        print(f"Total Cases Ingested: {len(case_objs)}")
        print(f"Total Persons Ingested: {len(person_objs)}")
        print(f"Total Transactions: {len(tx_objs)}")
        print(f"Total CDR Calls: {len(cdr_objs)}")
        print(f"Total Master Relationships: {len(rel_objs)}")
        print(f"Total Pattern Alerts Generated: {total_alerts}")
        print("=" * 65)

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Ingestion failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    ingest_dataset()
