# Wuhan Travel Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Wuhan-only travel-agent MVP that turns map selections into clarification questions, a single recommended itinerary, and map visit-order polylines using local Wuhan travel notes plus a Python backend.

**Architecture:** Add a new `backend/` FastAPI service inside this repo. The backend ingests local Wuhan note snapshots, extracts trend summaries and candidate POIs with `qwen3.6-plus`, stores structured travel nodes in SQLite, exposes REST endpoints for clarify/plan flows, and returns map-ready visit-order polylines to the existing React + Three.js frontend.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLModel/SQLite, httpx, pytest, React 19, Vite, Three.js

---

## File Structure

### New backend files

- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/app/models/schemas.py`
- Create: `backend/app/models/tables.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/health.py`
- Create: `backend/app/api/poi.py`
- Create: `backend/app/api/travel.py`
- Create: `backend/app/api/source_status.py`
- Create: `backend/app/services/note_ingest.py`
- Create: `backend/app/services/trend_summary.py`
- Create: `backend/app/services/poi_extractor.py`
- Create: `backend/app/services/poi_registry.py`
- Create: `backend/app/services/itinerary_builder.py`
- Create: `backend/app/services/map_projection.py`
- Create: `backend/app/services/source_registry.py`
- Create: `backend/app/services/llm/qwen_client.py`
- Create: `backend/app/repositories/poi_repository.py`
- Create: `backend/app/repositories/source_status_repository.py`
- Create: `backend/data/wuhan_seed_nodes.json`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`
- Create: `backend/tests/test_note_ingest.py`
- Create: `backend/tests/test_poi_extractor.py`
- Create: `backend/tests/test_travel_api.py`

### New frontend files

- Create: `src/api/travelAgentClient.js`
- Create: `src/components/TravelPlannerPanel.jsx`
- Create: `src/map/travelPlanState.js`
- Create: `src/map/travelRouteLayer.js`
- Create: `src/map/travelSelection.js`

### Existing frontend files to modify

- Modify: `src/App.jsx`
- Modify: `src/components/HudPanels.jsx`
- Modify: `src/map/viewState.js`
- Modify: `src/map/searchController.js`
- Modify: `src/map/sceneRuntime.js`
- Modify: `src/map/sceneDetails.js`
- Modify: `src/styles.css`

### New docs

- Create: `docs/superpowers/specs/2026-06-09-wuhan-travel-agent-api-contract.md`
- Modify: `docs/superpowers/specs/2026-06-09-wuhan-travel-agent-design.md`

## Implementation Constraints

- No new paid, account-gated, or key-required map/geocoding/routing provider may be introduced without explicit approval.
- `qwen3.6-plus` must be configured through environment variables only. Never hardcode keys or log secrets.
- The frontend must surface `pending/ready/partial/failed` for extraction and planning sources.
- Nodes without verified coordinates must not render as map points.
- Automatically extracted POIs must carry `status=auto_extracted`, `confidence`, `source_count`, and `source_note_ids`.
- Keep every source file under 400 lines.

## Data Assumptions

- Local Wuhan note snapshots currently exist outside this repo, so backend ingest must read them from environment-configured paths.
- The note snapshots contain titles, descriptions, tags, and social signals, but not reliable coordinates.
- A small local seed file is required for renderable Wuhan map nodes. The extraction pipeline can create new candidate POIs, but only seed-matched or manually positioned nodes can appear on the map in MVP.

## Task 1: Scaffold The Backend Service

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/api/health.py`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: Write the failing health test**

```python
from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_returns_ok():
    client = TestClient(app)
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend; python -m pytest tests/test_health.py -v`

Expected: `ModuleNotFoundError` or import failure because the backend package does not exist yet.

- [ ] **Step 3: Create the minimal backend scaffold**

`backend/pyproject.toml`

```toml
[project]
name = "dragonatlas3d-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.116.0",
  "uvicorn>=0.35.0",
  "pydantic>=2.11.0",
  "pydantic-settings>=2.10.0",
  "sqlmodel>=0.0.24",
  "httpx>=0.28.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.4.0"]
```

`backend/app/main.py`

```python
from fastapi import FastAPI

from app.api.health import router as health_router

