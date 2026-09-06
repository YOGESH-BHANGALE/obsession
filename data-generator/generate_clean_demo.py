"""
generate_clean_demo.py

Generates a crystal-clear, focused 7-person Cyber Crime & Money Laundering Syndicate
with dedicated demo files for EVERY category:
1. complete_case_data.json
2. fir_records.json
3. cdr_records.csv
4. transaction_records.csv
5. surveillance_records.json
6. social_media_records.json
7. criminal_history_records.json
8. location_pings.csv

All data is structured to trigger the core problem statement pattern detectors:
- Circular Transaction Pattern (Laundering Loop)
- Communication Burst (Pre-incident Call Spike)
- Phone Hopping & Identity Switching (Burner SIMs)
- Bridge Node (Lieutenant between Boss, Mules, and Cyber Cell)
- Cross-Case Matching (Prior Case Links)
- Co-Location / Surveillance (Physical Meeting)
"""

import json
import csv
import io
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Base timestamps
T0 = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
iso = lambda dt: dt.isoformat()

# ═══════════════════════════════════════════════════════════════
# 1. THE 7 SYNDICATE MEMBERS
# ═══════════════════════════════════════════════════════════════

PERSONS = [
    {
        "name": "Vikram Malhotra",
        "phone_numbers": ["+919876543210"],
        "criminal_history_flag": True,
        "is_seed": True,
        "aliases": ["V.M.", "The Boss"],
        "cross_case_refs": ["CASE-2023-MUM-0456", "CASE-2022-DEL-0789"]
    },
    {
        "name": "Karan Joshi",
        "phone_numbers": ["+919811122233", "+919811122234", "+919811122235"],
        "criminal_history_flag": True,
        "is_seed": False,
        "aliases": ["K.J.", "Kay"],
        "cross_case_refs": []
    },
    {
        "name": "Rohan Sharma",
        "phone_numbers": ["+919822233344"],
        "criminal_history_flag": True,
        "is_seed": False,
        "aliases": ["RS"],
        "cross_case_refs": []
    },
    {
        "name": "Sameer Merchant",
        "phone_numbers": ["+919833344455"],
        "criminal_history_flag": False,
        "is_seed": False,
        "aliases": ["Merchant Bhai"],
        "cross_case_refs": []
    },
    {
        "name": "Devendra Kumar",
        "phone_numbers": ["+919844455566"],
        "criminal_history_flag": False,
        "is_seed": False,
        "aliases": ["Dev"],
        "cross_case_refs": []
    },
    {
        "name": "Amit Patel",
        "phone_numbers": ["+919855566677"],
        "criminal_history_flag": False,
        "is_seed": False,
        "aliases": ["0xAmit"],
        "cross_case_refs": []
    },
    {
        "name": "Pooja Nair",
        "phone_numbers": ["+919866677788"],
        "criminal_history_flag": True,
        "is_seed": False,
        "aliases": [],
        "cross_case_refs": ["CASE-2022-DEL-0789"]
    }
]

# ═══════════════════════════════════════════════════════════════
# 2. EDGES & MULTI-CATEGORY CONNECTIONS
# ═══════════════════════════════════════════════════════════════

