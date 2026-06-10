# City Itinerary Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current Wuhan travel planner into a same-city itinerary planner that turns `2-5` selected places into day plans with real Amap route legs, map overlays, and linked itinerary cards.

**Architecture:** Keep the 3D China terrain homepage as the entry and use the Amap detail map as the city-planning surface. Move planning truth into the backend by returning structured `stops + legs`, then render that structure in the frontend through pure overlay-model helpers, an Amap overlay controller, and a linked itinerary workspace.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, httpx, pytest, React 19, Vite, node:test, Amap JS API 2.0, Amap Web Service Route Planning 2.0

---

## File Structure

### Backend files to modify

- Modify: `backend/.env.example`
- Modify: `backend/app/config.py`
- Modify: `backend/app/models/schemas.py`
- Modify: `backend/app/api/travel.py`
- Modify: `backend/tests/test_travel_api.py`

### Backend files to create

- Create: `backend/app/services/amap_route_service.py`
- Create: `backend/app/services/city_itinerary_planner.py`
- Create: `backend/tests/test_amap_route_service.py`
- Create: `backend/tests/test_city_itinerary_planner.py`

### Frontend files to modify

- Modify: `src/App.jsx`
- Modify: `src/useTravelPlanner.js`
- Modify: `src/map/travelPlanState.js`
- Modify: `src/map/travelSelection.js`
- Modify: `src/components/AmapDetailView.jsx`
- Modify: `src/components/TravelPlannerPanel.jsx`
- Modify: `src/travel-planner.css`
- Modify: `src/styles/detail-map.css`

### Frontend files to create

- Create: `src/components/TravelPlanningWorkspace.jsx`
- Create: `src/components/TravelPlannerDayTabs.jsx`
- Create: `src/components/TravelPlannerDayTimeline.jsx`
- Create: `src/map/detailMapItineraryModel.js`
- Create: `src/map/detailMapItineraryModel.test.js`
- Create: `src/map/amapItineraryOverlay.js`

## Implementation Constraints

- Keep every source file under `400` lines.
- Do not add any silent fallback to non-Amap providers.
- Do not render fake route geometry when Amap leg requests fail.
- Preserve visible `pending / ready / partial / failed` states.
- Keep `map_route_days` only as a temporary compatibility field while the frontend migrates.
- Treat mixed-city selections as a visible validation failure in Version 1.

## Task Order

