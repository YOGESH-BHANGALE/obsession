"""
Suspicion Scoring Engine — recomputed as data arrives.
Weighted combination of factors from config.yaml.
"""
import math
import datetime
from typing import Dict, List, Optional
import networkx as nx

from app.config import get_scoring_weights, get_zone_bands
from app.graph_store import get_graph_store


def compute_suspicion_score(
    case_id: Optional[str] = None,
    person_id: Optional[str] = None,
    criminal_history: bool = False,
    investigator_override: float = 0.0,
    **kwargs
) -> float:
    """
    Compute the suspicion score for a person node.
    Returns a float 0–1.
    """
    weights = get_scoring_weights()
    zones = get_zone_bands()

    if case_id is None or person_id is None:
        call_ratio = kwargs.get("call_frequency_ratio", 1.0)
        fin_ratio = kwargs.get("financial_volume_ratio", 1.0)
        co_loc = kwargs.get("co_location_count", 0)
        cross_case = kwargs.get("cross_case_count", 0)
        criminal_boost = 1.0 if criminal_history else 0.0
        override = max(0.0, min(1.0, investigator_override))

        link_strength = min(1.0, (call_ratio + fin_ratio) / 5.0)
        corroboration = min(1.0, (co_loc + cross_case) / 5.0)
        centrality = min(1.0, call_ratio / 3.0)
        recency = 0.8

        score = (
            weights.get("link_strength", 0.2) * link_strength +
            weights.get("recency", 0.15) * recency +
            weights.get("corroboration", 0.2) * corroboration +
            weights.get("centrality", 0.15) * centrality +
            weights.get("criminal_history", 0.15) * criminal_boost +
            weights.get("investigator_override", 0.15) * override
        )
        return max(0.0, min(1.0, score))

    store = get_graph_store()
    G = store.get_networkx_graph(case_id)

    if person_id not in G:
        return 0.0

    # 1. Link strength — frequency of links to confirmed (>75%) members
    link_strength = _compute_link_strength(G, person_id, zones["inner"]["min"])

    # 2. Recency — exponential decay on link recency
    recency = _compute_recency(G, person_id, weights.get("recency_decay_halflife_days", 30))

    # 3. Corroboration — multi-source evidence types
    corroboration = _compute_corroboration(G, person_id)

    # 4. Network centrality — degree + betweenness
    centrality = _compute_centrality(G, person_id)

    # 5. Criminal history — boolean boost
    criminal_boost = 1.0 if criminal_history else 0.0

    # 6. Investigator override
    override = max(0.0, min(1.0, investigator_override))

    # Weighted combination
    score = (
        weights["link_strength"] * link_strength +
        weights["recency"] * recency +
        weights["corroboration"] * corroboration +
        weights["centrality"] * centrality +
        weights["criminal_history"] * criminal_boost +
        weights["investigator_override"] * override
    )

    if G.nodes[person_id].get("is_seed"):
        score = max(score, 0.95)

    return max(0.0, min(1.0, score))


def _compute_link_strength(G: nx.Graph, person_id: str, inner_threshold: float) -> float:
    """Ratio of links to high-confidence members or seed suspects."""
    neighbors = list(G.neighbors(person_id))
    if not neighbors:
        return 0.0

    confirmed_links = 0
    total_links = len(neighbors)

    for neighbor in neighbors:
        neighbor_score = G.nodes[neighbor].get("suspicion_score", 0)
        is_seed = G.nodes[neighbor].get("is_seed", False)
        if neighbor_score >= inner_threshold or is_seed:
            confirmed_links += 1

    return confirmed_links / total_links if total_links > 0 else 0.0


