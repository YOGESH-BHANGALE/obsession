"""
Synthetic Data Generator — Criminal Network Analysis Platform
Produces a realistic fictional case with ~40 people.
Deliberately seeds ALL 12 suspicious patterns for demo.

Structure:
  - 1 Kingpin (Vikram Malhotra)
  - 3 Lieutenants
  - 8 Core operatives
  - 10 Peripheral contacts
  - 15+ Innocent contacts (fall below 25% threshold)
  - Organisations, vehicles, locations across India
"""
import sys
import json
import csv
import io
import os
import random
import datetime
import uuid
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


random.seed(42)

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ═══════════════════════════════════════════════════════════════
# People Database
# ═══════════════════════════════════════════════════════════════

KINGPIN = {
    "name": "Vikram Malhotra",
    "phone_numbers": ["+919876543210", "+919876543211"],
    "criminal_history_flag": True,
    "is_seed": True,
    "aliases": ["V.M.", "The Boss", "Vikram Singh"],
    "cross_case_refs": ["CASE-2023-MUM-0456", "CASE-2022-DEL-0789"],
}

LIEUTENANTS = [
    {"name": "Arjun Reddy", "phone_numbers": ["+919845123456"], "criminal_history_flag": True, "aliases": ["AJ"]},
    {"name": "Deepak Yadav", "phone_numbers": ["+919823456789", "+919823456790", "+919823456791"], "criminal_history_flag": True, "aliases": ["DY", "Deep"]},
    {"name": "Farah Sheikh", "phone_numbers": ["+919812345678"], "criminal_history_flag": False, "aliases": []},
]

CORE_OPERATIVES = [
    {"name": "Ganesh Patil", "phone_numbers": ["+919765432100"], "criminal_history_flag": True},
    {"name": "Harpreet Singh", "phone_numbers": ["+919654321000"], "criminal_history_flag": False},
    {"name": "Imran Ali", "phone_numbers": ["+919543210001"], "criminal_history_flag": True},
    {"name": "Jaya Sharma", "phone_numbers": ["+919432100012"], "criminal_history_flag": False},
    {"name": "Kiran Desai", "phone_numbers": ["+919321000123"], "criminal_history_flag": False},
    {"name": "Lakshmi Nair", "phone_numbers": ["+919210001234"], "criminal_history_flag": False},
    {"name": "Mohammed Farooq", "phone_numbers": ["+919100012345"], "criminal_history_flag": True},
    {"name": "Neha Gupta", "phone_numbers": ["+918976543210"], "criminal_history_flag": False},
]

PERIPHERAL = [
    {"name": "Omkar Joshi", "phone_numbers": ["+918865432100"], "criminal_history_flag": False},
    {"name": "Priya Menon", "phone_numbers": ["+918754321000"], "criminal_history_flag": False},
    {"name": "Qadir Hassan", "phone_numbers": ["+918643210001"], "criminal_history_flag": True},
    {"name": "Ritu Agarwal", "phone_numbers": ["+918532100012"], "criminal_history_flag": False},
    {"name": "Suresh Iyer", "phone_numbers": ["+918421000123"], "criminal_history_flag": False},
    {"name": "Tanvi Bhatia", "phone_numbers": ["+918310001234"], "criminal_history_flag": False},
    {"name": "Uday Chauhan", "phone_numbers": ["+918200012345"], "criminal_history_flag": False},
    {"name": "Vandana Pillai", "phone_numbers": ["+918100123456"], "criminal_history_flag": False},
    {"name": "Wasim Khan", "phone_numbers": ["+917987654321"], "criminal_history_flag": False},
    {"name": "Xavier D'Souza", "phone_numbers": ["+917876543210"], "criminal_history_flag": False},
]

