"""
Forecasting module — simple exponential smoothing on time-series data.
No AI API needed. Pure statsmodels.
"""
import datetime
import uuid
from typing import List, Dict
import numpy as np

from app.graph_store import get_graph_store
from app.config import get_forecasting_config


def generate_predictions(case_id: str, db_session=None) -> List[Dict]:
    """
    Analyze communication/transaction trends and generate predicted future events.
    Uses Simple Exponential Smoothing from statsmodels.
    """
    config = get_forecasting_config()
    forecast_days = config.get("forecast_days", 30)
    min_points = config.get("min_data_points", 7)
    predictions = []

    store = get_graph_store()
    G = store.get_networkx_graph(case_id)

    # Analyze each edge's frequency history
    for u, v, data in G.edges(data=True):
        freq_history = data.get("frequency_history", [])
        if len(freq_history) < min_points:
            continue

        u_name = G.nodes.get(u, {}).get("name", u)
        v_name = G.nodes.get(v, {}).get("name", v)
        evidence_type = data.get("evidence_type", "CALL")

        try:
            forecast_values = _exponential_smoothing_forecast(freq_history, steps=7)

            # Detect significant trends
            recent_mean = np.mean(freq_history[-3:])
            forecast_mean = np.mean(forecast_values)

            if forecast_mean > recent_mean * 1.5:
                # Increasing trend
                pred_date = datetime.datetime.utcnow() + datetime.timedelta(days=7)
                predictions.append({
                    "id": str(uuid.uuid4()),
                    "timestamp": pred_date.isoformat(),
                    "description": (
                        f"Predicted escalation in {evidence_type.lower()} activity between "
                        f"{u_name} and {v_name}. "
                        f"Current avg: {recent_mean:.1f}/period → Forecast: {forecast_mean:.1f}/period. "
                        f"⚠️ This is one input among others, not a certainty."
                    ),
                    "linked_entity_ids": [u, v],
                    "confidence": min(0.9, 0.5 + (forecast_mean - recent_mean) / (recent_mean + 1) * 0.3),
                    "trend": "increasing",
                    "evidence_type": evidence_type,
                })
            elif forecast_mean < recent_mean * 0.5 and recent_mean > 2:
                # Sudden decrease (could indicate operational security)
                pred_date = datetime.datetime.utcnow() + datetime.timedelta(days=7)
                predictions.append({
                    "id": str(uuid.uuid4()),
                    "timestamp": pred_date.isoformat(),
                    "description": (
                        f"Predicted sudden decrease in {evidence_type.lower()} between "
                        f"{u_name} and {v_name}. "
                        f"Current avg: {recent_mean:.1f}/period → Forecast: {forecast_mean:.1f}/period. "
                        f"May indicate operational security measures. "
                        f"⚠️ This is one input among others, not a certainty."
                    ),
                    "linked_entity_ids": [u, v],
                    "confidence": 0.4,
                    "trend": "decreasing",
                    "evidence_type": evidence_type,
                })
        except Exception:
            continue

    # Location-based predictions
    for node_id, data in G.nodes(data=True):
        if data.get("node_type") != "person":
            continue
        trail = data.get("location_trail", [])
        if len(trail) < min_points:
            continue

        name = data.get("name", node_id)
        try:
            lats = [p["lat"] for p in trail]
            lngs = [p["lng"] for p in trail]

            lat_forecast = _exponential_smoothing_forecast(lats, steps=3)
            lng_forecast = _exponential_smoothing_forecast(lngs, steps=3)

            if lat_forecast and lng_forecast:
                pred_date = datetime.datetime.utcnow() + datetime.timedelta(days=3)
                predictions.append({
                    "id": str(uuid.uuid4()),
                    "timestamp": pred_date.isoformat(),
                    "description": (
                        f"Predicted location for {name}: "
                        f"({lat_forecast[-1]:.4f}, {lng_forecast[-1]:.4f}). "
                        f"Based on movement pattern analysis. "
                        f"⚠️ This is one input among others, not a certainty."
                    ),
                    "linked_entity_ids": [node_id],
                    "confidence": 0.35,
                    "trend": "location",
                    "predicted_lat": lat_forecast[-1],
                    "predicted_lng": lng_forecast[-1],
                })
        except Exception:
            continue

    return predictions


def _exponential_smoothing_forecast(data: list, steps: int = 7) -> list:
    """Simple exponential smoothing forecast."""
    if len(data) < 3:
        return []

    try:
        from statsmodels.tsa.holtwinters import SimpleExpSmoothing
        arr = np.array(data, dtype=float)
        # Handle constant series
        if np.std(arr) == 0:
            return [float(arr[-1])] * steps
        model = SimpleExpSmoothing(arr, initialization_method="estimated")
        fitted = model.fit(optimized=True)
        forecast = fitted.forecast(steps)
        return [max(0, float(v)) for v in forecast]
    except Exception:
        # Fallback: simple moving average
        window = min(3, len(data))
        avg = np.mean(data[-window:])
        return [float(avg)] * steps
