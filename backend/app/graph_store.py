"""
GraphStore — Abstraction layer for graph operations.
Primary: NetworkX + SQLite persistence.
Optional: Neo4j adapter (same interface).
"""
import json
import pickle
from pathlib import Path
from typing import Optional, Dict, List, Any, Tuple
from abc import ABC, abstractmethod

import networkx as nx
from sqlalchemy.orm import Session

from app.config import get_zone_bands, get_scoring_weights, get_database_config


class GraphStoreBase(ABC):
    """Abstract interface — swap NetworkX for Neo4j without touching callers."""

    @abstractmethod
    def add_person_node(self, case_id: str, person_id: str, attrs: dict): ...

    @abstractmethod
    def add_edge(self, case_id: str, source_id: str, target_id: str, edge_type: str, attrs: dict): ...

    @abstractmethod
    def get_graph(self, case_id: str) -> dict: ...

    @abstractmethod
    def get_neighbors(self, case_id: str, person_id: str) -> list: ...

    @abstractmethod
    def get_node(self, case_id: str, person_id: str) -> dict: ...

    @abstractmethod
    def remove_node(self, case_id: str, person_id: str): ...

    @abstractmethod
    def get_networkx_graph(self, case_id: str) -> nx.Graph: ...

    @abstractmethod
    def update_node_attrs(self, case_id: str, person_id: str, attrs: dict): ...

    @abstractmethod
    def save(self, case_id: str): ...