INNOCENTS = [
    {"name": "Yamini Devi", "phone_numbers": ["+917765432100"], "criminal_history_flag": False},
    {"name": "Zaheer Abbas", "phone_numbers": ["+917654321000"], "criminal_history_flag": False},
    {"name": "Ananya Mishra", "phone_numbers": ["+917543210001"], "criminal_history_flag": False},
    {"name": "Bharat Patel", "phone_numbers": ["+917432100012"], "criminal_history_flag": False},
    {"name": "Chitra Krishnan", "phone_numbers": ["+917321000123"], "criminal_history_flag": False},
    {"name": "Dinesh Rawat", "phone_numbers": ["+917210001234"], "criminal_history_flag": False},
    {"name": "Esha Tiwari", "phone_numbers": ["+917100012345"], "criminal_history_flag": False},
    {"name": "Farhan Qureshi", "phone_numbers": ["+916987654321"], "criminal_history_flag": False},
    {"name": "Geeta Kapoor", "phone_numbers": ["+916876543210"], "criminal_history_flag": False},
    {"name": "Hemant Saxena", "phone_numbers": ["+916765432100"], "criminal_history_flag": False},
    {"name": "Isha Rajan", "phone_numbers": ["+916654321000"], "criminal_history_flag": False},
    {"name": "Jagdish Thakur", "phone_numbers": ["+916543210001"], "criminal_history_flag": False},
    {"name": "Kavita Soni", "phone_numbers": ["+916432100012"], "criminal_history_flag": False},
    {"name": "Lalita Verma", "phone_numbers": ["+916321000123"], "criminal_history_flag": False},
    {"name": "Manoj Dubey", "phone_numbers": ["+916210001234"], "criminal_history_flag": False},
]

ALL_PERSONS = [KINGPIN] + LIEUTENANTS + CORE_OPERATIVES + PERIPHERAL + INNOCENTS

# Indian cities with coordinates
INDIAN_CITIES = {
    "Mumbai": (19.0760, 72.8777),
    "Delhi": (28.6139, 77.2090),
    "Bangalore": (12.9716, 77.5946),
    "Hyderabad": (17.3850, 78.4867),
    "Chennai": (13.0827, 80.2707),
    "Kolkata": (22.5726, 88.3639),
    "Pune": (18.5204, 73.8567),
    "Jaipur": (26.9124, 75.7873),
    "Lucknow": (26.8467, 80.9462),
    "Ahmedabad": (23.0225, 72.5714),
}


def random_timestamp(days_back=180):
    base = datetime.datetime(2024, 6, 1)
    safe_days = max(0, days_back)
    delta = datetime.timedelta(days=random.randint(0, safe_days), hours=random.randint(0, 23), minutes=random.randint(0, 59))
    return (base + delta).isoformat()



def random_recent_timestamp(days_back=14):
    base = datetime.datetime(2024, 11, 15)
    delta = datetime.timedelta(days=random.randint(0, days_back), hours=random.randint(0, 23))
    return (base + delta).isoformat()


def jitter_coords(lat, lng, km_radius=2):
    """Add random jitter to coordinates within km_radius."""
    dlat = random.uniform(-km_radius, km_radius) / 111.0
    dlng = random.uniform(-km_radius, km_radius) / 111.0
    return round(lat + dlat, 6), round(lng + dlng, 6)


# ═══════════════════════════════════════════════════════════════
# Generate CDR Data
# ═══════════════════════════════════════════════════════════════