app = FastAPI(title="DragonAtlas3D Travel Backend")
app.include_router(health_router, prefix="/api")
```

`backend/app/api/health.py`

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend; python -m pytest tests/test_health.py -v`

Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/.env.example backend/app/main.py backend/app/config.py backend/app/api/health.py backend/tests/test_health.py
git commit -m "feat: scaffold travel backend service"
```

## Task 2: Define Canonical Schemas And Source Status

**Files:**
- Create: `backend/app/models/schemas.py`
- Create: `backend/app/models/tables.py`
- Create: `backend/app/db.py`
- Create: `backend/app/services/source_registry.py`
- Create: `backend/app/repositories/source_status_repository.py`
- Test: `backend/tests/test_travel_api.py`

- [ ] **Step 1: Write failing schema tests**

```python
from app.models.schemas import SourceStatus, TravelClarifyRequest


def test_source_status_serializes_known_states():
    status = SourceStatus(source_id="trend-corpus", source_label="Trend Corpus", status="ready")
    assert status.status == "ready"


def test_clarify_request_requires_selected_nodes():
    payload = {
        "thread_id": "thread-1",
        "current_city": "wuhan",
        "selected_nodes": [],
        "trip_days": 3,
        "day_or_night_preference": "balanced",
        "interest_tags": ["sightseeing"],
    }
    TravelClarifyRequest.model_validate(payload)
```
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend; python -m pytest tests/test_travel_api.py -v`

Expected: import failure because the schemas do not exist.

- [ ] **Step 3: Implement request/response schemas and tables**

`backend/app/models/schemas.py`

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SourceState = Literal["pending", "ready", "partial", "failed"]
NodeType = Literal["poi", "area"]


class SourceStatus(BaseModel):
    source_id: str
    source_label: str
    status: SourceState
    fetched_at: datetime | None = None
    stale_at: datetime | None = None
    error: str = ""
    coverage_note: str = ""
    provenance: str = ""


class SelectedNode(BaseModel):
    id: str
    name: str
    node_type: NodeType
    center: list[float] | None = None


class TravelClarifyRequest(BaseModel):
    thread_id: str
    current_city: str = Field(pattern="^wuhan$")
    selected_nodes: list[SelectedNode] = Field(min_length=1, max_length=3)
    trip_days: int = Field(ge=3, le=5)
    day_or_night_preference: Literal["day", "night", "balanced"]
    interest_tags: list[str] = Field(min_length=1)
```

`backend/app/models/tables.py`

```python
from datetime import datetime

from sqlmodel import Field, SQLModel