class NetworkXGraphStore(GraphStoreBase):
    """
    Primary graph store backed by NetworkX.
    Persists to disk as pickle files inside the data/ directory.
    """

    def __init__(self):
        self._graphs: Dict[str, nx.Graph] = {}
        self._data_dir = Path(__file__).resolve().parent.parent / "data" / "graphs"
        self._data_dir.mkdir(parents=True, exist_ok=True)

    def _get_or_create(self, case_id: str) -> nx.Graph:
        if case_id not in self._graphs:
            graph_file = self._data_dir / f"{case_id}.gpickle"
            if graph_file.exists():
                with open(graph_file, "rb") as f:
                    self._graphs[case_id] = pickle.load(f)
            else:
                self._graphs[case_id] = nx.Graph()
        return self._graphs[case_id]

    def add_person_node(self, case_id: str, person_id: str, attrs: dict):
        G = self._get_or_create(case_id)
        attrs["node_type"] = "person"
        G.add_node(person_id, **attrs)

    def add_entity_node(self, case_id: str, entity_id: str, entity_type: str, attrs: dict):
        G = self._get_or_create(case_id)
        attrs["node_type"] = entity_type
        G.add_node(entity_id, **attrs)

    def add_edge(self, case_id: str, source_id: str, target_id: str, edge_type: str, attrs: dict):
        G = self._get_or_create(case_id)
        key = f"{source_id}-{target_id}-{edge_type}"
        attrs["evidence_type"] = edge_type
        attrs["source"] = source_id
        attrs["target"] = target_id
        if G.has_edge(source_id, target_id):
            existing = G[source_id][target_id]
            if "evidence_types" not in existing:
                existing["evidence_types"] = [existing.get("evidence_type", "UNKNOWN")]
            existing["evidence_types"].append(edge_type)
            existing["confidence"] = min(1.0, existing.get("confidence", 0.5) + 0.1)
            existing.update(attrs)
        else:
            attrs["evidence_types"] = [edge_type]
            G.add_edge(source_id, target_id, **attrs)

    def get_graph(self, case_id: str) -> dict:
        """Return the full graph as a serializable dict for the frontend."""
        G = self._get_or_create(case_id)
        zones = get_zone_bands()

        nodes = []
        for node_id, data in G.nodes(data=True):
            node_data = {
                "id": node_id,
                **data
            }
            if data.get("node_type") == "person":
                score = data.get("suspicion_score", 0)
                if score >= zones["inner"]["min"]:
                    node_data["confidence_band"] = "inner"
                elif score >= zones["middle"]["min"]:
                    node_data["confidence_band"] = "middle"
                elif score >= zones["outer"]["min"]:
                    node_data["confidence_band"] = "outer"
                else:
                    node_data["confidence_band"] = "unexplored"
            nodes.append(node_data)

        edges = []
        for u, v, data in G.edges(data=True):
            edges.append({
                "source": u,
                "target": v,
                **data
            })

        return {"nodes": nodes, "edges": edges}

    def get_neighbors(self, case_id: str, person_id: str) -> list:
        G = self._get_or_create(case_id)
        if person_id not in G:
            return []
        return list(G.neighbors(person_id))

    def get_node(self, case_id: str, person_id: str) -> dict:
        G = self._get_or_create(case_id)
        if person_id not in G:
            return {}
        return {"id": person_id, **dict(G.nodes[person_id])}

    def remove_node(self, case_id: str, person_id: str):
        G = self._get_or_create(case_id)
        if person_id in G:
            G.remove_node(person_id)

    def get_networkx_graph(self, case_id: str) -> nx.Graph:
        return self._get_or_create(case_id)

    def update_node_attrs(self, case_id: str, person_id: str, attrs: dict):
        G = self._get_or_create(case_id)
        if person_id in G:
            G.nodes[person_id].update(attrs)

    def save(self, case_id: str):
        if case_id in self._graphs:
            graph_file = self._data_dir / f"{case_id}.gpickle"
            with open(graph_file, "wb") as f:
                pickle.dump(self._graphs[case_id], f)

    def clear(self, case_id: str):
        """Completely clear in-memory graph and delete persisted file."""
        if case_id in self._graphs:
            self._graphs[case_id].clear()
            del self._graphs[case_id]
        graph_file = self._data_dir / f"{case_id}.gpickle"
        if graph_file.exists():
            try:
                graph_file.unlink(missing_ok=True)
            except Exception:
                pass

    def get_all_person_nodes(self, case_id: str) -> List[dict]:
        G = self._get_or_create(case_id)
        return [
            {"id": n, **data}
            for n, data in G.nodes(data=True)
            if data.get("node_type") == "person"
        ]

    def get_edges_for_node(self, case_id: str, person_id: str) -> List[dict]:
        G = self._get_or_create(case_id)
        if person_id not in G:
            return []
        return [
            {"source": u, "target": v, **data}
            for u, v, data in G.edges(person_id, data=True)
        ]

    def compute_centrality(self, case_id: str) -> Dict[str, float]:
        G = self._get_or_create(case_id)
        if len(G) == 0:
            return {}
        degree = nx.degree_centrality(G)
        betweenness = nx.betweenness_centrality(G)
        return {
            node: (degree.get(node, 0) + betweenness.get(node, 0)) / 2
            for node in G.nodes()
        }

    def compute_pagerank(self, case_id: str) -> Dict[str, float]:
        G = self._get_or_create(case_id)
        if len(G) == 0:
            return {}
        return nx.pagerank(G)

    def detect_communities(self, case_id: str) -> List[set]:
        G = self._get_or_create(case_id)
        if len(G) == 0:
            return []
        from networkx.algorithms.community import louvain_communities
        return [set(c) for c in louvain_communities(G)]

    def find_cycles(self, case_id: str) -> List[list]:
        G = self._get_or_create(case_id)
        if len(G) == 0:
            return []
        try:
            return list(nx.simple_cycles(G.to_directed()))
        except Exception:
            return []


# ─── Singleton ───
_graph_store: Optional[NetworkXGraphStore] = None


def get_graph_store() -> NetworkXGraphStore:
    global _graph_store
    if _graph_store is None:
        _graph_store = NetworkXGraphStore()
    return _graph_store


# Backward compatibility alias
GraphStore = NetworkXGraphStore

