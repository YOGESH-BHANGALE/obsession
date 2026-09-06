"""
Pattern Detection Engine — 12 independent detectors.
Each detector implements the same interface:
    run(case_id, graph_store, db_session) -> List[PatternAlert dict]
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any
import datetime
import math
import uuid
from collections import defaultdict

import networkx as nx
import numpy as np

from app.config import get_detector_config
from app.graph_store import NetworkXGraphStore


class BaseDetector(ABC):
    """Common interface for all pattern detectors."""

    name: str = "base"
    description: str = ""

    @abstractmethod
    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> List[Dict[str, Any]]:
        """Detect patterns and return a list of alert dicts."""
        ...

    def _make_alert(self, case_id: str, title: str, description: str,
                    severity: str = "medium",
                    person_ids: list = None,
                    edge_ids: list = None,
                    evidence: dict = None) -> dict:
        return {
            "id": str(uuid.uuid4()),
            "case_id": case_id,
            "detector_name": self.name,
            "severity": severity,
            "title": title,
            "description": description,
            "involved_person_ids": person_ids or [],
            "involved_edge_ids": edge_ids or [],
            "evidence_data": evidence or {},
            "is_confirmed": None,
            "created_at": datetime.datetime.utcnow().isoformat()
        }


# ═══════════════════════════════════════════════════════════════
# 1. Sudden Communication Burst
# ═══════════════════════════════════════════════════════════════

class CommunicationBurstDetector(BaseDetector):
    name = "communication_burst"
    description = "Time-series anomaly detection on per-pair call frequency"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        config = get_detector_config("communication_burst")
        z_threshold = config.get("z_score_threshold", 2.5)
        alerts = []
        G = store.get_networkx_graph(case_id)

        for u, v, data in G.edges(data=True):
            freq_history = data.get("frequency_history", [])
            if len(freq_history) < 3:
                continue
            arr = np.array(freq_history, dtype=float)
            mean_val = np.mean(arr[:-1]) if len(arr) > 1 else arr[0]
            std_val = np.std(arr[:-1]) if len(arr) > 1 else 1.0
            if std_val == 0:
                std_val = 1.0
            z_score = (arr[-1] - mean_val) / std_val
            if z_score > z_threshold:
                u_name = G.nodes[u].get("name", u)
                v_name = G.nodes[v].get("name", v)
                alerts.append(self._make_alert(
                    case_id,
                    f"Communication burst: {u_name} ↔ {v_name}",
                    f"Call frequency spiked {z_score:.1f}σ above average (from {mean_val:.0f} to {arr[-1]:.0f} per period)",
                    severity="high",
                    person_ids=[u, v],
                    evidence={"z_score": round(z_score, 2), "current": float(arr[-1]), "mean": round(mean_val, 2)}
                ))
        return alerts


# ═══════════════════════════════════════════════════════════════
# 2. New Connections Between Unrelated People
# ═══════════════════════════════════════════════════════════════

class NewConnectionsDetector(BaseDetector):
    name = "new_connections"
    description = "Diff between successive graph snapshots"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        alerts = []
        G = store.get_networkx_graph(case_id)

        for u, v, data in G.edges(data=True):
            if data.get("is_new_connection", False):
                u_data = G.nodes.get(u, {})
                v_data = G.nodes.get(v, {})
                # Check if they were previously unrelated (no shared neighbors)
                u_neighbors = set(G.neighbors(u))
                v_neighbors = set(G.neighbors(v))
                shared = u_neighbors.intersection(v_neighbors)
                if len(shared) == 0:
                    alerts.append(self._make_alert(
                        case_id,
                        f"New connection: {u_data.get('name', u)} ↔ {v_data.get('name', v)}",
                        f"Previously unrelated individuals now connected via {data.get('evidence_type', 'unknown')}",
                        severity="medium",
                        person_ids=[u, v],
                        evidence={"evidence_type": data.get("evidence_type", ""), "shared_neighbors": 0}
                    ))
        return alerts


# ═══════════════════════════════════════════════════════════════
# 3. Bridge Detection — One Person Bridging Multiple Groups
# ═══════════════════════════════════════════════════════════════

class BridgeDetector(BaseDetector):
    name = "bridge_detection"
    description = "Betweenness centrality / bridge detection"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        config = get_detector_config("bridge_detection")
        min_groups = config.get("min_groups", 2)
        alerts = []
        G = store.get_networkx_graph(case_id)

        if len(G) < 4:
            return alerts

        try:
            from networkx.algorithms.community import louvain_communities
            communities = list(louvain_communities(G))
        except Exception:
            return alerts

        if len(communities) < min_groups:
            return alerts

        # Map nodes to their community index
        node_community = {}
        for idx, comm in enumerate(communities):
            for node in comm:
                node_community[node] = idx

        betweenness = nx.betweenness_centrality(G)

        for node_id, bc in betweenness.items():
            if G.nodes[node_id].get("node_type") != "person":
                continue
            # Check how many communities this node connects to
            neighbor_communities = set()
            for neighbor in G.neighbors(node_id):
                if neighbor in node_community:
                    neighbor_communities.add(node_community[neighbor])
            if len(neighbor_communities) >= min_groups and bc > 0.1:
                name = G.nodes[node_id].get("name", node_id)
                alerts.append(self._make_alert(
                    case_id,
                    f"Bridge node: {name}",
                    f"Bridges {len(neighbor_communities)} distinct groups with betweenness centrality {bc:.3f}",
                    severity="high",
                    person_ids=[node_id],
                    evidence={"betweenness": round(bc, 4), "groups_bridged": len(neighbor_communities)}
                ))
        return alerts


# ═══════════════════════════════════════════════════════════════
# 4. Cross-Case Entity Matching
# ═══════════════════════════════════════════════════════════════

class CrossCaseDetector(BaseDetector):
    name = "cross_case_matching"
    description = "Same entity across multiple cases"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        alerts = []
        G = store.get_networkx_graph(case_id)

        for node_id, data in G.nodes(data=True):
            if data.get("node_type", "person") != "person":
                continue
            cross_refs = data.get("cross_case_refs", [])
            if len(cross_refs) > 0:
                name = data.get("name", node_id)
                alerts.append(self._make_alert(
                    case_id,
                    f"Cross-case match: {name}",
                    f"{name} appears in {len(cross_refs)} other case(s): {', '.join(cross_refs)}",
                    severity="critical",
                    person_ids=[node_id],
                    evidence={"cross_case_refs": cross_refs}
                ))
        return alerts


# ═══════════════════════════════════════════════════════════════
# 5. Unusual Location Sequence
# ═══════════════════════════════════════════════════════════════

class UnusualLocationDetector(BaseDetector):
    name = "unusual_location"
    description = "Flag improbable location transitions (speed/distance check)"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        config = get_detector_config("unusual_location")
        max_speed = config.get("max_speed_kmh", 200)
        alerts = []
        G = store.get_networkx_graph(case_id)

        for node_id, data in G.nodes(data=True):
            if data.get("node_type") != "person":
                continue
            location_trail = data.get("location_trail", [])
            if len(location_trail) < 2:
                continue

            for i in range(1, len(location_trail)):
                prev = location_trail[i - 1]
                curr = location_trail[i]
                dist_km = self._haversine(prev["lat"], prev["lng"], curr["lat"], curr["lng"])
                try:
                    t1 = datetime.datetime.fromisoformat(prev["timestamp"])
                    t2 = datetime.datetime.fromisoformat(curr["timestamp"])
                    hours = max((t2 - t1).total_seconds() / 3600, 0.001)
                    speed = dist_km / hours
                    if speed > max_speed:
                        name = data.get("name", node_id)
                        alerts.append(self._make_alert(
                            case_id,
                            f"Unusual location jump: {name}",
                            f"Moved {dist_km:.1f}km in {hours:.1f}h = {speed:.0f} km/h (max={max_speed})",
                            severity="high",
                            person_ids=[node_id],
                            evidence={"speed_kmh": round(speed, 1), "distance_km": round(dist_km, 1)}
                        ))
                except (ValueError, KeyError):
                    pass
        return alerts

    def _haversine(self, lat1, lng1, lat2, lng2):
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
        return R * 2 * math.asin(math.sqrt(a))


# ═══════════════════════════════════════════════════════════════
# 6. Repeated Co-Location
# ═══════════════════════════════════════════════════════════════

class CoLocationDetector(BaseDetector):
    name = "co_location"
    description = "Spatiotemporal clustering (DBSCAN on lat/lng/time)"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        config = get_detector_config("co_location")
        alerts = []
        G = store.get_networkx_graph(case_id)

        # Collect all location events with person IDs
        location_events = []
        for node_id, data in G.nodes(data=True):
            if data.get("node_type") != "person":
                continue
            for loc in data.get("location_trail", []):
                location_events.append({
                    "person_id": node_id,
                    "person_name": data.get("name", node_id),
                    "lat": loc["lat"],
                    "lng": loc["lng"],
                    "timestamp": loc.get("timestamp", "")
                })

        if len(location_events) < config.get("min_samples", 3):
            return alerts

        # Simple spatial clustering: group by proximity
        clusters = defaultdict(list)
        eps_km = config.get("eps_km", 0.5)

        for i, ev in enumerate(location_events):
            placed = False
            for key, members in clusters.items():
                ref = location_events[members[0]]
                dist = self._haversine(ev["lat"], ev["lng"], ref["lat"], ref["lng"])
                if dist <= eps_km:
                    clusters[key].append(i)
                    placed = True
                    break
            if not placed:
                clusters[i].append(i)

        for key, member_indices in clusters.items():
            persons = set()
            for idx in member_indices:
                persons.add(location_events[idx]["person_id"])
            if len(persons) >= config.get("min_samples", 3):
                person_names = [location_events[idx]["person_name"] for idx in member_indices[:5]]
                alerts.append(self._make_alert(
                    case_id,
                    f"Repeated co-location of {len(persons)} people",
                    f"Multiple individuals detected in close proximity: {', '.join(set(person_names))}",
                    severity="high",
                    person_ids=list(persons),
                    evidence={"cluster_size": len(persons), "location_count": len(member_indices)}
                ))
        return alerts

    def _haversine(self, lat1, lng1, lat2, lng2):
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
        return R * 2 * math.asin(math.sqrt(a))


# ═══════════════════════════════════════════════════════════════
# 7. Unusual Financial Transaction Pattern
# ═══════════════════════════════════════════════════════════════

class UnusualTransactionDetector(BaseDetector):
    name = "unusual_transaction"
    description = "IsolationForest outliers on amount/frequency/counterparties"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        config = get_detector_config("unusual_transaction")
        alerts = []
        G = store.get_networkx_graph(case_id)

        # Collect transaction edges
        tx_data = []
        tx_edges = []
        for u, v, data in G.edges(data=True):
            if data.get("evidence_type") == "TRANSACTION":
                amount = data.get("amount", 0)
                freq = data.get("frequency", 1)
                tx_data.append([amount, freq])
                tx_edges.append((u, v, data))

        if len(tx_data) < 5:
            return alerts

        try:
            from sklearn.ensemble import IsolationForest
            X = np.array(tx_data)
            clf = IsolationForest(contamination=config.get("contamination", 0.1), random_state=42)
            preds = clf.fit_predict(X)

            for i, pred in enumerate(preds):
                if pred == -1:  # outlier
                    u, v, data = tx_edges[i]
                    u_name = G.nodes.get(u, {}).get("name", u)
                    v_name = G.nodes.get(v, {}).get("name", v)
                    alerts.append(self._make_alert(
                        case_id,
                        f"Unusual transaction: {u_name} → {v_name}",
                        f"Transaction amount ₹{data.get('amount', 0):,.0f} flagged as anomalous",
                        severity="high",
                        person_ids=[u, v],
                        evidence={"amount": data.get("amount", 0), "frequency": data.get("frequency", 1)}
                    ))
        except Exception:
            pass
        return alerts


# ═══════════════════════════════════════════════════════════════
# 8. Circular Transaction Pattern
# ═══════════════════════════════════════════════════════════════

class CircularTransactionDetector(BaseDetector):
    name = "circular_transaction"
    description = "Cycle detection on the transaction sub-graph"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        config = get_detector_config("circular_transaction")
        min_len = config.get("min_cycle_length", 3)
        max_len = config.get("max_cycle_length", 8)
        alerts = []
        G = store.get_networkx_graph(case_id)

        # Build directed transaction subgraph
        tx_graph = nx.DiGraph()
        for u, v, data in G.edges(data=True):
            if data.get("evidence_type") == "TRANSACTION":
                src = data.get("source", u)
                tgt = data.get("target", v)
                direction = data.get("direction", "forward")
                if direction == "forward":
                    tx_graph.add_edge(src, tgt, **data)
                else:
                    tx_graph.add_edge(tgt, src, **data)

        if len(tx_graph) < min_len:
            return alerts

        try:
            cycles = list(nx.simple_cycles(tx_graph))
            for cycle in cycles:
                if min_len <= len(cycle) <= max_len:
                    names = [G.nodes.get(n, {}).get("name", n) for n in cycle]
                    alerts.append(self._make_alert(
                        case_id,
                        f"Circular money flow: {' → '.join(names[:4])}{'...' if len(names) > 4 else ''}",
                        f"Money flows in a cycle of {len(cycle)} entities, suggesting laundering",
                        severity="critical",
                        person_ids=list(cycle),
                        evidence={"cycle_length": len(cycle), "cycle_nodes": names}
                    ))
        except Exception:
            pass
        return alerts


# ═══════════════════════════════════════════════════════════════
# 9. Communication + Location Correlation
# ═══════════════════════════════════════════════════════════════

class CommLocationDetector(BaseDetector):
    name = "comm_location_correlation"
    description = "Joint analysis of call timing vs co-location"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        config = get_detector_config("comm_location_correlation")
        time_window = config.get("time_window_hours", 2)
        alerts = []
        G = store.get_networkx_graph(case_id)

        for u, v, data in G.edges(data=True):
            if data.get("evidence_type") != "CALL":
                continue
            call_ts = data.get("timestamp")
            if not call_ts:
                continue

            u_locs = G.nodes.get(u, {}).get("location_trail", [])
            v_locs = G.nodes.get(v, {}).get("location_trail", [])

            for u_loc in u_locs:
                for v_loc in v_locs:
                    try:
                        u_time = datetime.datetime.fromisoformat(u_loc["timestamp"])
                        v_time = datetime.datetime.fromisoformat(v_loc["timestamp"])
                        call_time = datetime.datetime.fromisoformat(call_ts) if isinstance(call_ts, str) else call_ts
                        if (abs((u_time - call_time).total_seconds()) < time_window * 3600 and
                            abs((v_time - call_time).total_seconds()) < time_window * 3600):
                            dist = self._haversine(u_loc["lat"], u_loc["lng"], v_loc["lat"], v_loc["lng"])
                            if dist < 1.0:  # within 1km
                                u_name = G.nodes.get(u, {}).get("name", u)
                                v_name = G.nodes.get(v, {}).get("name", v)
                                alerts.append(self._make_alert(
                                    case_id,
                                    f"Call + co-location: {u_name} ↔ {v_name}",
                                    f"Made a call while both within {dist:.1f}km of each other",
                                    severity="medium",
                                    person_ids=[u, v],
                                    evidence={"distance_km": round(dist, 2)}
                                ))
                    except (ValueError, KeyError):
                        pass
        return alerts

    def _haversine(self, lat1, lng1, lat2, lng2):
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
        return R * 2 * math.asin(math.sqrt(a))


# ═══════════════════════════════════════════════════════════════
# 10. Phone/Vehicle/Identity Hopping
# ═══════════════════════════════════════════════════════════════

class IdentityHoppingDetector(BaseDetector):
    name = "identity_hopping"
    description = "Entity-resolution engine flags rapid device/alias switching"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        config = get_detector_config("identity_hopping")
        max_interval = config.get("max_switch_interval_days", 7)
        alerts = []
        G = store.get_networkx_graph(case_id)

        for node_id, data in G.nodes(data=True):
            if data.get("node_type", "person") != "person":
                continue
            phones = data.get("phone_numbers", [])
            if len(phones) >= 3:
                name = data.get("name", node_id)
                alerts.append(self._make_alert(
                    case_id,
                    f"Phone hopping: {name}",
                    f"{name} uses {len(phones)} different phone numbers: {', '.join(phones[:3])}...",
                    severity="high",
                    person_ids=[node_id],
                    evidence={"phone_count": len(phones), "phones": phones[:5]}
                ))

            aliases = data.get("aliases", [])
            if len(aliases) >= 2:
                name = data.get("name", node_id)
                alerts.append(self._make_alert(
                    case_id,
                    f"Identity switching: {name}",
                    f"{name} known aliases: {', '.join(aliases)}",
                    severity="high",
                    person_ids=[node_id],
                    evidence={"alias_count": len(aliases), "aliases": aliases}
                ))
        return alerts


# ═══════════════════════════════════════════════════════════════
# 11. Sudden Formation of a New Community
# ═══════════════════════════════════════════════════════════════

class NewCommunityDetector(BaseDetector):
    name = "new_community"
    description = "Louvain community detection across snapshots"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        alerts = []
        G = store.get_networkx_graph(case_id)

        if len(G) < 4:
            return alerts

        try:
            from networkx.algorithms.community import louvain_communities
            communities = list(louvain_communities(G))

            for comm in communities:
                person_nodes = [n for n in comm if G.nodes.get(n, {}).get("node_type") == "person"]
                if len(person_nodes) < 3:
                    continue

                # Check if community is "new" (recently formed edges)
                new_edge_count = 0
                for n in person_nodes:
                    for neighbor in G.neighbors(n):
                        if neighbor in comm:
                            if G[n][neighbor].get("is_new_connection", False):
                                new_edge_count += 1

                if new_edge_count >= len(person_nodes) - 1:
                    names = [G.nodes.get(n, {}).get("name", n) for n in person_nodes[:5]]
                    alerts.append(self._make_alert(
                        case_id,
                        f"New community formed ({len(person_nodes)} members)",
                        f"Recently connected group: {', '.join(names)}",
                        severity="high",
                        person_ids=person_nodes,
                        evidence={"community_size": len(person_nodes), "new_edges": new_edge_count}
                    ))
        except Exception:
            pass
        return alerts


# ═══════════════════════════════════════════════════════════════
# 12. Existing Network Suddenly More Active
# ═══════════════════════════════════════════════════════════════

class NetworkActivityDetector(BaseDetector):
    name = "network_activity"
    description = "Trend analysis on aggregate edge activity within a known cluster"

    def run(self, case_id: str, store: NetworkXGraphStore, db_session=None) -> list:
        config = get_detector_config("network_activity")
        increase_threshold = config.get("increase_threshold", 2.0)
        alerts = []
        G = store.get_networkx_graph(case_id)

        total_old_activity = 0
        total_new_activity = 0
        active_pairs = 0

        for u, v, data in G.edges(data=True):
            freq_history = data.get("frequency_history", [])
            if len(freq_history) >= 2:
                old_avg = np.mean(freq_history[:-1])
                new_val = freq_history[-1]
                total_old_activity += old_avg
                total_new_activity += new_val
                active_pairs += 1

        if active_pairs > 2 and total_old_activity > 0:
            ratio = total_new_activity / total_old_activity
            if ratio >= increase_threshold:
                alerts.append(self._make_alert(
                    case_id,
                    f"Network activity surge: {ratio:.1f}x increase",
                    f"Overall communication/transaction activity increased {ratio:.1f}x across {active_pairs} relationships",
                    severity="high",
                    evidence={"activity_ratio": round(ratio, 2), "active_pairs": active_pairs}
                ))
        return alerts


# ═══════════════════════════════════════════════════════════════
# Registry — run all 12 detectors
# ═══════════════════════════════════════════════════════════════

ALL_DETECTORS = [
    CommunicationBurstDetector(),
    NewConnectionsDetector(),
    BridgeDetector(),
    CrossCaseDetector(),
    UnusualLocationDetector(),
    CoLocationDetector(),
    UnusualTransactionDetector(),
    CircularTransactionDetector(),
    CommLocationDetector(),
    IdentityHoppingDetector(),
    NewCommunityDetector(),
    NetworkActivityDetector(),
]


def run_all_detectors(case_id: str, store: NetworkXGraphStore, db_session=None) -> List[Dict[str, Any]]:
    """Run all 12 detectors and return aggregated alerts."""
    all_alerts = []
    for detector in ALL_DETECTORS:
        try:
            alerts = detector.run(case_id, store, db_session)
            all_alerts.extend(alerts)
        except Exception as e:
            all_alerts.append({
                "id": str(uuid.uuid4()),
                "case_id": case_id,
                "detector_name": detector.name,
                "severity": "low",
                "title": f"Detector error: {detector.name}",
                "description": str(e),
                "involved_person_ids": [],
                "involved_edge_ids": [],
                "evidence_data": {"error": str(e)},
                "is_confirmed": None,
                "created_at": datetime.datetime.utcnow().isoformat()
            })
    return all_alerts


class _GraphAdapter:
    def __init__(self, G):
        self._G = G

    def get_networkx_graph(self, case_id: str):
        return self._G


def _ensure_store(store_or_graph):
    if hasattr(store_or_graph, "get_networkx_graph"):
        return store_or_graph
    return _GraphAdapter(store_or_graph)


def detect_communication_burst(case_id: str, store_or_graph, db_session=None) -> list:
    return CommunicationBurstDetector().run(case_id, _ensure_store(store_or_graph), db_session)


def detect_circular_transactions(case_id: str, store_or_graph, db_session=None) -> list:
    return CircularTransactionDetector().run(case_id, _ensure_store(store_or_graph), db_session)


def detect_cross_case_entities(case_id: str, store_or_graph, db_session=None) -> list:
    return CrossCaseDetector().run(case_id, _ensure_store(store_or_graph), db_session)


def detect_phone_hopping(case_id: str, store_or_graph, db_session=None) -> list:
    return IdentityHoppingDetector().run(case_id, _ensure_store(store_or_graph), db_session)