EDGES = [
    # A. Communication Burst: Vikram <-> Karan (Spike to 18 calls before heist)
    {
        "source_name": "Vikram Malhotra",
        "target_name": "Karan Joshi",
        "evidence_type": "CALL",
        "confidence": 0.95,
        "timestamp": iso(T0 + timedelta(days=5, hours=2)),
        "frequency": 18,
        "frequency_history": [2, 3, 2, 2, 2, 2, 18],
        "duration": 420,
        "direction": "bidirectional",
        "is_new_connection": False
    },
    # B. Karan Joshi bridges to Cyber Cell (Amit Patel)
    {
        "source_name": "Karan Joshi",
        "target_name": "Amit Patel",
        "evidence_type": "CALL",
        "confidence": 0.88,
        "timestamp": iso(T0 + timedelta(days=5, hours=3)),
        "frequency": 6,
        "frequency_history": [1, 2, 2, 1, 2, 2, 6],
        "duration": 280,
        "direction": "bidirectional",
        "is_new_connection": False
    },
    {
        "source_name": "Karan Joshi",
        "target_name": "Amit Patel",
        "evidence_type": "SOCIAL_MEDIA",
        "confidence": 0.85,
        "timestamp": iso(T0 + timedelta(days=5, hours=4)),
        "frequency": 12,
        "direction": "forward",
        "is_new_connection": False
    },
    # C. Karan Joshi bridges to Financial Mule Coordinator (Rohan Sharma)
    {
        "source_name": "Karan Joshi",
        "target_name": "Rohan Sharma",
        "evidence_type": "CALL",
        "confidence": 0.90,
        "timestamp": iso(T0 + timedelta(days=5, hours=5)),
        "frequency": 8,
        "frequency_history": [2, 2, 1, 2, 1, 2, 8],
        "duration": 310,
        "direction": "bidirectional",
        "is_new_connection": False
    },
    # D. Circular Transaction Pattern (Money Laundering Loop):
    # Rohan Sharma -> Sameer Merchant (₹12,50,000)
    {
        "source_name": "Rohan Sharma",
        "target_name": "Sameer Merchant",
        "evidence_type": "TRANSACTION",
        "confidence": 0.96,
        "amount": 1250000.0,
        "timestamp": iso(T0 + timedelta(days=5, hours=6)),
        "frequency": 3,
        "direction": "forward",
        "is_new_connection": True
    },
    # Sameer Merchant -> Devendra Kumar (₹12,20,000)
    {
        "source_name": "Sameer Merchant",
        "target_name": "Devendra Kumar",
        "evidence_type": "TRANSACTION",
        "confidence": 0.94,
        "amount": 1220000.0,
        "timestamp": iso(T0 + timedelta(days=5, hours=7)),
        "frequency": 2,
        "direction": "forward",
        "is_new_connection": True
    },
    # Devendra Kumar -> Rohan Sharma (₹11,90,000) - CLOSES THE LOOP!
    {
        "source_name": "Devendra Kumar",
        "target_name": "Rohan Sharma",
        "evidence_type": "TRANSACTION",
        "confidence": 0.95,
        "amount": 1190000.0,
        "timestamp": iso(T0 + timedelta(days=5, hours=8)),
        "frequency": 2,
        "direction": "forward",
        "is_new_connection": True
    },
    # Anomalous high-value transfer: Rohan -> Sameer (₹25,00,000)
    {
        "source_name": "Rohan Sharma",
        "target_name": "Sameer Merchant",
        "evidence_type": "TRANSACTION",
        "confidence": 0.98,
        "amount": 2500000.0,
        "timestamp": iso(T0 + timedelta(days=5, hours=10)),
        "frequency": 1,
        "direction": "forward",
        "is_new_connection": False
    },
    # Baseline transfer 1: Rohan -> Amit (₹75,000)
    {
        "source_name": "Rohan Sharma",
        "target_name": "Amit Patel",
        "evidence_type": "TRANSACTION",
        "confidence": 0.85,
        "amount": 75000.0,
        "timestamp": iso(T0 + timedelta(days=4, hours=14)),
        "frequency": 1,
        "direction": "forward",
        "is_new_connection": False
    },
    # Baseline transfer 2: Pooja -> Rohan (₹50,000)
    {
        "source_name": "Pooja Nair",
        "target_name": "Rohan Sharma",
        "evidence_type": "TRANSACTION",
        "confidence": 0.80,
        "amount": 50000.0,
        "timestamp": iso(T0 + timedelta(days=4, hours=16)),
        "frequency": 1,
        "direction": "forward",
        "is_new_connection": False
    },
    # E. Physical Surveillance Meeting: Vikram Malhotra & Devendra Kumar
    {
        "source_name": "Vikram Malhotra",
        "target_name": "Devendra Kumar",
        "evidence_type": "SURVEILLANCE",
        "confidence": 0.92,
        "timestamp": iso(T0 + timedelta(days=5, hours=12)),
        "frequency": 1,
        "direction": "bidirectional",
        "is_new_connection": False
    },
    # F. Criminal History Co-Accused: Vikram Malhotra & Pooja Nair
    {
        "source_name": "Vikram Malhotra",
        "target_name": "Pooja Nair",
        "evidence_type": "CRIMINAL_HISTORY",
        "confidence": 0.98,
        "timestamp": iso(T0 - timedelta(days=365)),
        "shared_case": "CASE-2022-DEL-0789",
        "direction": "bidirectional",
        "is_new_connection": False
    },
    # G. Karan Joshi -> Pooja Nair call link
    {
        "source_name": "Karan Joshi",
        "target_name": "Pooja Nair",
        "evidence_type": "CALL",
        "confidence": 0.82,
        "timestamp": iso(T0 + timedelta(days=5, hours=9)),
        "frequency": 4,
        "duration": 180,
        "direction": "bidirectional",
        "is_new_connection": False
    }
]