def generate_cdr():
    rows = []

    # Kingpin ↔ Lieutenants (high frequency, seeds pattern 1: communication burst)
    for lt in LIEUTENANTS:
        # Normal period: 3-5 calls/day for 6 months
        normal_freq = [random.randint(3, 5) for _ in range(24)]
        # Recent burst: 15-25 calls/day (triggers detector 1)
        burst_freq = [random.randint(15, 25) for _ in range(3)]
        freq_history = normal_freq + burst_freq

        for week in range(27):
            for _ in range(freq_history[min(week, len(freq_history)-1)]):
                ts = random_timestamp(180 - week * 7)
                rows.append({
                    "caller_name": KINGPIN["name"],
                    "callee_name": lt["name"],
                    "caller_number": KINGPIN["phone_numbers"][0],
                    "callee_number": lt["phone_numbers"][0],
                    "timestamp": ts,
                    "duration_seconds": random.randint(30, 600),
                    "frequency": freq_history[min(week, len(freq_history)-1)],
                    "frequency_history": json.dumps(freq_history),
                })

    # Lieutenants ↔ Core operatives
    for lt in LIEUTENANTS:
        for op in random.sample(CORE_OPERATIVES, min(4, len(CORE_OPERATIVES))):
            for _ in range(random.randint(10, 30)):
                rows.append({
                    "caller_name": lt["name"],
                    "callee_name": op["name"],
                    "caller_number": lt["phone_numbers"][0],
                    "callee_number": op["phone_numbers"][0],
                    "timestamp": random_timestamp(),
                    "duration_seconds": random.randint(15, 300),
                    "frequency": random.randint(2, 8),
                    "frequency_history": json.dumps([random.randint(2, 8) for _ in range(20)]),
                })

    # Core ↔ Peripheral
    for op in CORE_OPERATIVES:
        for per in random.sample(PERIPHERAL, 3):
            for _ in range(random.randint(3, 10)):
                rows.append({
                    "caller_name": op["name"],
                    "callee_name": per["name"],
                    "caller_number": op["phone_numbers"][0],
                    "callee_number": per["phone_numbers"][0],
                    "timestamp": random_timestamp(),
                    "duration_seconds": random.randint(10, 120),
                    "frequency": random.randint(1, 3),
                    "frequency_history": json.dumps([random.randint(1, 3) for _ in range(15)]),
                })

    # Innocents: very few calls (1-2 total)
    for inn in INNOCENTS:
        contact = random.choice(PERIPHERAL + CORE_OPERATIVES)
        rows.append({
            "caller_name": contact["name"],
            "callee_name": inn["name"],
            "caller_number": contact["phone_numbers"][0],
            "callee_number": inn["phone_numbers"][0],
            "timestamp": random_timestamp(),
            "duration_seconds": random.randint(5, 60),
            "frequency": 1,
            "frequency_history": json.dumps([1]),
        })

    # Pattern 2: New connection between unrelated people (seeds detector 2)
    rows.append({
        "caller_name": INNOCENTS[0]["name"],
        "callee_name": LIEUTENANTS[2]["name"],
        "caller_number": INNOCENTS[0]["phone_numbers"][0],
        "callee_number": LIEUTENANTS[2]["phone_numbers"][0],
        "timestamp": random_recent_timestamp(3),
        "duration_seconds": 180,
        "frequency": 1,
        "frequency_history": json.dumps([0, 0, 0, 0, 0, 1]),
    })

    return rows


# ═══════════════════════════════════════════════════════════════
# Generate Transaction Data (seeds patterns 7 & 8)
# ═══════════════════════════════════════════════════════════════

def generate_transactions():
    rows = []
    accounts = {}
    for p in ALL_PERSONS:
        accounts[p["name"]] = f"ACC{random.randint(100000, 999999)}"

    # Normal transactions: Kingpin → Lieutenants
    for lt in LIEUTENANTS:
        for _ in range(random.randint(5, 15)):
            rows.append({
                "sender_name": KINGPIN["name"],
                "receiver_name": lt["name"],
                "sender_account": accounts[KINGPIN["name"]],
                "receiver_account": accounts[lt["name"]],
                "amount": random.choice([50000, 100000, 200000, 500000]),
                "timestamp": random_timestamp(),
                "frequency": random.randint(2, 5),
            })

    # Lieutenants → Operatives
    for lt in LIEUTENANTS:
        for op in random.sample(CORE_OPERATIVES, 3):
            for _ in range(random.randint(3, 8)):
                rows.append({
                    "sender_name": lt["name"],
                    "receiver_name": op["name"],
                    "sender_account": accounts[lt["name"]],
                    "receiver_account": accounts[op["name"]],
                    "amount": random.choice([10000, 25000, 50000]),
                    "timestamp": random_timestamp(),
                    "frequency": random.randint(1, 4),
                })

    # Pattern 7: Unusual transaction (very large outlier)
    rows.append({
        "sender_name": CORE_OPERATIVES[2]["name"],
        "receiver_name": PERIPHERAL[0]["name"],
        "sender_account": accounts[CORE_OPERATIVES[2]["name"]],
        "receiver_account": accounts[PERIPHERAL[0]["name"]],
        "amount": 5000000,  # ₹50 lakh — way above normal
        "timestamp": random_recent_timestamp(5),
        "frequency": 1,
    })

    # Pattern 8: Circular transactions (A → B → C → A)
    cycle_members = [KINGPIN["name"], LIEUTENANTS[0]["name"], CORE_OPERATIVES[0]["name"]]
    for i in range(len(cycle_members)):
        sender = cycle_members[i]
        receiver = cycle_members[(i + 1) % len(cycle_members)]
        rows.append({
            "sender_name": sender,
            "receiver_name": receiver,
            "sender_account": accounts[sender],
            "receiver_account": accounts[receiver],
            "amount": 250000,
            "timestamp": random_recent_timestamp(7),
            "frequency": 3,
        })

    return rows


