import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models.schemas import SourceStatus, TravelClarifyRequest, TravelPlanRequest


def test_source_status_serializes_known_states():
    status = SourceStatus(source_id="trend-corpus", source_label="Trend Corpus", status="ready")
    assert status.status == "ready"


def test_clarify_request_rejects_empty_selected_nodes():
    payload = {
        "thread_id": "thread-1",
        "current_city": "wuhan",
        "selected_nodes": [],
        "trip_days": 3,
        "day_or_night_preference": "balanced",
        "interest_tags": ["sightseeing"],
    }

    with pytest.raises(ValidationError):
        TravelClarifyRequest.model_validate(payload)


def test_clarify_returns_follow_up_questions():
    payload = {
        "thread_id": "t-1",
        "current_city": "wuhan",
        "selected_nodes": [{"id": "donghu", "name": "Donghu", "node_type": "area", "center": [114.419, 30.560]}],
        "trip_days": 3,
        "day_or_night_preference": "balanced",
        "interest_tags": ["sightseeing"],
    }

    with TestClient(app) as client:
        response = client.post("/api/travel/clarify", json=payload)

    assert response.status_code == 200
    assert len(response.json()["follow_up_questions"]) >= 1


def test_plan_returns_visit_order_polylines():
    payload = {
        "thread_id": "t-2",
        "current_city": "wuhan",
        "selected_nodes": [
            {"id": "donghu", "name": "Donghu", "node_type": "area", "center": [114.419, 30.560]},
            {"id": "yellow-crane-tower", "name": "Yellow Crane Tower", "node_type": "poi", "center": [114.306, 30.547]},
        ],
        "trip_days": 3,
        "day_or_night_preference": "balanced",
        "interest_tags": ["sightseeing"],
        "answers": {"trip_days_confirm": "3", "time_bias": "balanced"},
    }

    with TestClient(app) as client:
        response = client.post("/api/travel/plan", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["itinerary"]["days"][0]["stops"][0]["stop_id"]
    assert body["itinerary"]["days"][0]["legs"][0]["from_stop_id"]
    assert body["map_route_days"][0]["route_type"] == "visit_order_polyline"
    assert body["uncertainty"]["level"] == "partial"


def test_plan_request_requires_at_least_two_selected_nodes():
    payload = {
        "thread_id": "t-plan-1",
        "current_city": "wuhan",
        "selected_nodes": [{"id": "donghu", "name": "Donghu", "node_type": "poi", "center": [114.41, 30.56]}],
        "trip_days": 3,
        "day_or_night_preference": "balanced",
        "interest_tags": ["sightseeing"],
        "answers": {},
    }

    with pytest.raises(ValidationError):
        TravelPlanRequest.model_validate(payload)


def test_plan_request_accepts_five_selected_nodes():
    payload = {
        "thread_id": "t-plan-2",
        "current_city": "wuhan",
        "selected_nodes": [
            {"id": "a", "name": "A", "node_type": "poi", "center": [114.1, 30.1]},
            {"id": "b", "name": "B", "node_type": "poi", "center": [114.2, 30.2]},
            {"id": "c", "name": "C", "node_type": "poi", "center": [114.3, 30.3]},
            {"id": "d", "name": "D", "node_type": "poi", "center": [114.4, 30.4]},
            {"id": "e", "name": "E", "node_type": "poi", "center": [114.5, 30.5]},
        ],
        "trip_days": 3,
        "day_or_night_preference": "balanced",
        "interest_tags": ["sightseeing"],
        "answers": {},
    }

    model = TravelPlanRequest.model_validate(payload)
    assert len(model.selected_nodes) == 5


def test_plan_request_accepts_one_day_city_itinerary():
    payload = {
        "thread_id": "t-plan-3",
        "current_city": "wuhan",
        "selected_nodes": [
            {"id": "a", "name": "A", "node_type": "poi", "center": [114.1, 30.1]},
            {"id": "b", "name": "B", "node_type": "poi", "center": [114.2, 30.2]},
        ],
        "trip_days": 1,
        "day_or_night_preference": "balanced",
        "interest_tags": ["sightseeing"],
        "answers": {},
    }

    model = TravelPlanRequest.model_validate(payload)
    assert model.trip_days == 1


def test_poi_extract_reports_failed_when_qwen_not_configured():
    payload = {
        "city": "wuhan",
        "source_paths": [],
    }

    with TestClient(app) as client:
        response = client.post("/api/poi/extract", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["job_status"] == "failed"
    assert any(item["status"] == "failed" for item in body["source_status"])