# ═══════════════════════════════════════════════════════════════
# 3. TIMELINE EVENTS
# ═══════════════════════════════════════════════════════════════

EVENTS = [
    {
        "timestamp": iso(T0 + timedelta(days=1)),
        "event_type": "crime_event",
        "description": "FIR Registered: ₹5.2 Crore corporate phishing heist reported at Cyber Crime PS BKC Mumbai",
        "linked_person_names": ["Vikram Malhotra", "Karan Joshi"],
        "is_predicted": False
    },
    {
        "timestamp": iso(T0 + timedelta(days=3)),
        "event_type": "network_event",
        "description": "Burner SIM Activation: Karan Joshi acquired 3 successive SIM cards (+919811122233-35)",
        "linked_person_names": ["Karan Joshi"],
        "is_predicted": False
    },
    {
        "timestamp": iso(T0 + timedelta(days=5, hours=2)),
        "event_type": "network_event",
        "description": "Communication Burst: 18 rapid encrypted calls logged between Boss (Vikram) and Handler (Karan)",
        "linked_person_names": ["Vikram Malhotra", "Karan Joshi"],
        "is_predicted": False
    },
    {
        "timestamp": iso(T0 + timedelta(days=5, hours=6)),
        "event_type": "crime_event",
        "description": "Smurfing Transaction Loop: ₹12.5L transferred from Rohan to Sameer Merchant, relayed to Devendra",
        "linked_person_names": ["Rohan Sharma", "Sameer Merchant", "Devendra Kumar"],
        "is_predicted": False
    },
    {
        "timestamp": iso(T0 + timedelta(days=5, hours=12)),
        "event_type": "network_event",
        "description": "Physical Surveillance Sighting: Vikram Malhotra and Devendra Kumar met at Grand Hyatt Mumbai safehouse",
        "linked_person_names": ["Vikram Malhotra", "Devendra Kumar"],
        "is_predicted": False
    },
    {
        "timestamp": iso(T0 + timedelta(days=12)),
        "event_type": "predicted_event",
        "description": "AI Predictive Forecast: Anticipated offshore Hawala cashout attempt to Dubai crypto OTC desk",
        "linked_person_names": ["Sameer Merchant", "Vikram Malhotra"],
        "is_predicted": True
    }
]

# ═══════════════════════════════════════════════════════════════
# 4. LOCATION PINGS (GPS & Cell Tower Co-location)
# ═══════════════════════════════════════════════════════════════