# ═══════════════════════════════════════════════════════════════
# Generate FIR Records
# ═══════════════════════════════════════════════════════════════

def generate_firs():
    return [
        {
            "fir_number": "FIR-2023/1456",
            "date": "2023-08-15T00:00:00",
            "offence": "NDPS Act Section 21(c) — Commercial quantity narcotics possession",
            "description": "During a routine checkpoint on NH-48 near Pune, officers intercepted a vehicle (MH12AB1234) driven by Ganesh Patil. Upon search, 2kg of contraband was recovered from a hidden compartment. Patil confessed that the consignment was meant for delivery to Arjun Reddy at a warehouse in Andheri East, Mumbai. Investigation revealed phone records linking both to Vikram Malhotra. FIR registered at Hinjewadi PS, Pune.",
            "accused_names": ["Vikram Malhotra", "Arjun Reddy", "Ganesh Patil"],
            "police_station": "Hinjewadi PS, Pune"
        },
        {
            "fir_number": "FIR-2024/0234",
            "date": "2024-03-22T00:00:00",
            "offence": "IPC 420 (Cheating) + Prevention of Money Laundering Act",
            "description": "Complaint by State Bank of India regarding suspicious transactions totaling ₹2.5 crore routed through shell companies linked to Deepak Yadav and Farah Sheikh. Multiple benami accounts identified. Trail leads to real estate purchases in Noida and Gurgaon. Imran Ali named as the money courier who made cash deposits at various branches across Delhi NCR.",
            "accused_names": ["Deepak Yadav", "Farah Sheikh", "Imran Ali"],
            "police_station": "Economic Offences Wing, Delhi"
        },
        {
            "fir_number": "FIR-2024/0567",
            "date": "2024-07-10T00:00:00",
            "offence": "Arms Act Section 25 — Illegal possession of firearms",
            "description": "Acting on intelligence, Special Task Force raided a farmhouse in Mehrauli, Delhi. Mohammed Farooq was apprehended with 3 unlicensed pistols and ammunition. During interrogation, Farooq revealed a supply chain involving Qadir Hassan (procurement) and Harpreet Singh (logistics). Links to Vikram Malhotra's network established through call records and financial transactions.",
            "accused_names": ["Mohammed Farooq", "Qadir Hassan", "Harpreet Singh"],
            "police_station": "STF, Delhi"
        }
    ]


# ═══════════════════════════════════════════════════════════════
# Generate Surveillance Records (seeds patterns 5 & 9)
# ═══════════════════════════════════════════════════════════════