class PoiNode(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    node_type: str
    category: str
    district: str = ""
    center_lon: float | None = None
    center_lat: float | None = None
    status: str = "auto_extracted"
    confidence: float = 0.0
    source_count: int = 0
    source_note_ids: str = ""
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Run the schema tests**

Run: `cd backend; python -m pytest tests/test_travel_api.py -v`

Expected: tests now fail on validation expectations that must be tightened next.

- [ ] **Step 5: Tighten the validation test**

Replace the second test with:

```python
import pytest
from pydantic import ValidationError


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
```

- [ ] **Step 6: Re-run the tests**

Run: `cd backend; python -m pytest tests/test_travel_api.py -v`

Expected: `PASS`

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/schemas.py backend/app/models/tables.py backend/app/db.py backend/app/services/source_registry.py backend/app/repositories/source_status_repository.py backend/tests/test_travel_api.py
git commit -m "feat: add travel schemas and source status contract"
```

## Task 3: Ingest Local Wuhan Note Snapshots

**Files:**
- Create: `backend/app/services/note_ingest.py`
- Modify: `backend/app/config.py`
- Create: `backend/tests/test_note_ingest.py`

- [ ] **Step 1: Write the failing ingest tests**

```python
from pathlib import Path

from app.services.note_ingest import load_note_records


def test_load_note_records_reads_jsonl(tmp_path: Path):
    source = tmp_path / "notes.jsonl"
    source.write_text('{"note_id":"1","title":"东湖","desc":"适合散步"}\n', encoding="utf-8")

    rows = load_note_records([source])

    assert len(rows) == 1
    assert rows[0]["note_id"] == "1"
```

- [ ] **Step 2: Run the ingest tests to verify they fail**

Run: `cd backend; python -m pytest tests/test_note_ingest.py -v`

Expected: import failure because the ingest service does not exist.

- [ ] **Step 3: Implement the note loader**

`backend/app/config.py`

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    note_source_paths: str = ""
    qwen_api_key: str = ""
    qwen_base_url: str = ""
    qwen_model: str = "qwen3.6-plus"
```

`backend/app/services/note_ingest.py`

```python
import json
from pathlib import Path


def load_note_records(paths: list[Path]) -> list[dict]:
    rows: list[dict] = []
    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            rows.append(json.loads(line))
    return rows
```

- [ ] **Step 4: Add source normalization**

Extend the service to output a normalized note shape:

```python
def normalize_note(row: dict) -> dict:
    return {
        "note_id": row.get("note_id", ""),
        "title": row.get("title", ""),
        "desc": row.get("desc", ""),
        "tag_list": row.get("tag_list", ""),
        "liked_count": row.get("liked_count", ""),
        "collected_count": row.get("collected_count", ""),
        "comment_count": row.get("comment_count", ""),
        "share_count": row.get("share_count", ""),
        "note_url": row.get("note_url", ""),
        "source_keyword": row.get("source_keyword", ""),
    }
```

- [ ] **Step 5: Re-run the tests**

Run: `cd backend; python -m pytest tests/test_note_ingest.py -v`

Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/app/services/note_ingest.py backend/tests/test_note_ingest.py
git commit -m "feat: ingest local Wuhan note snapshots"
```

## Task 4: Add Qwen Client And POI Extraction Pipeline

**Files:**
- Create: `backend/app/services/llm/qwen_client.py`
- Create: `backend/app/services/trend_summary.py`
- Create: `backend/app/services/poi_extractor.py`
- Create: `backend/tests/test_poi_extractor.py`

- [ ] **Step 1: Write the failing extractor tests with a fake LLM**

```python
from app.services.poi_extractor import extract_poi_candidates


class FakeLlmClient:
    def complete_json(self, prompt: str) -> dict:
        return {
            "pois": [
                {
                    "name": "东湖",
                    "node_type": "area",
                    "category": "lake",
                    "district": "武昌区",
                    "tags": ["散步", "湖景"],
                    "reason_summary": "高频出现的武汉休闲区域",
                    "confidence": 0.84,
                    "source_note_ids": ["note-1", "note-2"],
                }
            ]
        }


def test_extract_poi_candidates_sets_auto_extracted_status():
    notes = [{"note_id": "note-1", "title": "东湖适合散步", "desc": "晚上也舒服"}]

    rows = extract_poi_candidates(notes, FakeLlmClient())

    assert rows[0]["status"] == "auto_extracted"
    assert rows[0]["source_count"] == 2
```

- [ ] **Step 2: Run the extractor test to verify it fails**

Run: `cd backend; python -m pytest tests/test_poi_extractor.py -v`

Expected: import failure because the extractor service does not exist.

- [ ] **Step 3: Implement a JSON-only Qwen client wrapper**

`backend/app/services/llm/qwen_client.py`

```python
import httpx


class QwenClient:
    def __init__(self, api_key: str, base_url: str, model: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def complete_json(self, prompt: str) -> dict:
        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        response.raise_for_status()
        return response.json()
```

- [ ] **Step 4: Implement the extractor**

`backend/app/services/poi_extractor.py`

```python
from datetime import datetime, UTC


def extract_poi_candidates(notes: list[dict], llm_client) -> list[dict]:
    prompt = build_poi_prompt(notes)
    payload = llm_client.complete_json(prompt)
    now = datetime.now(UTC)
    rows = []
    for item in payload.get("pois", []):
        rows.append(
            {
                "id": slugify_name(item["name"]),
                "name": item["name"],
                "node_type": item["node_type"],
                "category": item["category"],
                "district": item.get("district", ""),
                "tags": item.get("tags", []),
                "reason_summary": item.get("reason_summary", ""),
                "confidence": float(item.get("confidence", 0.0)),
                "source_note_ids": item.get("source_note_ids", []),
                "source_count": len(item.get("source_note_ids", [])),
                "status": "auto_extracted",
                "created_at": now,
                "updated_at": now,
            }
        )
    return rows
```

- [ ] **Step 5: Add trend summarization contract**

`backend/app/services/trend_summary.py`

```python
def summarize_trends(notes: list[dict], llm_client) -> dict:
    prompt = build_trend_prompt(notes)
    payload = llm_client.complete_json(prompt)
    return {
        "city": "wuhan",
        "summary": payload.get("summary", ""),
        "areas": payload.get("areas", []),
        "notes_used": [row["note_id"] for row in notes],
    }
```

- [ ] **Step 6: Run the extractor tests**

Run: `cd backend; python -m pytest tests/test_poi_extractor.py -v`

Expected: `PASS`

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/llm/qwen_client.py backend/app/services/trend_summary.py backend/app/services/poi_extractor.py backend/tests/test_poi_extractor.py
git commit -m "feat: add qwen-backed trend and poi extraction pipeline"
```

## Task 5: Add Seed Nodes, POI Registry, And Area Mapping

**Files:**
- Create: `backend/data/wuhan_seed_nodes.json`
- Create: `backend/app/repositories/poi_repository.py`
- Create: `backend/app/services/poi_registry.py`
- Modify: `backend/tests/test_poi_extractor.py`

- [ ] **Step 1: Create the failing registry test**

```python
from app.services.poi_registry import merge_seed_and_extracted_nodes


def test_merge_seed_and_extracted_nodes_keeps_seed_coordinates():
    seed = [{"id": "donghu", "name": "东湖", "node_type": "area", "center": [114.419, 30.560]}]
    extracted = [{"id": "donghu", "name": "东湖", "node_type": "area", "confidence": 0.84, "status": "auto_extracted"}]

    rows = merge_seed_and_extracted_nodes(seed, extracted)

    assert rows[0]["center"] == [114.419, 30.560]
    assert rows[0]["coordinate_status"] == "verified_seed"
```

- [ ] **Step 2: Run the registry tests to verify they fail**

Run: `cd backend; python -m pytest tests/test_poi_extractor.py -v`

Expected: failure because the registry merge function does not exist.

- [ ] **Step 3: Create the Wuhan seed file**

`backend/data/wuhan_seed_nodes.json`

```json
[
  {
    "id": "donghu",
    "name": "东湖",
    "node_type": "area",
    "category": "lake",
    "district": "武昌区",
    "center": [114.419, 30.560],
    "coordinate_status": "verified_seed",
    "tags": ["湖景", "散步", "骑行"]
  },
  {
    "id": "jianghan-road",
    "name": "江汉路",
    "node_type": "area",
    "category": "street",
    "district": "江汉区",
    "center": [114.291, 30.581],
    "coordinate_status": "verified_seed",
    "tags": ["夜游", "商业街", "美食"]
  }
]
```

- [ ] **Step 4: Implement seed merge behavior**

`backend/app/services/poi_registry.py`

```python
def merge_seed_and_extracted_nodes(seed_rows: list[dict], extracted_rows: list[dict]) -> list[dict]:
    seed_by_id = {row["id"]: row for row in seed_rows}
    merged = []
    for row in extracted_rows:
        seed = seed_by_id.get(row["id"])
        if seed:
            merged.append({**row, **seed, "confidence": row["confidence"], "status": row["status"]})
        else:
            merged.append({**row, "center": None, "coordinate_status": "partial"})
    return merged
```

- [ ] **Step 5: Re-run the tests**

Run: `cd backend; python -m pytest tests/test_poi_extractor.py -v`

Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add backend/data/wuhan_seed_nodes.json backend/app/repositories/poi_repository.py backend/app/services/poi_registry.py backend/tests/test_poi_extractor.py
git commit -m "feat: add seed-backed poi registry for Wuhan map nodes"
```

## Task 6: Implement Clarify And Plan APIs

**Files:**
- Create: `backend/app/api/travel.py`
- Create: `backend/app/api/poi.py`
- Create: `backend/app/api/source_status.py`
- Create: `backend/app/services/itinerary_builder.py`
- Create: `backend/app/services/map_projection.py`
- Test: `backend/tests/test_travel_api.py`

- [ ] **Step 1: Write failing API tests**

```python
from fastapi.testclient import TestClient

from app.main import app


def test_clarify_returns_follow_up_questions():
    client = TestClient(app)
    payload = {
        "thread_id": "t-1",
        "current_city": "wuhan",
        "selected_nodes": [{"id": "donghu", "name": "东湖", "node_type": "area", "center": [114.419, 30.560]}],
        "trip_days": 3,
        "day_or_night_preference": "balanced",
        "interest_tags": ["sightseeing"],
    }

    response = client.post("/api/travel/clarify", json=payload)

    assert response.status_code == 200
    assert len(response.json()["follow_up_questions"]) >= 1
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run: `cd backend; python -m pytest tests/test_travel_api.py -v`

Expected: `404` or router import failure because the endpoints do not exist.

- [ ] **Step 3: Implement clarify response**

`backend/app/api/travel.py`

```python
from fastapi import APIRouter

from app.models.schemas import TravelClarifyRequest

router = APIRouter(prefix="/travel", tags=["travel"])


@router.post("/clarify")
def clarify_trip(request: TravelClarifyRequest):
    return {
        "thread_id": request.thread_id,
        "follow_up_questions": [
            {"id": "trip_days_confirm", "label": "这次想玩几天？"},
            {"id": "time_bias", "label": "你更偏白天景点还是夜游逛吃？"},
        ],
        "source_status": [],
    }
```

- [ ] **Step 4: Implement itinerary and map projection services**

`backend/app/services/itinerary_builder.py`

```python
def build_single_best_itinerary(context: dict, poi_rows: list[dict]) -> dict:
    return {
        "title": "武汉城市经典路线",
        "days": [
            {
                "day": 1,
                "nodes": [poi["id"] for poi in poi_rows[:3]],
                "reason": "围绕首选区域组织首日体验",
            }
        ],
    }
```

`backend/app/services/map_projection.py`

```python
def build_visit_order_polylines(itinerary: dict, poi_rows: list[dict]) -> list[dict]:
    poi_by_id = {row["id"]: row for row in poi_rows if row.get("center")}
    result = []
    for day in itinerary["days"]:
        coordinates = [poi_by_id[node_id]["center"] for node_id in day["nodes"] if node_id in poi_by_id]
        result.append({"day": day["day"], "route_type": "visit_order_polyline", "coordinates": coordinates})
    return result
```

- [ ] **Step 5: Add the `/api/travel/plan` and `/api/source-status` endpoints**

Return fields:

- `answer`
- `selected_reasoning`
- `itinerary`
- `map_route_days`
- `poi_cards`
- `source_status`
- `uncertainty`

- [ ] **Step 6: Re-run API tests**

Run: `cd backend; python -m pytest tests/test_travel_api.py -v`

Expected: `PASS`

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/travel.py backend/app/api/poi.py backend/app/api/source_status.py backend/app/services/itinerary_builder.py backend/app/services/map_projection.py backend/tests/test_travel_api.py
git commit -m "feat: implement travel clarify and plan endpoints"
```

## Task 7: Integrate The Frontend Travel Planner Flow

**Files:**
- Create: `src/api/travelAgentClient.js`
- Create: `src/components/TravelPlannerPanel.jsx`
- Create: `src/map/travelPlanState.js`
- Create: `src/map/travelRouteLayer.js`
- Create: `src/map/travelSelection.js`
- Modify: `src/App.jsx`
- Modify: `src/components/HudPanels.jsx`
- Modify: `src/map/viewState.js`
- Modify: `src/map/searchController.js`

- [ ] **Step 1: Add a failing pure-function test plan by extracting UI logic into a module**

Since the repo has no frontend test harness yet, first create a pure helper and verify it manually in Node or browser console:

```js
export function normalizeTravelSelection(nodes) {
  return nodes.slice(0, 3).map((node) => ({
    id: node.id || node.adcode,
    name: node.fullName || node.name,
    node_type: node.level === "poi" ? "poi" : "area",
    center: node.feature?.properties?.center || null,
  }));
}
```

- [ ] **Step 2: Create the API client**

`src/api/travelAgentClient.js`

```js
const API_BASE = import.meta.env.VITE_TRAVEL_AGENT_API_BASE || "http://127.0.0.1:8000/api";

export async function postTravelClarify(payload) {
  const response = await fetch(`${API_BASE}/travel/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Travel clarify failed: ${response.status}`);
  return response.json();
}

export async function postTravelPlan(payload) {
  const response = await fetch(`${API_BASE}/travel/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Travel plan failed: ${response.status}`);
  return response.json();
}
```

- [ ] **Step 3: Add a dedicated planner panel**

The panel must show:

- selected travel nodes
- follow-up questions
- source statuses
- itinerary summary
- uncertainty note

Do not overload `HudPanels.jsx` with all new UI. Keep it as shell-level status and add `TravelPlannerPanel.jsx` for the new feature.

- [ ] **Step 4: Add route rendering**

`src/map/travelRouteLayer.js`

```js
export function syncTravelRouteLayer(state, routeDays) {
  state.travelRouteLayer.clear();
  routeDays.forEach((routeDay) => {
    if (!routeDay.coordinates?.length) return;
    // Convert lon/lat to current terrain coordinates and render a line strip.
  });
}
```

- [ ] **Step 5: Wire the planner flow into `App.jsx`**

Add state for:

- `travelSelection`
- `travelClarifyState`
- `travelPlanState`
- `travelSourceState`

Trigger:

- map click to add/remove travel nodes
- clarify call after 1-3 nodes selected
- plan call after user answers follow-up questions

- [ ] **Step 6: Run the frontend verification**

Run: `npm run build`

Expected: `vite build` succeeds.

Run: `npm run dev`

Manual checks at `http://127.0.0.1:5174/`:

- select Wuhan-related nodes
- planner panel appears
- clarify questions render
- plan result appears
- map draws visit-order lines
- source status and uncertainty are visible

- [ ] **Step 7: Commit**

```bash
git add src/api/travelAgentClient.js src/components/TravelPlannerPanel.jsx src/map/travelPlanState.js src/map/travelRouteLayer.js src/map/travelSelection.js src/App.jsx src/components/HudPanels.jsx src/map/viewState.js src/map/searchController.js src/styles.css
git commit -m "feat: integrate travel planner flow into map frontend"
```

## Task 8: Write The API Contract And Final Verification Notes

**Files:**
- Create: `docs/superpowers/specs/2026-06-09-wuhan-travel-agent-api-contract.md`
- Modify: `docs/superpowers/specs/2026-06-09-wuhan-travel-agent-design.md`

- [ ] **Step 1: Write the API contract document**

Document exact request/response payloads for:

- `POST /api/travel/clarify`
- `POST /api/travel/plan`
- `POST /api/poi/extract`
- `GET /api/poi`
- `GET /api/source-status`

Include example response fields:

```json
{
  "answer": "这条路线先把东湖和武昌片区放在前两天，晚上再切到江汉路和江滩。",
  "selected_reasoning": "用户先选了东湖和江汉路，系统围绕湖景白天活动与夜游街区组织节奏。",
  "source_status": [
    {
      "source_id": "wuhan-note-corpus",
      "source_label": "Local Wuhan Note Snapshot",
      "status": "ready"
    }
  ],
  "uncertainty": {
    "level": "partial",
    "message": "部分 POI 由本地笔记自动抽取，坐标只在 seed 节点内验证。"
  }
}
```

- [ ] **Step 2: Add final verification notes to the design doc**

Append a short implementation-readiness note covering:

- local corpus dependency
- seed coordinate dependency
- approved providers only

- [ ] **Step 3: Run final backend and frontend verification**

Run:

- `cd backend; python -m pytest -v`
- `npm run build`

Expected:

- backend tests all `PASS`
- frontend build `PASS`

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-09-wuhan-travel-agent-api-contract.md docs/superpowers/specs/2026-06-09-wuhan-travel-agent-design.md
git commit -m "docs: add travel agent api contract and readiness notes"
```

## Self-Review

### Spec coverage

- Product scope is covered by Tasks 6 and 7.
- Data extraction and uncertainty handling are covered by Tasks 3, 4, and 5.
- Backend architecture layers map directly to Tasks 1 through 6.
- Frontend map integration is covered by Task 7.
- Verification and contracts are covered by Task 8.

### Placeholder scan

- No `TBD`, `TODO`, or “implement later” placeholders are left in the plan.
- The only deliberate dependency is the local Wuhan seed coordinate file, which is named and scoped explicitly.

### Type consistency

- `selected_nodes`, `source_status`, `map_route_days`, and `status=auto_extracted` are used consistently with the approved design spec.
- The route type is consistently named `visit_order_polyline`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-09-wuhan-travel-agent-mvp-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
