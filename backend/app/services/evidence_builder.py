"""
Evidence Builder Service.
Selectively queries SQLite and NetworkX GraphStore to provide strictly grounded,
case-isolated contextual evidence for the AI Investigator Assistant.
"""
from typing import Optional, List, Dict, Any, Tuple
import re
import networkx as nx
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models import (
    Case, Person, Edge, GraphRelationship, PatternAlert,
    CDRRecord, TransactionRecord, FIRRecord, SurveillanceRecord,
    CriminalHistoryRecord, PhoneNumber, FinancialAccount
)
from app.graph_store import get_graph_store


def extract_mentioned_persons(
    db: Session,
    case_id: str,
    question: str,
    selected_person_id: Optional[str] = None
) -> List[Person]:
    """
    Identifies Persons involved in the question or explicitly selected.
    Strictly isolated to the given case_id.
    """
    store = get_graph_store()
    case_nodes = store.get_all_person_nodes(case_id)
    node_pids = [n["id"] for n in case_nodes if "id" in n]
    if node_pids:
        persons = db.query(Person).filter(Person.id.in_(node_pids)).all()
    else:
        persons = db.query(Person).filter(Person.case_id == case_id).all()
        if not persons:
            persons = db.query(Person).order_by(Person.suspicion_score.desc()).limit(100).all()
    if not persons:
        return []

    identified: List[Person] = []
    seen_ids = set()

    # 1. Check selected_person_id
    if selected_person_id:
        for p in persons:
            if p.id == selected_person_id:
                identified.append(p)
                seen_ids.add(p.id)
                break

    # 2. Check question text against names, aliases, and parts of names
    q_lower = question.lower()
    for p in persons:
        if p.id in seen_ids:
            continue

        full_name = (p.name or "").strip().lower()
        first_name = (p.first_name or "").strip().lower()
        last_name = (p.last_name or "").strip().lower()

        # Check full name and individual tokens (first name, last name)
        name_parts = [part.strip().lower() for part in (p.name or "").split() if len(part.strip()) >= 3]
        if first_name and len(first_name) >= 3 and first_name not in name_parts:
            name_parts.append(first_name)
        if last_name and len(last_name) >= 3 and last_name not in name_parts:
            name_parts.append(last_name)

        matched = False
        if full_name and len(full_name) >= 3 and full_name in q_lower:
            matched = True
        else:
            for part in name_parts:
                if re.search(r'\b' + re.escape(part) + r'\b', q_lower):
                    matched = True
                    break
        
        if not matched and p.aliases and isinstance(p.aliases, list):
            for alias in p.aliases:
                alias_str = str(alias).strip().lower()
                if len(alias_str) >= 3 and re.search(r'\b' + re.escape(alias_str) + r'\b', q_lower):
                    matched = True
                    break

        if matched:
            identified.append(p)
            seen_ids.add(p.id)

    return identified


def build_person_profile(db: Session, case_id: str, person: Person) -> Tuple[Dict[str, Any], List[str]]:
    """Builds a structured profile and evidence citations for a single Person."""
    citations = [f"Person: {person.name} (ID: {str(person.id)[:8]}..., Suspicion: {float(person.suspicion_score or 0.0):.2f})"]

    # Phone numbers
    phones = [rec.phone_number for rec in person.phone_records] if person.phone_records else (person.phone_numbers or [])
    
    # Financial accounts
    accounts = [f"{acc.account_type}: {acc.account_number}" for acc in person.financial_accounts] if person.financial_accounts else []

    profile = {
        "id": person.id,
        "name": person.name,
        "suspicion_score": round(float(person.suspicion_score or 0.0), 3),
        "hierarchy_score": round(float(person.hierarchy_score or 0.0), 3),
        "confidence_band": person.confidence_band or "unexplored",
        "network_role": person.network_role or "Unassigned",
        "criminal_history_flag": person.criminal_history_flag,
        "city": person.city or "Unknown",
        "occupation": person.occupation or "Unknown",
        "phones": phones,
        "accounts": accounts,
        "aliases": person.aliases or [],
        "notes": person.notes or ""
    }
    return profile, citations