def generate_surveillance():
    records = []
    cities = list(INDIAN_CITIES.keys())

    # Kingpin surveillance
    mumbai = INDIAN_CITIES["Mumbai"]
    for i in range(10):
        lat, lng = jitter_coords(*mumbai, 5)
        records.append({
            "person_name": KINGPIN["name"],
            "source": "field_surveillance",
            "timestamp": random_timestamp(),
            "description": f"Subject observed at location in Mumbai. Arrived in a white Toyota Fortuner (MH02CD5678).",
            "lat": lat, "lng": lng,
            "observed_with": random.sample([lt["name"] for lt in LIEUTENANTS], random.randint(0, 2)),
        })

    # Pattern 5: Unusual location sequence (Mumbai → Chennai in 1 hour — impossible)
    records.append({
        "person_name": LIEUTENANTS[0]["name"],
        "source": "mobile_tower",
        "timestamp": "2024-11-20T14:00:00",
        "description": "Mobile tower ping detected in Mumbai",
        "lat": 19.0760, "lng": 72.8777,
        "observed_with": [],
    })
    records.append({
        "person_name": LIEUTENANTS[0]["name"],
        "source": "mobile_tower",
        "timestamp": "2024-11-20T15:00:00",
        "description": "Mobile tower ping detected in Chennai — impossible travel speed",
        "lat": 13.0827, "lng": 80.2707,
        "observed_with": [],
    })

    # Pattern 6: Repeated co-location (multiple people at same spot)
    meet_lat, meet_lng = jitter_coords(*INDIAN_CITIES["Pune"], 0.5)
    for person in [KINGPIN] + LIEUTENANTS + CORE_OPERATIVES[:3]:
        lat, lng = jitter_coords(meet_lat, meet_lng, 0.3)
        records.append({
            "person_name": person["name"],
            "source": "cctv_analysis",
            "timestamp": "2024-11-18T22:30:00",
            "description": f"Subject identified at restaurant in Koregaon Park, Pune",
            "lat": lat, "lng": lng,
            "observed_with": [],
        })

    # Pattern 9: Communication + location correlation
    records.append({
        "person_name": LIEUTENANTS[1]["name"],
        "source": "field_surveillance",
        "timestamp": "2024-11-19T10:00:00",
        "description": "Subject observed making a phone call near Juhu Beach, Mumbai",
        "lat": 19.0988, "lng": 72.8265,
        "observed_with": [CORE_OPERATIVES[3]["name"]],
    })

    # General surveillance for others
    for op in CORE_OPERATIVES:
        city = random.choice(cities)
        lat, lng = jitter_coords(*INDIAN_CITIES[city], 3)
        records.append({
            "person_name": op["name"],
            "source": random.choice(["field_surveillance", "cctv_analysis", "informant_report"]),
            "timestamp": random_timestamp(),
            "description": f"Subject observed in {city}",
            "lat": lat, "lng": lng,
            "observed_with": random.sample([p["name"] for p in CORE_OPERATIVES if p != op], random.randint(0, 1)),
        })

    return records


# ═══════════════════════════════════════════════════════════════
# Generate Social Media Records
# ═══════════════════════════════════════════════════════════════

def generate_social_media():
    records = []
    platforms = ["Instagram", "Facebook", "Twitter", "Telegram", "WhatsApp"]

    # Kingpin social connections
    for lt in LIEUTENANTS:
        records.append({
            "person_name": KINGPIN["name"],
            "target_person_name": lt["name"],
            "platform": random.choice(platforms),
            "interaction_type": random.choice(["message", "follow", "post"]),
            "content": f"Business discussion detected on encrypted platform",
            "timestamp": random_timestamp(),
        })

    # Lieutenant social connections
    for lt in LIEUTENANTS:
        for op in random.sample(CORE_OPERATIVES, 3):
            records.append({
                "person_name": lt["name"],
                "target_person_name": op["name"],
                "platform": random.choice(platforms),
                "interaction_type": random.choice(["message", "like", "post"]),
                "content": "Regular social media interaction observed",
                "timestamp": random_timestamp(),
            })

    return records


# ═══════════════════════════════════════════════════════════════
# Generate Criminal History (seeds pattern 4)
# ═══════════════════════════════════════════════════════════════