def _compute_recency(G: nx.Graph, person_id: str, halflife_days: int) -> float:
    """Exponential decay based on most recent edge timestamp."""
    now = datetime.datetime.now(datetime.timezone.utc)
    max_recency = 0.5

    for neighbor in G.neighbors(person_id):
        edge_data = G[person_id][neighbor]
        ts_str = edge_data.get("timestamp")
        if ts_str:
            try:
                if isinstance(ts_str, str):
                    ts = datetime.datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                else:
                    ts = ts_str
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=datetime.timezone.utc)
                days_ago = max(0, (now - ts).days)
                decay = math.exp(-0.693 * days_ago / halflife_days)  # ln(2) ≈ 0.693
                max_recency = max(max_recency, decay)
            except (ValueError, TypeError):
                pass

    return max_recency


def _compute_corroboration(G: nx.Graph, person_id: str) -> float:
    """More independent evidence types = higher score."""
    evidence_types = set()
    for neighbor in G.neighbors(person_id):
        edge_data = G[person_id][neighbor]
        types = edge_data.get("evidence_types", [])
        if isinstance(types, list):
            evidence_types.update(types)
        et = edge_data.get("evidence_type")
        if et:
            evidence_types.add(et)

    # Normalize: 1 type = 0.2, 2 = 0.4, ..., 5+ = 1.0
    return min(1.0, len(evidence_types) / 5.0)


def _compute_centrality(G: nx.Graph, person_id: str) -> float:
    """Degree + betweenness centrality, normalized."""
    if len(G) <= 1:
        return 0.0

    try:
        if "degree_centrality" not in G.graph:
            G.graph["degree_centrality"] = dict(nx.degree_centrality(G))
        if "betweenness_centrality" not in G.graph:
            G.graph["betweenness_centrality"] = dict(nx.betweenness_centrality(G))
            
        degree = G.graph["degree_centrality"].get(person_id, 0)
        betweenness = G.graph["betweenness_centrality"].get(person_id, 0)
        return (degree + betweenness) / 2
    except Exception:
        return 0.0


def assign_confidence_band(score: float) -> str:
    """Map a suspicion score to a confidence band string."""
    zones = get_zone_bands()
    if score >= zones["inner"]["min"]:
        return "inner"
    elif score >= zones["middle"]["min"]:
        return "middle"
    elif score >= zones["outer"]["min"]:
        return "outer"
    else:
        return "pruned"


def recompute_all_scores(case_id: str, db_session=None):
    """Recompute suspicion scores for all person nodes in a case."""
    store = get_graph_store()
    G = store.get_networkx_graph(case_id)

    # 1. Update suspicion scores
    for node_id, data in G.nodes(data=True):
        if data.get("node_type") != "person":
            continue
        score = compute_suspicion_score(
            case_id, node_id,
            criminal_history=data.get("criminal_history_flag", False),
            investigator_override=data.get("investigator_override", 0.0)
        )
        band = assign_confidence_band(score)
        store.update_node_attrs(case_id, node_id, {
            "suspicion_score": score,
            "confidence_band": band
        })

    # 2. Update hierarchy scores using PageRank + betweenness
    try:
        pagerank_map: dict = dict(nx.pagerank(G))
        betweenness_map: dict = dict(nx.betweenness_centrality(G))
        for node_id in G.nodes():
            if G.nodes[node_id].get("node_type") == "person":
                h_score = (pagerank_map.get(node_id, 0) + betweenness_map.get(node_id, 0)) / 2
                # Normalize to 0-1 range
                store.update_node_attrs(case_id, node_id, {"hierarchy_score": min(1.0, h_score * 10)})
    except Exception:
        pass

    store.save(case_id)

    # 3. Sync to DB if session provided or available
    session = db_session
    close_session = False
    if session is None:
        try:
            from app.database import SessionLocal
            session = SessionLocal()
            close_session = True
        except Exception:
            session = None

    if session:
        try:
            from app.models import Person
            for node_id, data in G.nodes(data=True):
                if data.get("node_type") == "person":
                    p = session.query(Person).filter(Person.id == node_id).first()
                    if p:
                        p.suspicion_score = data.get("suspicion_score", 0.0)
                        p.hierarchy_score = data.get("hierarchy_score", 0.0)
                        p.confidence_band = data.get("confidence_band", "unexplored")
            session.commit()
        except Exception:
            session.rollback()
        finally:
            if close_session:
                session.close()