### Task 1: Upgrade backend contracts for city itinerary planning

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/app/config.py`
- Modify: `backend/app/models/schemas.py`
- Test: `backend/tests/test_travel_api.py`

- [ ] **Step 1: Write the failing contract tests**

```python
def test_plan_request_requires_at_least_two_selected_nodes():
    payload = {
        "thread_id": "t-plan-1",
        "current_city": "wuhan",
        "selected_nodes": [{"id": "donghu", "name": "东湖", "node_type": "poi", "center": [114.41, 30.56]}],
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
```

- [ ] **Step 2: Run the backend contract tests to verify they fail**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main\backend
python -m pytest tests/test_travel_api.py -q
```

Expected: `TravelPlanRequest` still inherits the old `1-3` selection shape, so the new acceptance or rejection assertions fail.

- [ ] **Step 3: Add the planning schema and Amap config fields**

```python
class ItineraryStop(BaseModel):
    stop_id: str
    name: str
    place_type: str
    center: list[float]
    arrival_time: str
    departure_time: str
    dwell_minutes: int
    reason: str
    source_status: SourceState = "ready"


class ItineraryLeg(BaseModel):
    leg_id: str
    from_stop_id: str
    to_stop_id: str
    mode: str
    mode_label: str
    duration_minutes: int | None = None
    distance_meters: int | None = None
    departure_time: str = ""
    arrival_time: str = ""
    polyline: list[list[float]] = Field(default_factory=list)
    provider: str = "amap-route-v2"
    status: SourceState = "pending"
    failure_reason: str = ""


class ItineraryDay(BaseModel):
    day: int
    title: str = ""
    summary: str = ""
    stops: list[ItineraryStop] = Field(default_factory=list)
    legs: list[ItineraryLeg] = Field(default_factory=list)


class TravelPlanRequest(TravelClarifyRequest):
    selected_nodes: list[SelectedNode] = Field(min_length=2, max_length=5)
    answers: dict[str, str] = Field(default_factory=dict)
```

```python
class Settings(BaseSettings):
    amap_web_key: str = ""
    amap_web_base_url: str = "https://restapi.amap.com"
```

```env
AMAP_WEB_KEY=
AMAP_WEB_BASE_URL=https://restapi.amap.com
```

- [ ] **Step 4: Run the backend contract tests again**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main\backend
python -m pytest tests/test_travel_api.py -q
```

Expected: the new request-shape tests pass, while route-related tests still fail because legs are not implemented yet.

- [ ] **Step 5: Commit**

```powershell
Set-Location D:\agent\DragonAtlas3D-main
git add backend/.env.example backend/app/config.py backend/app/models/schemas.py backend/tests/test_travel_api.py
git commit -m "feat: expand travel plan contracts for city itineraries"
```

### Task 2: Add an Amap route-leg service with explicit failure states

**Files:**
- Create: `backend/app/services/amap_route_service.py`
- Test: `backend/tests/test_amap_route_service.py`

- [ ] **Step 1: Write the failing route-service tests**

```python
def test_select_primary_leg_normalizes_a_walking_route():
    payload = {
        "route": {
            "paths": [
                {
                    "distance": "1280",
                    "cost": {"duration": "1080"},
                    "steps": [{"polyline": "114.1,30.1;114.2,30.2"}],
                }
            ]
        }
    }

    leg = normalize_amap_path(
        payload=payload,
        mode="walking",
        mode_label="步行",
        from_stop_id="jianghan-road",
        to_stop_id="yellow-crane-tower",
    )

    assert leg.mode == "walking"
    assert leg.duration_minutes == 18
    assert leg.distance_meters == 1280
    assert leg.polyline == [[114.1, 30.1], [114.2, 30.2]]
    assert leg.status == "ready"


def test_failed_leg_keeps_reason_without_fake_polyline():
    leg = build_failed_leg(
        from_stop_id="a",
        to_stop_id="b",
        mode="transit",
        mode_label="地铁/公交",
        reason="AMAP_TRANSIT_EMPTY",
    )

    assert leg.status == "failed"
    assert leg.failure_reason == "AMAP_TRANSIT_EMPTY"
    assert leg.polyline == []
```

- [ ] **Step 2: Run the route-service tests to verify they fail**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main\backend
python -m pytest tests/test_amap_route_service.py -q
```

Expected: fail because the route-service module does not exist yet.

- [ ] **Step 3: Implement the route normalization and fetch helpers**

```python
ROUTE_ENDPOINTS = {
    "walking": "/v5/direction/walking",
    "driving": "/v5/direction/driving",
    "transit": "/v5/direction/transit/integrated",
}


@dataclass
class RouteBundle:
    leg_lookup: dict[tuple[str, str], ItineraryLeg]
    source_status: list[dict]
    uncertainty: Uncertainty


def decode_polyline(text: str) -> list[list[float]]:
    points: list[list[float]] = []
    for pair in text.split(";"):
        lon, lat = pair.split(",")
        points.append([float(lon), float(lat)])
    return points


def normalize_amap_path(*, payload: dict, mode: str, mode_label: str, from_stop_id: str, to_stop_id: str) -> ItineraryLeg:
    path = (payload.get("route") or {}).get("paths", [{}])[0]
    steps = path.get("steps") or []
    joined = []
    for step in steps:
        joined.extend(decode_polyline(step.get("polyline", "")))
    duration_seconds = int(((path.get("cost") or {}).get("duration")) or path.get("duration") or 0)
    return ItineraryLeg(
        leg_id=f"{from_stop_id}:{to_stop_id}:{mode}",
        from_stop_id=from_stop_id,
        to_stop_id=to_stop_id,
        mode=mode,
        mode_label=mode_label,
        duration_minutes=max(1, round(duration_seconds / 60)),
        distance_meters=int(path.get("distance") or 0),
        polyline=joined,
        status="ready",
    )
```

```python
def fetch_primary_leg(client: httpx.Client, settings: Settings, *, origin: list[float], destination: list[float], from_stop_id: str, to_stop_id: str) -> ItineraryLeg:
    response = client.get(
        f"{settings.amap_web_base_url}{ROUTE_ENDPOINTS['walking']}",
        params={
            "key": settings.amap_web_key,
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
        },
        timeout=20,
    )
    payload = response.json()
    if response.status_code != 200 or not ((payload.get("route") or {}).get("paths")):
        return build_failed_leg(
            from_stop_id=from_stop_id,
            to_stop_id=to_stop_id,
            mode="walking",
            mode_label="步行",
            reason="AMAP_WALKING_EMPTY",
        )
    return normalize_amap_path(
        payload=payload,
        mode="walking",
        mode_label="步行",
        from_stop_id=from_stop_id,
        to_stop_id=to_stop_id,
    )
```

```python
def build_failed_leg(*, from_stop_id: str, to_stop_id: str, mode: str, mode_label: str, reason: str) -> ItineraryLeg:
    return ItineraryLeg(
        leg_id=f"{from_stop_id}:{to_stop_id}:{mode}",
        from_stop_id=from_stop_id,
        to_stop_id=to_stop_id,
        mode=mode,
        mode_label=mode_label,
        status="failed",
        failure_reason=reason,
    )
```

```python
def build_route_bundle_for_pois(current_city: str, poi_rows: list[dict]) -> RouteBundle:
    leg_lookup: dict[tuple[str, str], ItineraryLeg] = {}
    source_status: list[dict] = []
    failure_items: list[str] = []

    with httpx.Client() as client:
        for start, end in zip(poi_rows, poi_rows[1:]):
            if not start.get("center") or not end.get("center"):
                leg = build_failed_leg(
                    from_stop_id=start["id"],
                    to_stop_id=end["id"],
                    mode="walking",
                    mode_label="步行",
                    reason="MISSING_CENTER",
                )
                failure_items.append(f"{start['name']} -> {end['name']}")
            else:
                leg = fetch_primary_leg(
                    client,
                    get_settings(),
                    origin=start["center"],
                    destination=end["center"],
                    from_stop_id=start["id"],
                    to_stop_id=end["id"],
                )
                if leg.status != "ready":
                    failure_items.append(f"{start['name']} -> {end['name']}")
            leg_lookup[(start["id"], end["id"])] = leg

    source_status.append(
        build_source_status(
            source_id="amap-route-v2",
            source_label="Amap Route Planning 2.0",
            status="partial" if failure_items else "ready",
            coverage_note="Real city-leg routing for consecutive itinerary stops",
            provenance="amap-webservice-route-v2",
            error="; ".join(failure_items),
        )
    )

    return RouteBundle(
        leg_lookup=leg_lookup,
        source_status=source_status,
        uncertainty=Uncertainty(
            level="partial" if failure_items else "ready",
            message="部分行程段尚未获得真实高德路线结果。" if failure_items else "高德路线结果可用于城市段规划。",
            items=failure_items,
        ),
    )
```

- [ ] **Step 4: Run the route-service tests again**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main\backend
python -m pytest tests/test_amap_route_service.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```powershell
Set-Location D:\agent\DragonAtlas3D-main
git add backend/app/services/amap_route_service.py backend/tests/test_amap_route_service.py
git commit -m "feat: add amap route leg service"
```

### Task 3: Build the city itinerary planner and integrate it into `/api/travel/plan`

**Files:**
- Create: `backend/app/services/city_itinerary_planner.py`
- Modify: `backend/app/api/travel.py`
- Modify: `backend/tests/test_travel_api.py`
- Test: `backend/tests/test_city_itinerary_planner.py`

- [ ] **Step 1: Write the failing planner and API tests**

```python
def test_build_city_day_plan_returns_stops_and_legs():
    poi_rows = [
        {"id": "jianghan-road", "name": "江汉路", "category": "business_area", "center": [114.298, 30.584]},
        {"id": "yellow-crane-tower", "name": "黄鹤楼", "category": "sightseeing", "center": [114.306, 30.547]},
        {"id": "donghu", "name": "东湖", "category": "sightseeing", "center": [114.419, 30.56]},
    ]
    fake_legs = {
        ("jianghan-road", "yellow-crane-tower"): build_failed_leg(
            from_stop_id="jianghan-road",
            to_stop_id="yellow-crane-tower",
            mode="walking",
            mode_label="步行",
            reason="TEST_ONLY",
        )
    }

    itinerary = build_city_day_plan(
        context={"trip_days": 3, "day_or_night_preference": "balanced"},
        poi_rows=poi_rows,
        leg_lookup=fake_legs,
    )

    assert itinerary.days[0].stops[0].stop_id == "jianghan-road"
    assert itinerary.days[0].legs[0].from_stop_id == "jianghan-road"
    assert itinerary.days[0].legs[0].status == "failed"
```

```python
def test_plan_returns_structured_day_stops_and_legs():
    payload = {
        "thread_id": "t-structured",
        "current_city": "wuhan",
        "selected_nodes": [
            {"id": "jianghan-road", "name": "江汉路", "node_type": "poi", "center": [114.298, 30.584]},
            {"id": "yellow-crane-tower", "name": "黄鹤楼", "node_type": "poi", "center": [114.306, 30.547]},
        ],
        "trip_days": 3,
        "day_or_night_preference": "balanced",
        "interest_tags": ["street"],
        "answers": {},
    }

    with TestClient(app) as client:
        response = client.post("/api/travel/plan", json=payload)

    body = response.json()
    assert response.status_code == 200
    assert body["itinerary"]["days"][0]["stops"][0]["stop_id"]
    assert body["itinerary"]["days"][0]["legs"][0]["from_stop_id"]
```

- [ ] **Step 2: Run the planner and API tests to verify they fail**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main\backend
python -m pytest tests/test_city_itinerary_planner.py tests/test_travel_api.py -q
```

Expected: fail because the planner does not yet emit `stops` and `legs`.

- [ ] **Step 3: Implement the planner and API integration**

```python
def format_clock(total_minutes: int) -> str:
    hour = total_minutes // 60
    minute = total_minutes % 60
    return f"{hour:02d}:{minute:02d}"


def suggested_dwell_minutes(category: str) -> int:
    return {
        "sightseeing": 90,
        "business_area": 75,
        "station": 30,
    }.get(category, 60)


def sort_city_pois(poi_rows: list[dict], preference: str) -> list[dict]:
    if preference == "night":
        return sorted(poi_rows, key=lambda row: 0 if row.get("category") == "business_area" else 1)
    return sorted(poi_rows, key=lambda row: 0 if row.get("category") == "sightseeing" else 1)


def build_city_day_plan(*, context: dict, poi_rows: list[dict], leg_lookup: dict[tuple[str, str], ItineraryLeg]) -> Itinerary:
    ordered = sort_city_pois(poi_rows, context.get("day_or_night_preference", "balanced"))
    stops: list[ItineraryStop] = []
    legs: list[ItineraryLeg] = []
    current_minutes = 9 * 60 + 30

    for index, row in enumerate(ordered):
        dwell_minutes = suggested_dwell_minutes(row.get("category", "unknown"))
        arrival = format_clock(current_minutes)
        departure = format_clock(current_minutes + dwell_minutes)
        stops.append(
            ItineraryStop(
                stop_id=row["id"],
                name=row["name"],
                place_type=row.get("category", "unknown"),
                center=row["center"],
                arrival_time=arrival,
                departure_time=departure,
                dwell_minutes=dwell_minutes,
                reason=row.get("reason_summary", f"围绕 {row['name']} 安排城市行程"),
            )
        )
        if index < len(ordered) - 1:
            leg = leg_lookup[(row["id"], ordered[index + 1]["id"])]
            leg.departure_time = departure
            leg.arrival_time = format_clock(current_minutes + dwell_minutes + (leg.duration_minutes or 0))
            legs.append(leg)
            current_minutes += dwell_minutes + (leg.duration_minutes or 0)
        else:
            current_minutes += dwell_minutes

    return Itinerary(
        title=f"武汉 {max(1, min(int(context.get('trip_days', 1)), 3))} 日城市行程",
        days=[ItineraryDay(day=1, title="Day 1", summary="同城顺路游览", stops=stops, legs=legs)],
    )
```

```python
@router.post("/plan", response_model=TravelPlanResponse)
def plan_trip(request: TravelPlanRequest) -> TravelPlanResponse:
    poi_cards = collect_poi_cards_for_selection(request.selected_nodes)
    route_bundle = build_route_bundle_for_pois(request.current_city, [card.model_dump() for card in poi_cards])
    itinerary = build_city_day_plan(
        context=request.model_dump(),
        poi_rows=[card.model_dump() for card in poi_cards],
        leg_lookup=route_bundle.leg_lookup,
    )
    return TravelPlanResponse(
        thread_id=request.thread_id,
        answer="已根据你选择的城市点位生成同城顺路方案。",
        selected_reasoning="优先把距离更近、节奏更顺的点位串成同一日行程。",
        itinerary=itinerary,
        map_route_days=build_visit_order_polylines(itinerary.model_dump(), [card.model_dump() for card in poi_cards]),
        poi_cards=poi_cards,
        source_status=route_bundle.source_status,
        uncertainty=route_bundle.uncertainty,
        follow_up_questions=[],
    )
```

- [ ] **Step 4: Run the planner and API tests again**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main\backend
python -m pytest tests/test_city_itinerary_planner.py tests/test_travel_api.py -q
```

Expected: planner tests pass and API response now contains `days[].stops[]` and `days[].legs[]`.

- [ ] **Step 5: Commit**

```powershell
Set-Location D:\agent\DragonAtlas3D-main
git add backend/app/services/city_itinerary_planner.py backend/app/api/travel.py backend/tests/test_city_itinerary_planner.py backend/tests/test_travel_api.py
git commit -m "feat: add city itinerary planner response"
```

### Task 4: Expand frontend plan state and normalize the new itinerary contract

**Files:**
- Modify: `src/map/travelPlanState.js`
- Modify: `src/map/travelSelection.js`
- Modify: `src/useTravelPlanner.js`
- Create: `src/map/detailMapItineraryModel.js`
- Test: `src/map/detailMapItineraryModel.test.js`

- [ ] **Step 1: Write the failing frontend model tests**

```javascript
test("normalizePlanDays returns a selected active day with stop and leg ids", () => {
  const result = normalizePlanDays({
    itinerary: {
      days: [
        {
          day: 1,
          stops: [{ stop_id: "jianghan-road" }, { stop_id: "yellow-crane-tower" }],
          legs: [{ leg_id: "jianghan-road:yellow-crane-tower:walking" }],
        },
      ],
    },
  });

  assert.equal(result.activeDay, 1);
  assert.equal(result.days[0].stops[0].stop_id, "jianghan-road");
  assert.equal(result.days[0].legs[0].leg_id, "jianghan-road:yellow-crane-tower:walking");
});

test("buildDetailMapOverlayModel returns numbered stop markers and leg labels", () => {
  const overlay = buildDetailMapOverlayModel({
    activeDay: 1,
    days: [
      {
        day: 1,
        stops: [{ stop_id: "a", name: "A", center: [114.1, 30.1], arrival_time: "09:30", departure_time: "10:30" }],
        legs: [{ leg_id: "a:b:walking", from_stop_id: "a", to_stop_id: "b", mode_label: "步行", duration_minutes: 18, polyline: [[114.1, 30.1], [114.2, 30.2]], status: "ready" }],
      },
    ],
  });

  assert.equal(overlay.markers[0].indexLabel, "1");
  assert.equal(overlay.legs[0].label, "步行 18 分钟");
});
```

- [ ] **Step 2: Run the frontend model tests to verify they fail**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main
node --test src/map/detailMapItineraryModel.test.js
```

Expected: fail because the normalization helpers do not exist yet.

- [ ] **Step 3: Implement state normalization and 5-point selection support**

```javascript
export function createInitialTravelPlanState() {
  return {
    status: "idle",
    answer: "",
    selectedReasoning: "",
    itinerary: null,
    days: [],
    activeDay: 1,
    activeStopId: "",
    activeLegId: "",
    mapRouteDays: [],
    poiCards: [],
    sourceStatus: [],
    uncertainty: null,
    error: "",
  };
}
```

```javascript
export function addTravelSelection(existing, node) {
  const candidate = normalizeTravelNode(node);
  if (!candidate) {
    return existing;
  }

  const next = [candidate, ...existing.filter((item) => item.id !== candidate.id)];
  return next.slice(0, 5);
}
```

```javascript
export function normalizePlanDays(response) {
  const days = response?.itinerary?.days || [];
  const activeDay = days[0]?.day || 1;
  return { days, activeDay };
}


export function selectDayFromPlan({ requestedDay, days }) {
  return days.find((day) => day.day === requestedDay)?.day || days[0]?.day || 1;
}


export function buildDetailMapOverlayModel({ activeDay, days }) {
  const day = days.find((item) => item.day === activeDay) || days[0] || { stops: [], legs: [] };
  return {
    markers: day.stops.map((stop, index) => ({
      stopId: stop.stop_id,
      center: stop.center,
      indexLabel: String(index + 1),
      timeLabel: `${stop.arrival_time}-${stop.departure_time}`,
    })),
    legs: day.legs.map((leg) => ({
      legId: leg.leg_id,
      fromStopId: leg.from_stop_id,
      toStopId: leg.to_stop_id,
      status: leg.status,
      polyline: leg.polyline || [],
      label: leg.duration_minutes ? `${leg.mode_label} ${leg.duration_minutes} 分钟` : `${leg.mode_label} 未就绪`,
    })),
  };
}
```

- [ ] **Step 4: Run the frontend model tests again**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main
node --test src/map/detailMapItineraryModel.test.js
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```powershell
Set-Location D:\agent\DragonAtlas3D-main
git add src/map/travelPlanState.js src/map/travelSelection.js src/useTravelPlanner.js src/map/detailMapItineraryModel.js src/map/detailMapItineraryModel.test.js
git commit -m "feat: normalize itinerary days for detail map planning"
```

### Task 5: Render itinerary overlays on the Amap detail map

**Files:**
- Create: `src/map/amapItineraryOverlay.js`
- Modify: `src/components/AmapDetailView.jsx`
- Modify: `src/styles/detail-map.css`
- Test: `src/map/detailMapItineraryModel.test.js`

- [ ] **Step 1: Extend the model test with failed-leg overlay behavior**

```javascript
test("buildDetailMapOverlayModel omits fake geometry for failed legs", () => {
  const overlay = buildDetailMapOverlayModel({
    activeDay: 1,
    days: [
      {
        day: 1,
        stops: [],
        legs: [{ leg_id: "a:b:transit", from_stop_id: "a", to_stop_id: "b", mode_label: "地铁/公交", status: "failed", polyline: [] }],
      },
    ],
  });

  assert.equal(overlay.legs[0].status, "failed");
  assert.deepEqual(overlay.legs[0].polyline, []);
});
```

- [ ] **Step 2: Run the frontend model test to verify the new assertion fails**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main
node --test src/map/detailMapItineraryModel.test.js
```

Expected: fail until the overlay model and renderer both understand failed legs.

- [ ] **Step 3: Implement the Amap overlay controller and detail-map wiring**

```javascript
export function mountAmapItineraryOverlay({ AMap, map, overlayModel, activeStopId, onStopSelect, onLegSelect }) {
  const markers = overlayModel.markers.map((item) => {
    const marker = new AMap.Marker({
      position: item.center,
      content: `<button class="amap-stop-marker ${item.stopId === activeStopId ? "is-active" : ""}">${item.indexLabel}</button>`,
      anchor: "bottom-center",
    });
    marker.on("click", () => onStopSelect(item.stopId));
    marker.setMap(map);
    return marker;
  });

  const polylines = overlayModel.legs
    .filter((item) => item.polyline.length > 1)
    .map((item) => {
      const line = new AMap.Polyline({
        path: item.polyline,
        strokeColor: item.status === "failed" ? "#b85c38" : "#2f6d5d",
        strokeWeight: 6,
        strokeOpacity: 0.92,
      });
      line.on("click", () => onLegSelect(item.legId));
      line.setMap(map);
      return line;
    });

  return () => {
    markers.forEach((marker) => marker.setMap(null));
    polylines.forEach((line) => line.setMap(null));
  };
}
```

```jsx
export function AmapDetailView({ viewport, itineraryState, onBack, onSelectStop, onSelectLeg }) {
  const overlayCleanupRef = useRef(() => {});

  useEffect(() => {
    if (!mapRef.current || !window.AMap) {
      return;
    }

    overlayCleanupRef.current();
    overlayCleanupRef.current = mountAmapItineraryOverlay({
      AMap: window.AMap,
      map: mapRef.current,
      overlayModel: buildDetailMapOverlayModel(itineraryState),
      activeStopId: itineraryState.activeStopId,
      onStopSelect: onSelectStop,
      onLegSelect: onSelectLeg,
    });

    return () => overlayCleanupRef.current();
  }, [itineraryState, onSelectStop, onSelectLeg]);
}
```

- [ ] **Step 4: Run the frontend model tests again**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main
node --test src/map/detailMapItineraryModel.test.js
```

Expected: overlay tests pass and failed legs stay visible without fake polylines.

- [ ] **Step 5: Commit**

```powershell
Set-Location D:\agent\DragonAtlas3D-main
git add src/map/amapItineraryOverlay.js src/components/AmapDetailView.jsx src/styles/detail-map.css src/map/detailMapItineraryModel.test.js
git commit -m "feat: render itinerary overlays on amap detail map"
```

### Task 6: Turn the planner panel into a linked itinerary workspace and keep `App.jsx` under 400 lines

**Files:**
- Create: `src/components/TravelPlanningWorkspace.jsx`
- Create: `src/components/TravelPlannerDayTabs.jsx`
- Create: `src/components/TravelPlannerDayTimeline.jsx`
- Modify: `src/components/TravelPlannerPanel.jsx`
- Modify: `src/App.jsx`
- Modify: `src/travel-planner.css`

- [ ] **Step 1: Write the failing integration test for day selection helpers**

```javascript
test("selectDayFromPlan falls back to the first returned day", () => {
  const next = selectDayFromPlan({
    requestedDay: 3,
    days: [{ day: 1 }, { day: 2 }],
  });

  assert.equal(next, 1);
});
```

- [ ] **Step 2: Run the frontend helper tests to verify they fail**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main
node --test src/map/detailMapItineraryModel.test.js
```

Expected: fail because the day-selection helper is not implemented yet.

- [ ] **Step 3: Extract a planning workspace component and upgrade the panel UI**

```jsx
export function TravelPlanningWorkspace({
  currentCandidate,
  planner,
  detailMapMode,
  detailMapViewport,
  onExitDetailMap,
}) {
  if (detailMapMode && detailMapViewport) {
    return (
      <AmapDetailView
        viewport={detailMapViewport}
        itineraryState={planner.planState}
        onBack={onExitDetailMap}
        onSelectStop={planner.setActiveStopId}
        onSelectLeg={planner.setActiveLegId}
      />
    );
  }

  return (
    <TravelPlannerPanel
      currentCandidate={currentCandidate}
      selectedNodes={planner.selectedNodes}
      planState={planner.planState}
      activeDay={planner.planState.activeDay}
      onSelectDay={planner.setActiveDay}
      onSelectStop={planner.setActiveStopId}
      onSelectLeg={planner.setActiveLegId}
    />
  );
}
```

```jsx
export function TravelPlannerDayTabs({ days, activeDay, onSelectDay }) {
  return (
    <div className="planner-day-tabs">
      {days.map((day) => (
        <button key={day.day} type="button" className={day.day === activeDay ? "is-active" : ""} onClick={() => onSelectDay(day.day)}>
          Day {day.day}
        </button>
      ))}
    </div>
  );
}
```

```jsx
export function TravelPlannerDayTimeline({ day, activeStopId, activeLegId, onSelectStop, onSelectLeg }) {
  return (
    <div className="planner-day-timeline">
      {day.stops.map((stop, index) => (
        <section key={stop.stop_id} className={stop.stop_id === activeStopId ? "planner-stop-card is-active" : "planner-stop-card"}>
          <button type="button" onClick={() => onSelectStop(stop.stop_id)}>
            <span>{index + 1}</span>
            <strong>{stop.name}</strong>
            <small>{stop.arrival_time} - {stop.departure_time}</small>
          </button>
          {day.legs[index] && (
            <button
              type="button"
              className={day.legs[index].leg_id === activeLegId ? "planner-leg-card is-active" : "planner-leg-card"}
              onClick={() => onSelectLeg(day.legs[index].leg_id)}
            >
              {day.legs[index].mode_label} {day.legs[index].duration_minutes ?? "--"} 分钟
            </button>
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the frontend helper tests and the production build**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main
node --test src/map/detailMapItineraryModel.test.js
npm run build
```

Expected: helper tests pass and Vite build succeeds.

- [ ] **Step 5: Commit**

```powershell
Set-Location D:\agent\DragonAtlas3D-main
git add src/components/TravelPlanningWorkspace.jsx src/components/TravelPlannerDayTabs.jsx src/components/TravelPlannerDayTimeline.jsx src/components/TravelPlannerPanel.jsx src/App.jsx src/travel-planner.css
git commit -m "feat: add linked itinerary planning workspace"
```

### Task 7: Full verification and browser check

**Files:**
- Verify only

- [ ] **Step 1: Run the backend test suite for the touched travel files**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main\backend
python -m pytest tests/test_amap_route_service.py tests/test_city_itinerary_planner.py tests/test_travel_api.py -q
```

Expected: all touched backend tests pass.

- [ ] **Step 2: Run the frontend node tests**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main
node --test src/map/detailMapItineraryModel.test.js src/map/detailMapMode.test.js src/map/viewportPoiPolicy.test.js
```

Expected: all listed frontend tests pass.

- [ ] **Step 3: Run the production build**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main
npm run build
```

Expected: `vite build` completes successfully.

- [ ] **Step 4: Run the local app and verify the city itinerary flow in the browser**

Run:

```powershell
Set-Location D:\agent\DragonAtlas3D-main
npm run dev -- --host 127.0.0.1 --port 5174
```

Manual checks at `http://127.0.0.1:5174/`:

- enter the Amap detail map from the 3D homepage;
- select `2-5` city places;
- generate a plan successfully;
- see `Day 1` cards with numbered stops and leg summaries;
- click a stop card and confirm the matching marker highlights;
- click a route leg and confirm the matching leg summary highlights;
- if an Amap route request fails, confirm the panel shows `failed` and the map does not draw fake geometry.

- [ ] **Step 5: Commit the final verified implementation**

```powershell
Set-Location D:\agent\DragonAtlas3D-main
git add backend src
git commit -m "feat: ship city itinerary map planning"
```

## Self-Review

### Spec coverage

- same-city planning only: covered by Tasks 1, 3, and 7.
- `2-5` user-selected places: covered by Tasks 1 and 4.
- real Amap route legs: covered by Tasks 2 and 3.
- double-panel linked itinerary UI: covered by Tasks 5 and 6.
- visible failure and uncertainty: covered by Tasks 2, 3, 5, and 7.
- no fake geometry: covered by Tasks 2 and 5.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task includes exact file paths, concrete code, commands, and expected results.

### Type consistency

- Backend uses `ItineraryStop`, `ItineraryLeg`, and richer `ItineraryDay` throughout.
- Frontend consumes `days[].stops[]` and `days[].legs[]` consistently.
- Compatibility with `map_route_days` is preserved during migration but not treated as the primary source of truth.
