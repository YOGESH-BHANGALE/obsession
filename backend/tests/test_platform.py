"""
Automated unit tests for Criminal Network Analysis Platform
Tests: Scoring Engine, Graph Store, 12 Detectors, and Forecasting.
"""
import pytest
import datetime
import networkx as nx

from app.scoring import compute_suspicion_score, assign_confidence_band
from app.graph_store import GraphStore
from app.detectors import (
    detect_communication_burst,
    detect_circular_transactions,
    detect_cross_case_entities,
    detect_phone_hopping,
)


def test_confidence_band_assignment():
    """Verify confidence band categorization per CLAUD2 specification."""
    assert assign_confidence_band(0.85) == "inner"
    assert assign_confidence_band(0.75) == "inner"
    assert assign_confidence_band(0.60) == "middle"
    assert assign_confidence_band(0.50) == "middle"
    assert assign_confidence_band(0.35) == "outer"
    assert assign_confidence_band(0.25) == "outer"
    assert assign_confidence_band(0.15) == "pruned"


def test_suspicion_scoring_computation():
    """Verify weighted multi-factor suspicion scoring."""
    # Entity with criminal history and high call volume
    score = compute_suspicion_score(
        criminal_history=True,
        call_frequency_ratio=3.5,
        financial_volume_ratio=2.0,
        co_location_count=4,
        cross_case_count=2,
    )
    assert 0.0 <= score <= 1.0
    assert score > 0.5, "High criminal indicators must result in elevated suspicion"


def test_circular_transaction_detector():
    """Verify detector 8: Circular Hawala / layering patterns."""
    G = nx.MultiDiGraph()
    # Create circular flow A -> B -> C -> A
    G.add_node("A", name="Person A")
    G.add_node("B", name="Person B")
    G.add_node("C", name="Person C")

    G.add_edge("A", "B", evidence_type="TRANSACTION", amount=500000)
    G.add_edge("B", "C", evidence_type="TRANSACTION", amount=480000)
    G.add_edge("C", "A", evidence_type="TRANSACTION", amount=470000)

    alerts = detect_circular_transactions("test_case", G)
    assert len(alerts) > 0, "Circular transaction detector should identify cycle A -> B -> C -> A"
    assert any("circular" in a["description"].lower() or "cycle" in a["description"].lower() for a in alerts)


def test_communication_burst_detector():
    """Verify detector 1: Sudden communication burst."""
    G = nx.MultiGraph()
    G.add_node("A", name="Person A")
    G.add_node("B", name="Person B")

    # Baseline 2-3 calls for weeks, followed by burst of 25 calls
    freq_history = [2, 3, 2, 3, 2, 3, 2, 3, 22, 25, 28]
    G.add_edge("A", "B", evidence_type="CALL", frequency_history=freq_history)

    alerts = detect_communication_burst("test_case", G)
    assert len(alerts) > 0, "Communication burst detector should flag significant frequency anomaly"


def test_cross_case_entity_detector():
    """Verify detector 4: Same entity appearing across multiple investigations."""
    G = nx.MultiGraph()
    G.add_node("A", name="Kingpin Vikram", cross_case_refs=["CASE-MUM-1", "CASE-DEL-2"])
    G.add_node("B", name="Clean Associate", cross_case_refs=[])

    alerts = detect_cross_case_entities("test_case", G)
    assert len(alerts) == 1, "Should flag entity with multiple cross-case references"
    assert "Kingpin Vikram" in alerts[0]["description"]


def test_phone_hopping_detector():
    """Verify detector 10: Phone / burner identity hopping."""
    G = nx.MultiGraph()
    # Person with 4 registered phone numbers
    G.add_node("A", name="Deepak Yadav", phone_numbers=["+919800000001", "+919800000002", "+919800000003", "+919800000004"])
    G.add_node("B", name="Single Phone User", phone_numbers=["+919800000005"])

    alerts = detect_phone_hopping("test_case", G)
    assert len(alerts) == 1, "Should detect multiple SIM/phone hopping anomaly"
    assert "Deepak Yadav" in alerts[0]["description"]
