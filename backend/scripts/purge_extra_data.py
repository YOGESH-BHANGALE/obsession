"""
purge_extra_data.py

Removes all the 140 FIR cases and their associated records that were inserted earlier,
keeping ONLY the demo case dataset (Operation Garuda — Syndicate Network).
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.database import engine, Base, SessionLocal
from app.models import (
    Case, Person, CaseInvestigator, PhoneNumber, FinancialAccount,
    TransactionRecord, CDRRecord, FIRRecord, PoliceReport,
    SurveillanceRecord, SurveillanceReport, CriminalHistoryRecord,
    SocialMediaAccount, SocialMediaChat, SocialMediaPost, SocialMediaRecord,
    Location, Organisation, Vehicle, Event,
    GraphRelationship, GroundTruthNetwork, Edge, PatternAlert,
    ApprovalRequest, AuditLog, LocationPing
)
from app.graph_store import get_graph_store

def purge():
    db = SessionLocal()
    try:
        # Find demo cases
        demo_cases = db.query(Case).filter(~Case.title.startswith("FIR/")).all()
        if not demo_cases:
            print("ERROR: No demo case found! Aborting purge.")
            return

        # Keep primary demo case (Operation Garuda)
        primary_demo_case = demo_cases[0]
        print(f"Keeping Demo Case: {primary_demo_case.id} | {primary_demo_case.title}")

        # Collect cases to remove
        cases_to_remove = db.query(Case).filter(Case.id != primary_demo_case.id).all()
        remove_ids = [c.id for c in cases_to_remove]
        print(f"Purging {len(remove_ids)} cases (140 FIR cases + any duplicate demo cases)...")

        # 1. Purge child tables tied to remove_ids
        print("- Purging pattern alerts...")
        db.query(PatternAlert).filter(PatternAlert.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging approvals...")
        db.query(ApprovalRequest).filter(ApprovalRequest.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging events...")
        db.query(Event).filter(Event.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging location pings...")
        db.query(LocationPing).filter(LocationPing.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging edges...")
        db.query(Edge).filter(Edge.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging CDR records...")
        db.query(CDRRecord).filter(CDRRecord.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging transaction records...")
        db.query(TransactionRecord).filter(TransactionRecord.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging FIR records...")
        db.query(FIRRecord).filter(FIRRecord.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging police reports...")
        db.query(PoliceReport).filter(PoliceReport.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging surveillance records...")
        db.query(SurveillanceRecord).filter(SurveillanceRecord.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging surveillance reports...")
        db.query(SurveillanceReport).filter(SurveillanceReport.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging criminal history records...")
        db.query(CriminalHistoryRecord).filter(CriminalHistoryRecord.case_id.in_(remove_ids)).delete(synchronize_session=False)

        print("- Purging social media records & chats...")
        db.query(SocialMediaRecord).filter(SocialMediaRecord.case_id.in_(remove_ids)).delete(synchronize_session=False)
        db.query(SocialMediaPost).delete(synchronize_session=False)
        db.query(SocialMediaChat).delete(synchronize_session=False)

        print("- Purging case investigators & audit logs...")
        db.query(CaseInvestigator).filter(CaseInvestigator.case_id.in_(remove_ids)).delete(synchronize_session=False)
        db.query(AuditLog).filter(AuditLog.case_id.in_(remove_ids)).delete(synchronize_session=False)

        # 2. Purge persons belonging to remove_ids
        print("- Purging persons for removed cases...")
        db.query(Person).filter(Person.case_id.in_(remove_ids)).delete(synchronize_session=False)

        # 3. Purge master 22-table data that was inserted earlier
        print("- Purging graph relationships and ground truth networks...")
        db.query(GraphRelationship).delete(synchronize_session=False)
        db.query(GroundTruthNetwork).delete(synchronize_session=False)
        db.query(PhoneNumber).delete(synchronize_session=False)
        db.query(FinancialAccount).delete(synchronize_session=False)
        db.query(SocialMediaAccount).delete(synchronize_session=False)
        db.query(Vehicle).delete(synchronize_session=False)
        db.query(Organisation).delete(synchronize_session=False)
        db.query(Location).delete(synchronize_session=False)

        # 4. Finally purge the cases themselves
        print("- Purging cases...")
        db.query(Case).filter(Case.id.in_(remove_ids)).delete(synchronize_session=False)

        db.commit()
        print("Database commit successful!")

        # 5. Clean graph store pickle files (keep only primary_demo_case.id)
        graphs_dir = BACKEND_DIR / "data" / "graphs"
        if graphs_dir.exists():
            for f in list(graphs_dir.glob("*.gpickle")) + list(graphs_dir.glob("*.pkl")):
                if not f.name.startswith(primary_demo_case.id):
                    try:
                        f.unlink(missing_ok=True)
                        print(f"Deleted pickle: {f.name}")
                    except Exception as e:
                        print(f"Could not delete {f.name}: {e}")

        # Verify final state
        remaining_cases = db.query(Case).all()
        print("\n" + "="*50)
        print(f"PURGE COMPLETE. Remaining cases in DB: {len(remaining_cases)}")
        for rc in remaining_cases:
            person_count = db.query(Person).filter(Person.case_id == rc.id).count()
            print(f"- {rc.id} | {rc.title} ({person_count} suspects)")
        print("="*50)

    except Exception as e:
        db.rollback()
        print(f"ERROR during purge: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    purge()