def generate_criminal_history():
    records = [
        {
            "person_name": "Vikram Malhotra",
            "shared_case_ref": "CASE-2019-MUM-0123",
            "offence": "Extortion and Intimidation",
            "conviction_date": "2020-03-15T00:00:00",
            "sentence": "3 years imprisonment (released on parole)",
            "co_accused": ["Arjun Reddy"],
        },
        {
            "person_name": "Arjun Reddy",
            "shared_case_ref": "CASE-2019-MUM-0123",
            "offence": "Extortion and Intimidation",
            "conviction_date": "2020-03-15T00:00:00",
            "sentence": "2 years imprisonment",
            "co_accused": ["Vikram Malhotra"],
        },
        {
            "person_name": "Ganesh Patil",
            "shared_case_ref": "CASE-2021-PUN-0456",
            "offence": "Drug trafficking",
            "conviction_date": "2022-01-20T00:00:00",
            "sentence": "5 years imprisonment (appeal pending)",
            "co_accused": ["Imran Ali"],
        },
        {
            "person_name": "Imran Ali",
            "shared_case_ref": "CASE-2021-PUN-0456",
            "offence": "Drug trafficking",
            "conviction_date": "2022-01-20T00:00:00",
            "sentence": "4 years imprisonment",
            "co_accused": ["Ganesh Patil"],
        },
        {
            "person_name": "Mohammed Farooq",
            "shared_case_ref": "CASE-2022-DEL-0789",
            "offence": "Illegal arms possession",
            "conviction_date": "2023-06-10T00:00:00",
            "sentence": "Under trial",
            "co_accused": ["Qadir Hassan"],
        },
        {
            "person_name": "Qadir Hassan",
            "shared_case_ref": "CASE-2022-DEL-0789",
            "offence": "Arms supply chain",
            "conviction_date": None,
            "sentence": "Absconding",
            "co_accused": ["Mohammed Farooq"],
        },
        # Pattern 4: Cross-case match — Vikram appears in multiple cases
        {
            "person_name": "Vikram Malhotra",
            "shared_case_ref": "CASE-2022-DEL-0789",
            "offence": "Conspiracy — linked to arms network",
            "conviction_date": None,
            "sentence": "Under investigation",
            "co_accused": [],
        },
    ]
    return records


# ═══════════════════════════════════════════════════════════════
# Generate Location Pings (for live tracking demo)
# ═══════════════════════════════════════════════════════════════

def generate_location_pings():
    rows = []
    # Generate movement trails for key persons
    key_persons = [KINGPIN] + LIEUTENANTS + CORE_OPERATIVES[:4]

    for person in key_persons:
        # Generate a trail of 20-30 pings over the past month
        city = random.choice(list(INDIAN_CITIES.keys()))
        base_lat, base_lng = INDIAN_CITIES[city]
        base_time = datetime.datetime(2024, 11, 1)

        for i in range(random.randint(20, 30)):
            lat, lng = jitter_coords(base_lat, base_lng, 5)
            ts = base_time + datetime.timedelta(hours=i * random.randint(2, 12))
            rows.append({
                "person_name": person["name"],
                "lat": lat,
                "lng": lng,
                "timestamp": ts.isoformat(),
            })

            # Occasionally jump to a different city
            if random.random() < 0.15:
                city = random.choice(list(INDIAN_CITIES.keys()))
                base_lat, base_lng = INDIAN_CITIES[city]

    return rows


# ═══════════════════════════════════════════════════════════════
# Generate Batch JSON (complete dataset for one-click upload)
# ═══════════════════════════════════════════════════════════════

