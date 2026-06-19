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


def test_agent_chat_returns_kb_source_status():
    payload = {
        "thread_id": "kb-1",
        "message": "黄鹤楼有什么特点？",
        "context": {
            "current_city": "wuhan",
            "active_pois": [],
            "itinerary_summary": "",
        },
    }

    with TestClient(app) as client:
        response = client.post("/api/agent/chat", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert any(item["source_id"] == "kb-retrieval" for item in body["source_status"])
    assert any(item["source_id"] == "kb-ingest" for item in body["source_status"])


def test_agent_chat_reports_ready_when_qwen_is_configured(monkeypatch):
    from app import db as db_module
    from app import main as main_module
    from app.api import chat as chat_module
    from app.config import get_settings
    from app.models.tables_rag import KbChunkRecord, KbDocumentRecord, KbIngestJobRecord
    from sqlmodel import Session, SQLModel, create_engine

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(
        engine,
        tables=[KbDocumentRecord.__table__, KbChunkRecord.__table__, KbIngestJobRecord.__table__],
    )

    with Session(engine) as session:
        session.add(
            KbDocumentRecord(
                document_id="doc-yellow-crane",
                source_type="structured_poi",
                source_path="backend/data/wuhan_tourism_pois.json",
                source_record_id="yellow-crane-tower",
                title="Yellow Crane Tower",
                city="wuhan",
                district="Wuchang",
                doc_type="poi_card",
                tags_json=["landmark"],
                raw_payload={},
            )
        )
        session.add(
            KbChunkRecord(
                chunk_id="doc-yellow-crane-chunk-0",
                document_id="doc-yellow-crane",
                chunk_index=0,
                content="Yellow Crane Tower is a landmark with skyline views over the Yangtze River.",
                city="wuhan",
                district="Wuchang",
                topic_tags_json=["landmark"],
                poi_ids_json=["yellow-crane-tower"],
                metadata_json={"category": "landmark"},
            )
        )
        session.commit()

    def override_session():
        with Session(engine) as session:
            yield session

    class FakeQwenClient:
        def __init__(self, api_key, base_url, model, timeout_seconds):
            assert api_key == "test-qwen-key"
            assert base_url == "https://dashscope.aliyuncs.com/compatible-mode/v1"
            assert model == "qwen-max"
            self.timeout_seconds = timeout_seconds

        def chat_text(self, messages, system=""):
            assert messages[0]["content"] == "黄鹤楼值得去吗？"
            assert isinstance(system, str)
            return "可以去，黄鹤楼是武汉地标。"

    settings = get_settings.__wrapped__()
    settings.qwen_api_key = "test-qwen-key"
    settings.qwen_base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    settings.qwen_model = "qwen-max"
    settings.database_url = "sqlite://"
    monkeypatch.setattr(chat_module, "get_settings", lambda: settings)
    monkeypatch.setattr(main_module, "init_db", lambda: None)
    monkeypatch.setattr("app.services.llm.qwen_client.QwenClient", FakeQwenClient)
    app.dependency_overrides[db_module.get_session] = override_session

    payload = {
        "thread_id": "kb-2",
        "message": "黄鹤楼值得去吗？",
        "context": {
            "current_city": "wuhan",
            "active_pois": ["黄鹤楼"],
            "itinerary_summary": "",
        },
    }

    try:
        with TestClient(app) as client:
            response = client.post("/api/agent/chat", json=payload)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "可以去，黄鹤楼是武汉地标。"
    assert any(item["source_id"] == "agent-chat" and item["status"] == "ready" for item in body["source_status"])


def test_plan_rule_fallback_does_not_mutate_poi_cards_with_raw_amap_rows(monkeypatch):
    import importlib

    itinerary_draft_node = importlib.import_module("app.agent.nodes.itinerary_draft")

    monkeypatch.setattr(itinerary_draft_node, "_llm_client", lambda: None)
    monkeypatch.setattr(
        itinerary_draft_node,
        "_search_amap_direct",
        lambda keyword="武汉景点": [
            {
                "id": "amap-extra-1",
                "name": "Amap Extra",
                "category": "110200",
                "center": [114.3, 30.58],
                "address": "test address",
            }
        ],
    )
    monkeypatch.setattr(
        itinerary_draft_node,
        "_build_fallback_legs",
        lambda poi_rows: {},
    )

    state = {
        "thread_id": "t-plan-fallback",
        "current_city": "wuhan",
        "selected_nodes": [
            {"id": "donghu", "name": "Donghu", "node_type": "area", "center": [114.419, 30.560]},
            {"id": "yellow-crane-tower", "name": "Yellow Crane Tower", "node_type": "poi", "center": [114.306, 30.547]},
        ],
        "trip_days": 3,
        "day_or_night_preference": "balanced",
        "interest_tags": ["sightseeing"],
        "answers": {},
        "messages": [],
        "phase": "plan",
        "next_step": "",
        "loop_count": 0,
        "follow_up_questions": [],
        "poi_cards": [
            {
                "id": "donghu",
                "name": "Donghu",
                "node_type": "area",
                "category": "lake",
                "center": [114.419, 30.560],
                "coordinate_status": "verified_seed",
                "tags": [],
                "reason_summary": "seed",
            },
            {
                "id": "yellow-crane-tower",
                "name": "Yellow Crane Tower",
                "node_type": "poi",
                "category": "landmark",
                "center": [114.306, 30.547],
                "coordinate_status": "verified_seed",
                "tags": [],
                "reason_summary": "seed",
            },
        ],
        "itinerary": None,
        "map_route_days": [],
        "answer": "",
        "selected_reasoning": "",
        "source_status": [],
        "uncertainty": None,
        "error": "",
    }

    result = itinerary_draft_node.itinerary_draft(state)

    assert result["itinerary"]["days"]
    assert len(state["poi_cards"]) == 2
    assert all("node_type" in row for row in state["poi_cards"])