def get_person_connections(
    db: Session,
    case_id: str,
    person_id: str
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Retrieves direct graph edges, connections, and evidence sources for a person from NetworkX and SQL."""
    citations = []
    connections = []

    # Get all persons for name lookup
    case_persons = {p.id: p.name for p in db.query(Person.id, Person.name).all()}
    person_name = case_persons.get(person_id, person_id[:8])

    # 1. Query NetworkX primary graph store
    graph_store = get_graph_store()
    G = graph_store.get_networkx_graph(case_id)

    if G.has_node(person_id):
        for neighbor_id in G.neighbors(person_id):
            edge_data = G.get_edge_data(person_id, neighbor_id) or {}
            peer_name = case_persons.get(neighbor_id, neighbor_id[:8])
            ev_types = edge_data.get("evidence_types") or [edge_data.get("evidence_type", "UNKNOWN")]
            ev_str = ", ".join(ev_types)
            conf = edge_data.get("confidence", 0.5)
            freq = edge_data.get("frequency", 0)
            amt = edge_data.get("amount", 0)

            details = {}
            if freq:
                details["frequency"] = freq
            if amt:
                details["amount"] = amt
            if edge_data.get("timestamp"):
                details["timestamp"] = edge_data["timestamp"]

            connections.append({
                "connected_to": peer_name,
                "connected_person_id": neighbor_id,
                "evidence_type": ev_str,
                "confidence": conf,
                "details": details
            })

            cit = f"Graph Connection: {person_name} ↔ {peer_name} via {ev_str} (Conf: {conf:.2f}{f', {freq} calls' if freq else ''}{f', ₹{amt}' if amt else ''})"
            citations.append(cit)

    # 2. Check SQL Edge table as fallback / supplement
    sql_edges = db.query(Edge).filter(
        Edge.case_id == case_id,
        or_(Edge.source_person_id == person_id, Edge.target_person_id == person_id)
    ).all()
    for edge in sql_edges:
        peer_id = edge.target_person_id if edge.source_person_id == person_id else edge.source_person_id
        peer_name = case_persons.get(peer_id, peer_id[:8])
        # If not already present
        if not any(c["connected_person_id"] == peer_id for c in connections):
            connections.append({
                "connected_to": peer_name,
                "connected_person_id": peer_id,
                "evidence_type": edge.evidence_type,
                "confidence": edge.confidence,
                "details": edge.properties or {}
            })
            citations.append(f"Connection: {person_name} ↔ {peer_name} via {edge.evidence_type}")

    return connections, citations


def get_person_records(
    db: Session,
    case_id: str,
    person_id: str
) -> Tuple[Dict[str, Any], List[str]]:
    """Fetches CDR, Transactions, FIRs, Surveillance, and Criminal History for a person."""
    citations = []
    
    # 1. CDR Calls
    calls = db.query(CDRRecord).filter(
        CDRRecord.case_id == case_id,
        or_(CDRRecord.caller_person_id == person_id, CDRRecord.receiver_person_id == person_id)
    ).limit(30).all()
    call_summary = {
        "total_calls_found": len(calls),
        "sample_calls": [
            {
                "timestamp": str(c.timestamp or c.call_timestamp),
                "duration_seconds": c.duration_seconds or c.call_duration,
                "caller_phone": c.caller_phone or c.caller_number,
                "receiver_phone": c.receiver_phone or c.callee_number,
                "call_type": c.call_type
            }
            for c in calls[:5]
        ]
    }
    if calls:
        citations.append(f"CDR Records: {len(calls)} calls recorded for person")

    # 2. Transactions
    txs = db.query(TransactionRecord).filter(
        TransactionRecord.case_id == case_id,
        or_(TransactionRecord.sender_person_id == person_id, TransactionRecord.receiver_person_id == person_id)
    ).limit(30).all()
    total_volume = sum(t.amount or 0 for t in txs)
    tx_summary = {
        "total_transactions": len(txs),
        "total_amount": total_volume,
        "sample_transactions": [
            {
                "timestamp": str(t.timestamp or t.transaction_timestamp),
                "amount": t.amount,
                "platform": t.platform,
                "description": t.description
            }
            for t in txs[:5]
        ]
    }
    if txs:
        citations.append(f"Financial Transactions: {len(txs)} transactions totaling ₹{total_volume:,.2f}")

    # 3. FIR Records
    firs = db.query(FIRRecord).filter(
        FIRRecord.case_id == case_id,
        or_(
            FIRRecord.person_id == person_id,
            FIRRecord.primary_complainant_person_id == person_id
        )
    ).all()
    # Check JSON involved_person_ids as well
    all_case_firs = db.query(FIRRecord).filter(FIRRecord.case_id == case_id).all()
    for f in all_case_firs:
        if f not in firs and f.involved_person_ids and person_id in f.involved_person_ids:
            firs.append(f)

    fir_list = [
        {
            "fir_number": f.fir_number,
            "offence": f.offence,
            "narrative": f.narrative or f.description,
            "police_station": f.police_station,
            "status": f.status
        }
        for f in firs
    ]
    for f in firs:
        citations.append(f"FIR Record: {f.fir_number} ({f.offence})")

    # 4. Surveillance
    surv = db.query(SurveillanceRecord).filter(
        SurveillanceRecord.case_id == case_id,
        or_(
            SurveillanceRecord.person_id == person_id,
            SurveillanceRecord.description.ilike(f"%{person_id}%")
        )
    ).all()
    all_case_surv = db.query(SurveillanceRecord).filter(SurveillanceRecord.case_id == case_id).all()
    for s in all_case_surv:
        if s not in surv and s.observed_person_ids and person_id in s.observed_person_ids:
            surv.append(s)

    surv_list = [
        {
            "source": s.source,
            "timestamp": str(s.timestamp or s.observation_timestamp),
            "description": s.narrative or s.description,
            "reliability": s.source_reliability
        }
        for s in surv
    ]
    for s in surv:
        citations.append(f"Surveillance Observation: {s.source} ({s.observation_timestamp or s.timestamp})")

    # 5. Criminal History
    hist = db.query(CriminalHistoryRecord).filter(
        CriminalHistoryRecord.case_id == case_id,
        CriminalHistoryRecord.person_id == person_id
    ).all()
    hist_list = [
        {
            "case_type": h.case_type,
            "charges": h.charges or h.offence,
            "status": h.status,
            "court": h.court_name,
            "sentence": h.sentence,
            "year": h.year
        }
        for h in hist
    ]
    for h in hist:
        citations.append(f"Criminal History: {h.charges or h.case_type} ({h.year}) - {h.status}")

    records = {
        "cdr": call_summary,
        "financial": tx_summary,
        "firs": fir_list,
        "surveillance": surv_list,
        "criminal_history": hist_list
    }
    return records, citations


def get_person_alerts(
    db: Session,
    case_id: str,
    person_id: str,
    person_name: str
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Retrieves analytical pattern alerts involving a specific person."""
    citations = []
    alerts = db.query(PatternAlert).filter(PatternAlert.case_id == case_id).all()
    matching_alerts = []

    for a in alerts:
        is_involved = False
        if a.involved_person_ids and person_id in a.involved_person_ids:
            is_involved = True
        elif person_name and person_name.lower() in (a.title or "").lower():
            is_involved = True
        elif person_name and person_name.lower() in (a.description or "").lower():
            is_involved = True

        if is_involved:
            matching_alerts.append({
                "detector": a.detector_name,
                "severity": a.severity,
                "title": a.title,
                "description": a.description,
                "evidence_data": a.evidence_data
            })
            citations.append(f"Pattern Alert: [{a.severity.upper()}] {a.title}")

    return matching_alerts, citations


def build_relationship_context(
    db: Session,
    case_id: str,
    p1: Person,
    p2: Person
) -> Tuple[str, List[str]]:
    """
    Builds context explaining the exact link, paths, and shared evidence between two persons.
    """
    citations = []
    graph_store = get_graph_store()
    G = graph_store.get_networkx_graph(case_id)

    # Direct edges from NetworkX graph store
    direct_edge_found = False
    edge_types: List[str] = []
    edge_details = []

    if G.has_edge(p1.id, p2.id):
        direct_edge_found = True
        edata = G.get_edge_data(p1.id, p2.id) or {}
        raw_ev = edata.get("evidence_types") or [edata.get("evidence_type", "UNKNOWN")]
        ev_types = [str(t) for t in raw_ev if t is not None]
        edge_types.extend(ev_types)
        edge_details.append(edata)
        conf = float(edata.get("confidence", 0.5))
        freq = int(edata.get("frequency", 0))
        citations.append(f"Direct Edge: {p1.name} ↔ {p2.name} via {', '.join(ev_types)} (Conf: {conf:.2f}{f', {freq} calls' if freq else ''})")

    # Direct edges from SQL Edge table as fallback / supplement
    direct_edges = db.query(Edge).filter(
        Edge.case_id == case_id,
        or_(
            and_(Edge.source_person_id == p1.id, Edge.target_person_id == p2.id),
            and_(Edge.source_person_id == p2.id, Edge.target_person_id == p1.id)
        )
    ).all()

    for e in direct_edges:
        direct_edge_found = True
        ev_type_str = str(e.evidence_type)
        if ev_type_str not in edge_types:
            edge_types.append(ev_type_str)
        if e.properties:
            edge_details.append(e.properties)
        citations.append(f"Direct Edge (SQL): {p1.name} ↔ {p2.name} via {ev_type_str} (Confidence: {e.confidence})")

    # Shortest path via NetworkX
    shortest_path_names: List[str] = []
    if G.has_node(p1.id) and G.has_node(p2.id):
        try:
            raw_path = nx.shortest_path(G, source=p1.id, target=p2.id)  # type: ignore
            path_nodes = list(raw_path) if isinstance(raw_path, (list, tuple)) else []
            case_persons = {p.id: p.name for p in db.query(Person.id, Person.name).all()}
            shortest_path_names = [str(case_persons.get(nid, str(nid)[:8])) for nid in path_nodes]
            if len(path_nodes) > 2:
                citations.append(f"Graph Path: {' -> '.join(shortest_path_names)}")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            shortest_path_names = []

    # Common neighbors
    common_neighbors: List[str] = []
    if G.has_node(p1.id) and G.has_node(p2.id):
        n1 = set(G.neighbors(p1.id))
        n2 = set(G.neighbors(p2.id))
        common = n1.intersection(n2)
        case_persons = {p.id: p.name for p in db.query(Person.id, Person.name).all()}
        common_neighbors = [str(case_persons.get(cid, str(cid)[:8])) for cid in common]
        if common_neighbors:
            citations.append(f"Shared Intermediaries: {', '.join(common_neighbors)}")

    # Pattern alerts mentioning both
    alerts = db.query(PatternAlert).filter(PatternAlert.case_id == case_id).all()
    shared_alerts = []
    for a in alerts:
        p_ids = a.involved_person_ids or []
        mentions_both = (p1.id in p_ids and p2.id in p_ids) or \
                        (p1.name.lower() in (a.title + a.description).lower() and p2.name.lower() in (a.title + a.description).lower())
        if mentions_both:
            shared_alerts.append(f"[{a.severity.upper()}] {a.title}: {a.description}")
            citations.append(f"Shared Alert: [{a.severity.upper()}] {a.title}")

    # Format text
    lines = [
        f"### Relationship Analysis: {p1.name} and {p2.name}",
        f"- **Direct Connection**: {'YES (' + ', '.join(edge_types) + ')' if edge_types else 'No direct edge in primary graph'}",
        f"- **Path in Network**: {' -> '.join(shortest_path_names) if shortest_path_names else 'No path detected'}",
        f"- **Shared Associates**: {', '.join(common_neighbors) if common_neighbors else 'None identified'}",
        f"- **Profiles**:",
        f"  * {p1.name}: Role={p1.network_role or 'Unassigned'}, Suspicion={float(p1.suspicion_score or 0.0):.2f}, Band={p1.confidence_band}",
        f"  * {p2.name}: Role={p2.network_role or 'Unassigned'}, Suspicion={float(p2.suspicion_score or 0.0):.2f}, Band={p2.confidence_band}",
    ]

    if edge_details:
        lines.append(f"- **Connection Evidence Details**: {edge_details}")

    if shared_alerts:
        lines.append("- **Detected Shared Pattern Alerts**:")
        for sa in shared_alerts:
            lines.append(f"  * {sa}")

    return "\n".join(lines), citations


def build_case_overview_context(
    db: Session,
    case_id: str
) -> Tuple[str, List[str]]:
    """
    Builds context for case-wide inquiries (summaries, patterns, network overview).
    """
    citations = []
    if case_id == "master":
        class DummyCase:
            title = "Global Master Criminal Syndicate Network"
            id = "master"
            status = "ACTIVE"
            case_number = "MASTER-001"
            case_type = "Syndicate Overview"
            description = "Cross-case master graph containing all interconnected entities."
        case = DummyCase()
    else:
        case = db.query(Case).filter(Case.id == case_id).first()
        if not case:
            return "Case not found.", []

    citations.append(f"Case File: {case.title} (ID: {case.id[:8]}..., Status: {case.status})")

    store = get_graph_store()
    case_nodes = store.get_all_person_nodes(case_id)
    node_pids = [n["id"] for n in case_nodes if "id" in n]
    if node_pids:
        persons = db.query(Person).filter(Person.id.in_(node_pids)).order_by(Person.suspicion_score.desc()).all()
    else:
        persons = db.query(Person).filter(Person.case_id == case_id).order_by(Person.suspicion_score.desc()).all()
        if not persons:
            persons = db.query(Person).order_by(Person.suspicion_score.desc()).limit(25).all()

    alerts = db.query(PatternAlert).filter(PatternAlert.case_id == case_id).all() if case_id != "master" else db.query(PatternAlert).all()
    G = store.get_networkx_graph(case_id)
    edge_count = G.number_of_edges() if G else (db.query(Edge).count() if case_id == "master" else db.query(Edge).filter(Edge.case_id == case_id).count())

    lines = [
        f"### Case Overview: {case.title}",
        f"- **Case Number**: {case.case_number or 'N/A'}",
        f"- **Status**: {case.status}",
        f"- **Type**: {case.case_type}",
        f"- **Description**: {case.description or 'None provided.'}",
        f"- **Network Scale**: {len(persons)} identified entities, {edge_count} verified evidence relationships",
        "",
        "### Key Entities by Analytical Suspicion:",
    ]

    for p in persons[:7]:
        lines.append(
            f"- **{p.name}** | Role: {p.network_role or 'Unassigned'} | "
            f"Suspicion Score: {float(p.suspicion_score or 0.0):.3f} | Confidence Band: {p.confidence_band}"
            f"{' | Has Prior Criminal Records' if p.criminal_history_flag else ''}"
        )
        citations.append(f"Entity: {p.name} (Suspicion: {float(p.suspicion_score or 0.0):.2f})")

    if alerts:
        lines.append("\n### Active Detected Pattern Alerts:")
        for a in alerts:
            lines.append(f"- **[{a.severity.upper()}] {a.title}** ({a.detector_name}): {a.description}")
            citations.append(f"Pattern Alert: [{a.severity.upper()}] {a.title}")

    return "\n".join(lines), citations


def build_investigator_context(
    db: Session,
    case_id: str,
    question: str,
    selected_person_id: Optional[str] = None
) -> Tuple[str, List[str]]:
    """
    Main entry point for selective evidence retrieval.
    Determines whether inquiry is about:
    1. Two specific persons (relationship inquiry)
    2. A single specific person (entity inquiry)
    3. General case overview / pattern inquiry
    Returns: (evidence_markdown_context, list_of_citations)
    """
    mentioned_persons = extract_mentioned_persons(db, case_id, question, selected_person_id)

    # Scenario 1: Relationship between two persons
    if len(mentioned_persons) >= 2:
        return build_relationship_context(db, case_id, mentioned_persons[0], mentioned_persons[1])

    # Scenario 2: Single person focus
    elif len(mentioned_persons) == 1:
        p = mentioned_persons[0]
        profile, p_cites = build_person_profile(db, case_id, p)
        conns, c_cites = get_person_connections(db, case_id, str(p.id))
        records, r_cites = get_person_records(db, case_id, str(p.id))
        alerts, a_cites = get_person_alerts(db, case_id, str(p.id), str(p.name))

        citations = p_cites + c_cites + r_cites + a_cites

        lines = [
            f"### Target Entity Profile: {p.name}",
            f"- **ID**: {p.id}",
            f"- **Network Role**: {profile['network_role']}",
            f"- **Suspicion Score**: {profile['suspicion_score']} (Analytical indicator, 0.0 - 1.0)",
            f"- **Hierarchy Score**: {profile['hierarchy_score']}",
            f"- **Confidence Band**: {profile['confidence_band']}",
            f"- **Occupation**: {profile['occupation']}",
            f"- **City**: {profile['city']}",
            f"- **Criminal History Flag**: {'YES' if profile['criminal_history_flag'] else 'NO'}",
            f"- **Phone Numbers**: {', '.join(profile['phones']) if profile['phones'] else 'None on file'}",
            f"- **Accounts**: {', '.join(profile['accounts']) if profile['accounts'] else 'None on file'}",
            f"- **Aliases**: {', '.join(profile['aliases']) if profile['aliases'] else 'None'}",
            "",
            f"### Direct Connections ({len(conns)}):",
        ]
        if conns:
            for c in conns:
                lines.append(f"- **{c['connected_to']}** via `{c['evidence_type']}` (Confidence: {c['confidence']}) {c['details'] if c['details'] else ''}")
        else:
            lines.append("- No direct edges recorded in primary evidence graph.")

        if alerts:
            lines.append(f"\n### Detected Pattern Alerts Involving {p.name} ({len(alerts)}):")
            for a in alerts:
                lines.append(f"- **[{a['severity'].upper()}] {a['title']}**: {a['description']}")

        if records['firs']:
            lines.append("\n### Relevant FIR Records:")
            for f in records['firs']:
                lines.append(f"- FIR #{f['fir_number']} at {f['police_station']}: {f['offence']} — {f['narrative']}")

        if records['surveillance']:
            lines.append("\n### Surveillance Observations:")
            for s in records['surveillance']:
                lines.append(f"- [{s['source']} at {s['timestamp']}] {s['description']} (Reliability: {s['reliability']})")

        if records['criminal_history']:
            lines.append("\n### Prior Criminal History Records:")
            for h in records['criminal_history']:
                lines.append(f"- Charges: {h['charges']} ({h['year']}) in {h['court']}. Status: {h['status']}")

        cdr = records['cdr']
        if cdr['total_calls_found'] > 0:
            lines.append(f"\n### CDR Summary:")
            lines.append(f"- Total calls logged: {cdr['total_calls_found']}")
            for sc in cdr['sample_calls']:
                lines.append(f"  * {sc['caller_phone']} -> {sc['receiver_phone']} ({sc['duration_seconds']}s, {sc['timestamp']})")

        fin = records['financial']
        if fin['total_transactions'] > 0:
            lines.append(f"\n### Financial Transaction Summary:")
            lines.append(f"- Total transactions logged: {fin['total_transactions']}, Total Volume: ₹{fin['total_amount']:,.2f}")
            for st in fin['sample_transactions']:
                lines.append(f"  * ₹{st['amount']:,.2f} via {st['platform']} ({st['timestamp']}) - {st['description']}")

        return "\n".join(lines), citations

    # Scenario 3: General case or pattern overview
    else:
        return build_case_overview_context(db, case_id)