def generate_batch_json():
    """Generate a complete batch JSON file for the batch_json upload type."""
    persons = []
    edges = []
    events = []
    location_pings = []

    # Create persons
    for p in ALL_PERSONS:
        persons.append({
            "name": p["name"],
            "phone_numbers": p.get("phone_numbers", []),
            "criminal_history_flag": p.get("criminal_history_flag", False),
            "is_seed": p.get("is_seed", False),
            "aliases": p.get("aliases", []),
            "cross_case_refs": p.get("cross_case_refs", []),
        })

    # Create edges from CDR
    cdr_data = generate_cdr()
    seen_edges = set()
    for row in cdr_data:
        key = f"{row['caller_name']}-{row['callee_name']}-CALL"
        if key not in seen_edges:
            seen_edges.add(key)
            edges.append({
                "source_name": row["caller_name"],
                "target_name": row["callee_name"],
                "evidence_type": "CALL",
                "confidence": 0.6,
                "timestamp": row["timestamp"],
                "frequency": row.get("frequency", 1),
                "frequency_history": json.loads(row.get("frequency_history", "[]")),
                "is_new_connection": False,
            })

    # Create edges from transactions
    tx_data = generate_transactions()
    for row in tx_data:
        key = f"{row['sender_name']}-{row['receiver_name']}-TRANSACTION"
        if key not in seen_edges:
            seen_edges.add(key)
            edges.append({
                "source_name": row["sender_name"],
                "target_name": row["receiver_name"],
                "evidence_type": "TRANSACTION",
                "confidence": 0.7,
                "timestamp": row["timestamp"],
                "amount": row["amount"],
                "frequency": row.get("frequency", 1),
                "direction": "forward",
            })

    # FIR edges
    firs = generate_firs()
    for fir in firs:
        accused = fir["accused_names"]
        for i in range(len(accused)):
            for j in range(i+1, len(accused)):
                key = f"{accused[i]}-{accused[j]}-FIR"
                if key not in seen_edges:
                    seen_edges.add(key)
                    edges.append({
                        "source_name": accused[i],
                        "target_name": accused[j],
                        "evidence_type": "FIR",
                        "confidence": 0.8,
                        "timestamp": fir["date"],
                    })

    # Surveillance edges
    surv_data = generate_surveillance()
    for rec in surv_data:
        for obs in rec.get("observed_with", []):
            key = f"{rec['person_name']}-{obs}-SURVEILLANCE"
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append({
                    "source_name": rec["person_name"],
                    "target_name": obs,
                    "evidence_type": "SURVEILLANCE",
                    "confidence": 0.5,
                    "timestamp": rec["timestamp"],
                })

    # Social media edges
    sm_data = generate_social_media()
    for rec in sm_data:
        key = f"{rec['person_name']}-{rec['target_person_name']}-SOCIAL_MEDIA"
        if key not in seen_edges:
            seen_edges.add(key)
            edges.append({
                "source_name": rec["person_name"],
                "target_name": rec["target_person_name"],
                "evidence_type": "SOCIAL_MEDIA",
                "confidence": 0.4,
                "timestamp": rec["timestamp"],
            })

    # Criminal history edges
    ch_data = generate_criminal_history()
    for rec in ch_data:
        for co in rec.get("co_accused", []):
            key = f"{rec['person_name']}-{co}-CRIMINAL_HISTORY"
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append({
                    "source_name": rec["person_name"],
                    "target_name": co,
                    "evidence_type": "CRIMINAL_HISTORY",
                    "confidence": 0.9,
                })

    # Mark one edge as new connection (pattern 2)
    for e in edges:
        if e["source_name"] == INNOCENTS[0]["name"] and e["target_name"] == LIEUTENANTS[2]["name"]:
            e["is_new_connection"] = True

    # Events
    events.append({
        "timestamp": "2024-08-15T14:30:00",
        "event_type": "crime_event",
        "description": "Drug seizure at NH-48 checkpoint near Pune. 2kg contraband recovered from vehicle MH12AB1234.",
        "linked_person_names": ["Vikram Malhotra", "Arjun Reddy", "Ganesh Patil"],
    })
    events.append({
        "timestamp": "2024-03-22T10:00:00",
        "event_type": "crime_event",
        "description": "Suspicious transactions totaling ₹2.5 crore identified by SBI. Shell companies linked to network.",
        "linked_person_names": ["Deepak Yadav", "Farah Sheikh", "Imran Ali"],
    })
    events.append({
        "timestamp": "2024-07-10T06:00:00",
        "event_type": "crime_event",
        "description": "STF raid at Mehrauli farmhouse. 3 unlicensed firearms recovered.",
        "linked_person_names": ["Mohammed Farooq", "Qadir Hassan", "Harpreet Singh"],
    })
    events.append({
        "timestamp": "2024-11-18T22:30:00",
        "event_type": "network_event",
        "description": "Multiple network members identified at restaurant in Koregaon Park, Pune. Possible coordination meeting.",
        "linked_person_names": ["Vikram Malhotra", "Arjun Reddy", "Deepak Yadav", "Farah Sheikh"],
    })
    events.append({
        "timestamp": "2024-11-20T14:00:00",
        "event_type": "network_event",
        "description": "Anomalous mobile tower ping: Arjun Reddy detected in Mumbai and Chennai within 1 hour.",
        "linked_person_names": ["Arjun Reddy"],
    })

    # Additional network events
    for i in range(8):
        ts = random_timestamp()
        linked = random.sample([p["name"] for p in CORE_OPERATIVES + LIEUTENANTS], random.randint(2, 4))
        events.append({
            "timestamp": ts,
            "event_type": "network_event",
            "description": f"Communication spike detected between network members",
            "linked_person_names": linked,
        })

    # Location pings
    ping_data = generate_location_pings()
    for row in ping_data:
        location_pings.append(row)

    return {
        "persons": persons,
        "edges": edges,
        "events": events,
        "location_pings": location_pings,
    }