LOCATION_PINGS = [
    # Vikram Malhotra: Grand Hyatt Mumbai cluster
    {"person_name": "Vikram Malhotra", "lat": 19.0760, "lng": 72.8777, "timestamp": iso(T0 + timedelta(days=5, hours=11, minutes=45))},
    {"person_name": "Vikram Malhotra", "lat": 19.0762, "lng": 72.8779, "timestamp": iso(T0 + timedelta(days=5, hours=12, minutes=15))},
    {"person_name": "Vikram Malhotra", "lat": 19.0761, "lng": 72.8778, "timestamp": iso(T0 + timedelta(days=5, hours=12, minutes=45))},

    # Devendra Kumar: At the EXACT same Grand Hyatt cluster at the same time!
    {"person_name": "Devendra Kumar", "lat": 19.0760, "lng": 72.8777, "timestamp": iso(T0 + timedelta(days=5, hours=12, minutes=0))},
    {"person_name": "Devendra Kumar", "lat": 19.0761, "lng": 72.8778, "timestamp": iso(T0 + timedelta(days=5, hours=12, minutes=30))},
    {"person_name": "Devendra Kumar", "lat": 19.0763, "lng": 72.8780, "timestamp": iso(T0 + timedelta(days=5, hours=13, minutes=0))},

    # Karan Joshi: South Mumbai / Nariman Point financial district + Grand Hyatt meetup
    {"person_name": "Karan Joshi", "lat": 18.9256, "lng": 72.8242, "timestamp": iso(T0 + timedelta(days=5, hours=9))},
    {"person_name": "Karan Joshi", "lat": 18.9260, "lng": 72.8245, "timestamp": iso(T0 + timedelta(days=5, hours=10))},
    {"person_name": "Karan Joshi", "lat": 19.0762, "lng": 72.8778, "timestamp": iso(T0 + timedelta(days=5, hours=12, minutes=10))},

    # Rohan Sharma: Andheri East commercial hub
    {"person_name": "Rohan Sharma", "lat": 19.1136, "lng": 72.8697, "timestamp": iso(T0 + timedelta(days=5, hours=6))},

    # Sameer Merchant: Zaveri Bazaar bullion market
    {"person_name": "Sameer Merchant", "lat": 18.9515, "lng": 72.8317, "timestamp": iso(T0 + timedelta(days=5, hours=7))}
]

# ═══════════════════════════════════════════════════════════════
# WRITE INDIVIDUAL CATEGORY DEMO FILES
# ═══════════════════════════════════════════════════════════════

