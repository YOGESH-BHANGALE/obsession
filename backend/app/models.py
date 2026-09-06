"""
SQLAlchemy ORM models for the Criminal Network Analysis Platform.
Aligned with the multi-source law enforcement investigation dataset:
- Persons, Phone Numbers, Financial Accounts & Transactions, CDR Calls
- FIRs, Police Reports, Surveillance, Criminal History, Social Media
- Master Graph Relationships & Ground Truth Network Roles
"""
import datetime
import uuid
from sqlalchemy import (
    Column, String, Float, Boolean, Integer, Text, DateTime,
    ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


# ───────────────────────── Users & Auth ─────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="investigator")  # investigator | senior_authority | admin
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    cases = relationship("CaseInvestigator", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")


# ───────────────────────── Cases ─────────────────────────

class Case(Base):
    __tablename__ = "cases"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_number = Column(String(100), nullable=True, index=True)
    case_type = Column(String(100), default="cybercrime")  # cybercrime | narcotics | fraud | extortion | theft | etc.
    title = Column(String(500), nullable=False)
    description = Column(Text, default="")
    status = Column(String(50), default="under_investigation")  # active | under_investigation | chargesheet_filed | convicted | closed
    standing_authorisation = Column(Boolean, default=False)
    opened_date = Column(String(50), nullable=True)
    closed_date = Column(String(50), nullable=True)
    jurisdiction_location_id = Column(String, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    investigators = relationship("CaseInvestigator", back_populates="case")
    persons = relationship("Person", back_populates="case")
    events = relationship("Event", back_populates="case")
    audit_logs = relationship("AuditLog", back_populates="case")


class CaseInvestigator(Base):
    __tablename__ = "case_investigators"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    can_approve_expansion = Column(Boolean, default=True)
    can_track_location = Column(Boolean, default=False)
    assigned_at = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("Case", back_populates="investigators")
    user = relationship("User", back_populates="cases")


# ───────────────────────── Entity Nodes ─────────────────────────

class Person(Base):
    __tablename__ = "persons"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)  # Primary associated case, if any
    name = Column(String(255), nullable=False)  # full_name
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    aadhaar_id = Column(String(50), nullable=True, index=True)
    gender = Column(String(20), nullable=True)
    date_of_birth = Column(String(50), nullable=True)
    age = Column(Integer, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    occupation = Column(String(150), nullable=True)
    email = Column(String(150), nullable=True)
    marital_status = Column(String(50), nullable=True)
    household_id = Column(String(100), nullable=True)
    family_role = Column(String(50), nullable=True)
    notes = Column(Text, default="")
    photo_url = Column(String(500), default="")
    phone_numbers = Column(JSON, default=list)  # list of strings
    criminal_history_flag = Column(Boolean, default=False)
    network_role = Column(String(100), default="")  # kingpin | lieutenant | operative | mule | peripheral
    suspicion_score = Column(Float, default=0.0)  # 0–1
    hierarchy_score = Column(Float, default=0.0)  # 0–1
    confidence_band = Column(String(20), default="unexplored")  # inner | middle | outer | unexplored
    explored = Column(Boolean, default=False)
    is_seed = Column(Boolean, default=False)
    aliases = Column(JSON, default=list)
    source_refs = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("Case", back_populates="persons")
    phone_records = relationship("PhoneNumber", back_populates="person")
    financial_accounts = relationship("FinancialAccount", back_populates="person")


class PhoneNumber(Base):
    __tablename__ = "phone_numbers"

    id = Column(String, primary_key=True, default=gen_uuid)  # phone_id
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    phone_number = Column(String(50), nullable=False, index=True)
    phone_type = Column(String(50), default="primary")  # primary | burner | alternate
    carrier = Column(String(100), default="")
    activated_date = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    person = relationship("Person", back_populates="phone_records")


class FinancialAccount(Base):
    __tablename__ = "financial_accounts"

    id = Column(String, primary_key=True, default=gen_uuid)  # account_id
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    organization_id = Column(String, nullable=True)
    account_number = Column(String(100), nullable=False, index=True)
    account_type = Column(String(50), default="savings")  # savings | current | mule_transit | hawala_counter
    ifsc_code = Column(String(50), default="")
    opened_date = Column(String(50), nullable=True)
    status = Column(String(50), default="active")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    person = relationship("Person", back_populates="financial_accounts")


class Location(Base):
    __tablename__ = "locations"

    id = Column(String, primary_key=True, default=gen_uuid)  # location_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    city = Column(String(100), default="")
    state = Column(String(100), default="")
    area = Column(String(255), default="")
    location_type = Column(String(100), default="residential")  # residential | commercial | transit | police_station
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    pincode = Column(String(20), default="")
    address = Column(String(500), default="")
    associated_event_ids = Column(JSON, default=list)
    source_refs = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Organisation(Base):
    __tablename__ = "organisations"

    id = Column(String, primary_key=True, default=gen_uuid)  # organization_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    name = Column(String(255), nullable=False)
    org_type = Column(String(100), default="")  # bank | shell_company | hawala_hub | commercial
    location_id = Column(String, nullable=True)
    description = Column(Text, default="")
    associated_person_ids = Column(JSON, default=list)
    source_refs = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(String, primary_key=True, default=gen_uuid)  # vehicle_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    registration_number = Column(String(50), nullable=False, index=True)
    vehicle_type = Column(String(100), default="car")  # car | motorcycle | truck
    make = Column(String(100), default="")
    model = Column(String(100), default="")
    color = Column(String(50), default="")
    owner_person_id = Column(String, nullable=True)
    registered_location_id = Column(String, nullable=True)
    associated_person_ids = Column(JSON, default=list)
    event_ids = Column(JSON, default=list)
    source_refs = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, default=gen_uuid)  # event_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    event_name = Column(String(255), default="")
    event_type = Column(String(100), default="general")
    event_date = Column(String(50), nullable=True)
    timestamp = Column(DateTime, nullable=True)
    location_id = Column(String, nullable=True)
    description = Column(Text, default="")
    linked_entity_ids = Column(JSON, default=list)
    is_predicted = Column(Boolean, default=False)
    source_refs = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("Case", back_populates="events")


# ───────────────────────── Raw Data Records ─────────────────────────

class CDRRecord(Base):
    __tablename__ = "cdr_records"

    id = Column(String, primary_key=True, default=gen_uuid)  # call_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    caller_person_id = Column(String, ForeignKey("persons.id"), nullable=True)
    receiver_person_id = Column(String, ForeignKey("persons.id"), nullable=True)
    person_id = Column(String, nullable=True)  # legacy compatibility
    caller_phone = Column(String(50), nullable=False)
    receiver_phone = Column(String(50), nullable=False)
    caller_number = Column(String(50), nullable=True)  # legacy alias
    callee_number = Column(String(50), nullable=True)  # legacy alias
    timestamp = Column(DateTime, nullable=False)
    call_timestamp = Column(String(50), nullable=True)
    duration_seconds = Column(Integer, default=0)
    call_duration = Column(Integer, default=0)
    call_type = Column(String(50), default="voice")
    caller_location_id = Column(String, nullable=True)
    receiver_location_id = Column(String, nullable=True)
    linked_case_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class TransactionRecord(Base):
    __tablename__ = "transaction_records"

    id = Column(String, primary_key=True, default=gen_uuid)  # transaction_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    sender_person_id = Column(String, ForeignKey("persons.id"), nullable=True)
    receiver_person_id = Column(String, ForeignKey("persons.id"), nullable=True)
    person_id = Column(String, nullable=True)  # legacy alias
    sender_account_id = Column(String(100), nullable=True)
    receiver_account_id = Column(String(100), nullable=True)
    sender_account = Column(String(100), nullable=True)  # legacy alias
    receiver_account = Column(String(100), nullable=True)  # legacy alias
    amount = Column(Float, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    transaction_timestamp = Column(String(50), nullable=True)
    transaction_type = Column(String(50), default="transfer")
    platform = Column(String(50), default="IMPS")  # IMPS | NEFT | RTGS | UPI | Hawala
    location_id = Column(String, nullable=True)
    description = Column(Text, default="")
    linked_case_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class FIRRecord(Base):
    __tablename__ = "fir_records"

    id = Column(String, primary_key=True, default=gen_uuid)  # fir_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    person_id = Column(String, nullable=True)
    fir_number = Column(String(100), nullable=False, index=True)
    date = Column(DateTime, nullable=False)
    filed_date = Column(String(50), nullable=True)
    location_id = Column(String, nullable=True)
    primary_complainant_person_id = Column(String, nullable=True)
    involved_person_ids = Column(JSON, default=list)
    offence = Column(String(500), default="")
    description = Column(Text, default="")  # narrative
    narrative = Column(Text, default="")
    police_station = Column(String(255), default="")
    status = Column(String(50), default="under_investigation")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class PoliceReport(Base):
    __tablename__ = "police_reports"

    id = Column(String, primary_key=True, default=gen_uuid)  # report_id
    fir_id = Column(String, nullable=True)
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    report_date = Column(String(50), nullable=True)
    officer_name = Column(String(150), default="")
    report_type = Column(String(100), default="follow_up_investigation")
    involved_person_ids = Column(JSON, default=list)
    narrative = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SurveillanceRecord(Base):
    __tablename__ = "surveillance_records"

    id = Column(String, primary_key=True, default=gen_uuid)  # observation_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    person_id = Column(String, nullable=True)
    source = Column(String(100), default="Field Unit")
    timestamp = Column(DateTime, nullable=True)
    observation_timestamp = Column(String(50), nullable=True)
    location_id = Column(String, nullable=True)
    observed_person_ids = Column(JSON, default=list)
    vehicle_id = Column(String, nullable=True)
    object_id = Column(String, nullable=True)
    officer_reference = Column(String(150), default="")
    description = Column(Text, default="")  # narrative
    narrative = Column(Text, default="")
    source_reliability = Column(String(50), default="medium")
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SurveillanceReport(Base):
    __tablename__ = "surveillance_reports"

    id = Column(String, primary_key=True, default=gen_uuid)  # surveillance_report_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    report_date = Column(String(50), nullable=True)
    observation_ids = Column(JSON, default=list)
    involved_person_ids = Column(JSON, default=list)
    narrative = Column(Text, default="")
    officer_name = Column(String(150), default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class CriminalHistoryRecord(Base):
    __tablename__ = "criminal_history_records"

    id = Column(String, primary_key=True, default=gen_uuid)  # history_id
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    person_id = Column(String, nullable=True)
    case_type = Column(String(100), default="")
    year = Column(String(20), default="")
    status = Column(String(50), default="convicted")  # convicted | acquitted | pending_trial
    charges = Column(String(500), default="")
    court_name = Column(String(255), default="")
    linked_person_ids = Column(JSON, default=list)
    description = Column(Text, default="")
    shared_case_ref = Column(String(100), default="")
    offence = Column(String(500), default="")
    conviction_date = Column(DateTime, nullable=True)
    sentence = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SocialMediaAccount(Base):
    __tablename__ = "social_media_accounts"

    id = Column(String, primary_key=True, default=gen_uuid)  # social_account_id
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    platform = Column(String(50), nullable=False)  # WhatsApp | Telegram | Twitter | Instagram | Keybase
    username = Column(String(100), nullable=False)
    display_name = Column(String(150), default="")
    created_date = Column(String(50), nullable=True)
    follower_count = Column(Integer, default=0)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SocialMediaChat(Base):
    __tablename__ = "social_media_chats"

    id = Column(String, primary_key=True, default=gen_uuid)  # chat_id
    platform = Column(String(50), nullable=False)
    sender_person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    receiver_person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    chat_timestamp = Column(String(50), nullable=True)
    message_text = Column(Text, default="")
    mentioned_person_ids = Column(JSON, default=list)
    referenced_location_id = Column(String, nullable=True)
    referenced_event_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SocialMediaPost(Base):
    __tablename__ = "social_media_posts"

    id = Column(String, primary_key=True, default=gen_uuid)  # post_id
    social_account_id = Column(String, nullable=True)
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    platform = Column(String(50), nullable=False)
    post_timestamp = Column(String(50), nullable=True)
    content = Column(Text, default="")
    mentioned_person_ids = Column(JSON, default=list)
    referenced_location_id = Column(String, nullable=True)
    referenced_event_id = Column(String, nullable=True)
    media_reference = Column(String(100), nullable=True)
    sentiment = Column(String(50), default="neutral")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SocialMediaRecord(Base):
    __tablename__ = "social_media_records"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    platform = Column(String(50), nullable=False)
    interaction_type = Column(String(50), default="post")
    content = Column(Text, default="")
    target_person_id = Column(String, nullable=True)
    timestamp = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class LocationPing(Base):
    __tablename__ = "location_pings"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    source = Column(String(50), default="cell_tower")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ───────────────────────── Master Graph Relationships & Ground Truth ─────────────────────────

class GraphRelationship(Base):
    """Corresponds to graph_relationships.csv (26,832 edges)."""
    __tablename__ = "graph_relationships"

    id = Column(String, primary_key=True, default=gen_uuid)  # relationship_id
    source_entity_id = Column(String, nullable=False, index=True)
    source_entity_type = Column(String(50), default="PERSON")
    target_entity_id = Column(String, nullable=False, index=True)
    target_entity_type = Column(String(50), default="PERSON")
    relationship_type = Column(String(100), nullable=False, index=True)  # called | financial_transfer | named_together_in_fir | co_observed | etc.
    timestamp = Column(String(50), nullable=True)
    evidence_source = Column(String(100), default="")  # cdr_records | financial_transactions | firs | surveillance_records | etc.
    case_id = Column(String, nullable=True, index=True)
    confidence = Column(Float, default=0.5)
    suspicious_indicator = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class GroundTruthNetwork(Base):
    """Corresponds to ground_truth_network.csv (830 verified syndicate nodes/roles)."""
    __tablename__ = "ground_truth_networks"

    id = Column(String, primary_key=True, default=gen_uuid)  # ground_truth_id
    person_id = Column(String, nullable=False, index=True)
    network_role = Column(String(100), nullable=False)  # cdr_kingpin | financial_kingpin | cdr_lieutenant | financial_mule | cdr_operative | etc.
    related_person_id = Column(String, nullable=True)
    relationship_type = Column(String(100), default="")
    evidence_sources = Column(String(255), default="")
    confidence = Column(Float, default=0.5)
    case_id = Column(String, nullable=True, index=True)
    event_id = Column(String, nullable=True)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ───────────────────────── Legacy Graph Edges Table ─────────────────────────

class Edge(Base):
    __tablename__ = "edges"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    source_person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    target_person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    evidence_type = Column(String(50), nullable=False)  # CALL | TRANSACTION | FIR | SURVEILLANCE | SOCIAL_MEDIA | CRIMINAL_HISTORY | CO_LOCATION
    confidence = Column(Float, default=0.5)
    properties = Column(JSON, default=dict)
    source_record_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ───────────────────────── Pattern Alerts ─────────────────────────

class PatternAlert(Base):
    __tablename__ = "pattern_alerts"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    detector_name = Column(String(100), nullable=False)
    severity = Column(String(20), default="medium")  # low | medium | high | critical
    title = Column(String(500), nullable=False)
    description = Column(Text, default="")
    involved_person_ids = Column(JSON, default=list)
    involved_edge_ids = Column(JSON, default=list)
    evidence_data = Column(JSON, default=dict)
    is_confirmed = Column(Boolean, nullable=True)
    reviewed_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ───────────────────────── Approval Requests ─────────────────────────

class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    request_type = Column(String(50), nullable=False)  # expansion | location_tracking
    status = Column(String(20), default="pending")  # pending | approved | rejected
    requested_by = Column(String, ForeignKey("users.id"), nullable=False)
    reviewed_by = Column(String, ForeignKey("users.id"), nullable=True)
    justification = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)


# ───────────────────────── Audit Log ─────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    action = Column(String(100), nullable=False)
    target_type = Column(String(50), nullable=True)
    target_id = Column(String, nullable=True)
    details = Column(JSON, default=dict)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")
    case = relationship("Case", back_populates="audit_logs")


# ───────────────────────── Investigator Custom Rules ─────────────────────────

class CustomRule(Base):
    __tablename__ = "custom_rules"

    id = Column(String, primary_key=True, default=gen_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    rule_type = Column(String(50), nullable=False)
    conditions = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