# ═══════════════════════════════════════════════════════════════
# Write all files
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("Generating synthetic criminal network data...")
    print("=" * 60)

    # CDR CSV
    cdr = generate_cdr()
    with open(OUTPUT_DIR / "cdr_records.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=cdr[0].keys())
        writer.writeheader()
        writer.writerows(cdr)
    print(f"✓ CDR records: {len(cdr)} rows → cdr_records.csv")

    # Transaction CSV
    tx = generate_transactions()
    with open(OUTPUT_DIR / "transaction_records.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=tx[0].keys())
        writer.writeheader()
        writer.writerows(tx)
    print(f"✓ Transaction records: {len(tx)} rows → transaction_records.csv")

    # FIR JSON
    firs = generate_firs()
    with open(OUTPUT_DIR / "fir_records.json", "w", encoding="utf-8") as f:
        json.dump(firs, f, indent=2)
    print(f"✓ FIR records: {len(firs)} FIRs → fir_records.json")

    # Surveillance JSON
    surv = generate_surveillance()
    with open(OUTPUT_DIR / "surveillance_records.json", "w", encoding="utf-8") as f:
        json.dump(surv, f, indent=2)
    print(f"✓ Surveillance records: {len(surv)} → surveillance_records.json")

    # Social Media JSON
    sm = generate_social_media()
    with open(OUTPUT_DIR / "social_media_records.json", "w", encoding="utf-8") as f:
        json.dump(sm, f, indent=2)
    print(f"✓ Social media records: {len(sm)} → social_media_records.json")

    # Criminal History JSON
    ch = generate_criminal_history()
    with open(OUTPUT_DIR / "criminal_history_records.json", "w", encoding="utf-8") as f:
        json.dump(ch, f, indent=2)
    print(f"✓ Criminal history records: {len(ch)} → criminal_history_records.json")

    # Location Pings CSV
    pings = generate_location_pings()
    with open(OUTPUT_DIR / "location_pings.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["person_name", "lat", "lng", "timestamp"])
        writer.writeheader()
        writer.writerows(pings)
    print(f"✓ Location pings: {len(pings)} → location_pings.csv")

    # Batch JSON (complete dataset)
    batch = generate_batch_json()
    with open(OUTPUT_DIR / "complete_case_data.json", "w", encoding="utf-8") as f:
        json.dump(batch, f, indent=2)
    print(f"✓ Complete batch JSON → complete_case_data.json")
    print(f"  Persons: {len(batch['persons'])}")
    print(f"  Edges: {len(batch['edges'])}")
    print(f"  Events: {len(batch['events'])}")
    print(f"  Location pings: {len(batch['location_pings'])}")

    print()
    print("=" * 60)
    print("All synthetic data generated successfully!")
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