def write_all_files():
    # 1. complete_case_data.json
    complete_data = {
        "persons": PERSONS,
        "edges": EDGES,
        "events": EVENTS,
        "location_pings": LOCATION_PINGS
    }
    with open(OUTPUT_DIR / "complete_case_data.json", "w", encoding="utf-8") as f:
        json.dump(complete_data, f, indent=2)
    print(f"✓ Created complete_case_data.json ({len(PERSONS)} persons, {len(EDGES)} edges)")

    # 2. fir_records.json
    fir_data = [
        {
            "fir_number": "FIR-2024-MUM-0204",
            "police_station": "Cyber Crime Police Station, Bandra-Kurla Complex (BKC), Mumbai",
            "date": iso(T0 + timedelta(days=1)),
            "offence": "IPC 420 (Cheating), 120B (Criminal Conspiracy), IT Act Sec 66C & 66D (Identity Theft & Cheating by Personation)",
            "complainant": "Chief Risk Officer, Apex Global Logistics Pvt Ltd",
            "accused": ["Vikram Malhotra", "Karan Joshi", "Rohan Sharma"],
            "description": "Spear-phishing compromise of executive corporate email resulting in fraudulent wire transfer of INR 5,20,00,000 to mule accounts controlled by Vikram Malhotra's network."
        },
        {
            "fir_number": "FIR-2022-DEL-0789",
            "police_station": "Special Cell, Cyber Highway Cyber Crime Unit, New Delhi",
            "date": iso(T0 - timedelta(days=365)),
            "offence": "IPC 419, 420, 468, 471, IT Act 66D",
            "complainant": "Cyber Crime Cell Suo Motu",
            "accused": ["Vikram Malhotra", "Pooja Nair"],
            "description": "Cross-border call-center scam and hawala laundering ring operating across NCR and Maharashtra."
        },
        {
            "fir_number": "FIR-2024-BLR-0312",
            "police_station": "CID Cyber Crime Police Station, Bengaluru",
            "date": iso(T0 - timedelta(days=90)),
            "offence": "IT Act Sec 43, 66 (Hacking & Malware Distribution)",
            "complainant": "National Critical Information Infrastructure Protection Centre (NCIIPC)",
            "accused": ["Amit Patel"],
            "description": "Hosting bulletproof command-and-control (C2) domains and credential harvester portals used in corporate attacks."
        }
    ]
    with open(OUTPUT_DIR / "fir_records.json", "w", encoding="utf-8") as f:
        json.dump(fir_data, f, indent=2)
    print(f"✓ Created fir_records.json ({len(fir_data)} FIRs)")

    # 3. cdr_records.csv
    cdr_rows = [
        # caller_name, callee_name, caller_number, callee_number, timestamp, duration_seconds, frequency, frequency_history
        ["Vikram Malhotra", "Karan Joshi", "+919876543210", "+919811122233", iso(T0 + timedelta(days=5, hours=2, minutes=10)), 420, 18, "[2, 3, 2, 2, 2, 2, 18]"],
        ["Karan Joshi", "Vikram Malhotra", "+919811122233", "+919876543210", iso(T0 + timedelta(days=5, hours=2, minutes=30)), 310, 18, "[2, 3, 2, 2, 2, 2, 18]"],
        ["Karan Joshi", "Amit Patel", "+919811122234", "+919855566677", iso(T0 + timedelta(days=5, hours=3, minutes=15)), 280, 6, "[1, 2, 2, 1, 2, 2, 6]"],
        ["Karan Joshi", "Rohan Sharma", "+919811122234", "+919822233344", iso(T0 + timedelta(days=5, hours=5, minutes=0)), 310, 8, "[2, 2, 1, 2, 1, 2, 8]"],
        ["Karan Joshi", "Pooja Nair", "+919811122235", "+919866677788", iso(T0 + timedelta(days=5, hours=9, minutes=0)), 180, 4, "[1, 1, 1, 1, 1, 1, 4]"],
        ["Rohan Sharma", "Sameer Merchant", "+919822233344", "+919833344455", iso(T0 + timedelta(days=5, hours=5, minutes=45)), 150, 3, "[1, 1, 1, 1, 1, 1, 3]"],
        ["Sameer Merchant", "Devendra Kumar", "+919833344455", "+919844455566", iso(T0 + timedelta(days=5, hours=6, minutes=45)), 195, 2, "[1, 1, 1, 1, 1, 1, 2]"]
    ]
    with open(OUTPUT_DIR / "cdr_records.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["caller_name", "callee_name", "caller_number", "callee_number", "timestamp", "duration_seconds", "frequency", "frequency_history"])
        writer.writerows(cdr_rows)
    print(f"✓ Created cdr_records.csv ({len(cdr_rows)} records)")

    # 4. transaction_records.csv (Clean circular money laundering + anomalous spike)
    tx_rows = [
        # sender_name, receiver_name, sender_account, receiver_account, amount, timestamp, transaction_type
        ["Rohan Sharma", "Sameer Merchant", "ACC-MULE-ROHAN-01", "ACC-HAWALA-SAMEER", 1250000.0, iso(T0 + timedelta(days=5, hours=6)), "NEFT_TRANSFER"],
        ["Sameer Merchant", "Devendra Kumar", "ACC-HAWALA-SAMEER", "ACC-MULE-DEV-02", 1220000.0, iso(T0 + timedelta(days=5, hours=7)), "IMPS_TRANSFER"],
        ["Devendra Kumar", "Rohan Sharma", "ACC-MULE-DEV-02", "ACC-MULE-ROHAN-01", 1190000.0, iso(T0 + timedelta(days=5, hours=8)), "RTGS_TRANSFER"],
        ["Rohan Sharma", "Sameer Merchant", "ACC-MULE-ROHAN-01", "ACC-CRYPTO-DESK-99", 2500000.0, iso(T0 + timedelta(days=5, hours=10)), "CRYPTO_ESCROW_PURCHASE"],
        ["Rohan Sharma", "Amit Patel", "ACC-MULE-ROHAN-01", "ACC-TECH-AMIT-01", 75000.0, iso(T0 + timedelta(days=4, hours=14)), "ONLINE_TRANSFER"],
        ["Pooja Nair", "Rohan Sharma", "ACC-BENEFICIARY-POOJA", "ACC-MULE-ROHAN-01", 50000.0, iso(T0 + timedelta(days=4, hours=16)), "UPI_TRANSFER"]
    ]
    with open(OUTPUT_DIR / "transaction_records.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["sender_name", "receiver_name", "sender_account", "receiver_account", "amount", "timestamp", "transaction_type"])
        writer.writerows(tx_rows)
    print(f"✓ Created transaction_records.csv ({len(tx_rows)} records)")

    # 5. surveillance_records.json
    surv_data = [
        {
            "person_name": "Vikram Malhotra",
            "source": "Special Intelligence Bureau (SIB) Field Unit",
            "timestamp": iso(T0 + timedelta(days=5, hours=12)),
            "location_lat": 19.0760,
            "location_lng": 72.8777,
            "description": "Target Vikram Malhotra observed meeting Devendra Kumar in the lobby café of Grand Hyatt Mumbai. Target handed over a sealed metallic envelope and encrypted device before departing in black Toyota Fortuner (MH01-CV-9999)."
        },
        {
            "person_name": "Karan Joshi",
            "source": "State Anti-Corruption & Economic Offences Wing",
            "timestamp": iso(T0 + timedelta(days=5, hours=9, minutes=30)),
            "location_lat": 18.9256,
            "location_lng": 72.8242,
            "description": "Karan Joshi spotted conducting quick cash handoff with Sameer Merchant's courier outside Express Towers, Nariman Point."
        }
    ]
    with open(OUTPUT_DIR / "surveillance_records.json", "w", encoding="utf-8") as f:
        json.dump(surv_data, f, indent=2)
    print(f"✓ Created surveillance_records.json ({len(surv_data)} records)")

    # 6. social_media_records.json
    soc_data = [
        {
            "person_name": "Karan Joshi",
            "platform": "Telegram",
            "interaction_type": "message",
            "target_person": "Amit Patel",
            "timestamp": iso(T0 + timedelta(days=5, hours=4)),
            "content": "Encrypted Channel #GARUDA_ALPHA: Payload tested clean on VirusTotal. Forwarding the spoofed PDF invoice template for the corporate wire."
        },
        {
            "person_name": "Amit Patel",
            "platform": "Telegram",
            "interaction_type": "message",
            "target_person": "Karan Joshi",
            "timestamp": iso(T0 + timedelta(days=5, hours=4, minutes=15)),
            "content": "TOR relay is operational at 185.220.101.42. Domain resolves to c2-vault-relay.is. Standing by for payout confirmation."
        }
    ]
    with open(OUTPUT_DIR / "social_media_records.json", "w", encoding="utf-8") as f:
        json.dump(soc_data, f, indent=2)
    print(f"✓ Created social_media_records.json ({len(soc_data)} records)")

    # 7. criminal_history_records.json
    crim_data = [
        {
            "person_name": "Vikram Malhotra",
            "shared_case_ref": "CASE-2022-DEL-0789",
            "offence": "Organized Cyber Fraud & Money Laundering syndicate",
            "co_accused": ["Pooja Nair"],
            "sentence": "Chargesheet filed, currently on conditional high-court bail"
        },
        {
            "person_name": "Pooja Nair",
            "shared_case_ref": "CASE-2022-DEL-0789",
            "offence": "Facilitating mule bank accounts & shell companies",
            "co_accused": ["Vikram Malhotra"],
            "sentence": "Chargesheeted under IPC 420/120B"
        },
        {
            "person_name": "Rohan Sharma",
            "shared_case_ref": "CRIME-MUM-2021-884",
            "offence": "Illegal Hawala transfers & Benami account operation",
            "co_accused": [],
            "sentence": "Arrested in 2021, convicted 18 months"
        }
    ]
    with open(OUTPUT_DIR / "criminal_history_records.json", "w", encoding="utf-8") as f:
        json.dump(crim_data, f, indent=2)
    print(f"✓ Created criminal_history_records.json ({len(crim_data)} records)")

    # 8. location_pings.csv
    with open(OUTPUT_DIR / "location_pings.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["person_name", "lat", "lng", "timestamp"])
        for p in LOCATION_PINGS:
            writer.writerow([p["person_name"], p["lat"], p["lng"], p["timestamp"]])
    print(f"✓ Created location_pings.csv ({len(LOCATION_PINGS)} records)")

if __name__ == "__main__":
    write_all_files()
    print("\nAll clean demo files generated successfully in data-generator/output/!")
