# City Itinerary Map Design

**Date:** 2026-06-10

## 1. Goal

DragonAtlas3D's long-term goal is a China travel agent, not a standalone map demo.

This design defines the next product layer after the 3D China terrain homepage:

- keep the 3D terrain homepage as the national-scale spatial entry;
- let users enter a high-detail Amap city map when they zoom into a city area;
- let users select `2-5` city places on the detail map;
- let the travel agent turn those places into a same-city day itinerary with visit order, transport mode, estimated duration, and suggested departure times;
- write the itinerary back onto the map as an interactive planning surface.

The first implementation target is **same-city daytime planning**, piloted in **Wuhan**, but the design should stay city-extensible.

## 2. Approved Product Direction

The user approved the following product choices for this phase:

- entry mode: the user selects places first on the map;
- scope: same-city one-day or multi-day daytime itineraries;
- UI pattern: double-panel linked itinerary view;
- routing detail: use real Amap routing capability for each itinerary leg;
- map role: the map is not decorative, it is the main itinerary expression layer.

## 3. Version 1 Scope

### 3.1 In Scope

- city detail planning inside a single city;
- user-selected points such as scenic spots, business areas, stations, and landmarks;
- automatic visit ordering by the travel agent;
- per-day itinerary output;
- per-leg transport mode, duration, and suggested departure time;
- map rendering of stops, order, and route legs;
- explicit source status and uncertainty display.

### 3.2 Out of Scope

- cross-city itinerary composition;
- hotel-first or hotel-inclusive routing;
- booking, ticketing, or payment;
- full navigation-grade instruction lists;
- silent fallback to any non-approved provider;
- pretending a failed route leg is a real route.

## 4. User Experience

### 4.1 Main Flow

1. The user opens the product on the 3D China terrain homepage.
2. The user zooms into a city and enters the Amap detail map.
3. The user taps `2-5` places to add them as itinerary candidates.
4. The user clicks `Generate Plan`.
5. The backend returns a ranked same-city itinerary with day grouping, stop timing, and real route legs.
6. The detail map shows the selected day as numbered stops and route legs.
7. The itinerary panel explains the route and stays linked to the map.

### 4.2 Planning Surface

Version 1 should feel like a travel planner, not a generic search result page.

The detail map and the itinerary panel must stay in sync:

- clicking a stop card highlights the matching map marker and incoming or outgoing leg;
- clicking a marker or route leg focuses the matching card;
- switching `Day 1`, `Day 2`, and so on updates the visible route set on the map;
- the active day is prominent; inactive days stay accessible but not visually noisy.

### 4.3 Map Expression Rules

The map should show itinerary information with low clutter and high interpretability:

- each stop uses a large numbered marker such as `1`, `2`, `3`;
- each route leg is drawn using the geometry returned by Amap when available;
- each route leg shows a compact label such as `Metro 28 min` or `Taxi 24 min`;
- each stop label shows time information such as `09:30-11:00` when the zoom level allows;
- only the currently selected day is rendered by default;
- if a route leg fails, the UI must show a failure state instead of drawing fake navigation geometry.

## 5. Core Product Objects

The current response shape of `itinerary + map_route_days` is not sufficient for a planning-grade city itinerary.

Version 1 should promote the planning model to:

- `day plan`
- `stop`
- `leg`

### 5.1 Stop

A stop is a place where the user is expected to arrive and spend time.

Required fields:

- `stop_id`
- `name`
- `place_type`
- `center`
- `arrival_time`
- `departure_time`
- `dwell_minutes`
- `reason`
- `source_status`

### 5.2 Leg

A leg is the movement between two consecutive stops.

Required fields:

- `leg_id`
- `from_stop_id`
- `to_stop_id`
- `mode`
- `mode_label`
- `duration_minutes`
- `distance_meters`
- `departure_time`
- `arrival_time`
- `polyline`
- `provider`
- `status`
- `failure_reason`

### 5.3 Day Plan

A day plan groups stops and legs into a readable itinerary.

Required fields:

- `day`
- `title`
- `summary`
- `stops`
- `legs`

## 6. Data Source Strategy

### 6.1 Approved Sources For This Phase

The approved provider for fine-grained city planning is **Amap**.

This phase uses:

- Amap JS API 2.0 for detail-map rendering and overlays;
- Amap Web Service route planning for real transport legs;
- the existing approved Amap Web Service key path already accepted by the user;
- project-visible source status reporting for all network-backed data.

### 6.2 Verified Capability Boundaries

Verified on **2026-06-10** against official Amap docs:

- Amap Route Planning 2.0 supports route planning for driving, transit, walking, cycling, and e-bike. Official page last updated `2026-02-02`.
  - Source: [Amap Route Planning 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)
- Amap Geocoding and Reverse Geocoding support place resolution and coordinate helpers. Official page last updated `2026-02-02`.
  - Source: [Amap Geocode / Regeo](https://lbs.amap.com/api/webservice/guide/api/georegeo)
- Amap JS API 2.0 is the approved detail-map rendering layer. Official summary page last updated `2025-01-16`.
  - Source: [Amap JS API 2.0 Summary](https://lbs.amap.com/api/javascript-api-v2/summary)

### 6.3 Failure Rules

The product must not silently fall back to another provider or invent route geometry.

If an Amap leg request fails:

- keep the stop order if it is still usable;
- mark the affected leg as `failed` or `partial`;
- show a visible note in the itinerary panel;
- avoid rendering fake turn-by-turn or fake polyline data;
- preserve the provider and failure message in `source_status`.

## 7. Backend Design

### 7.1 Responsibility Split

The backend should own itinerary construction and route-leg assembly.

The frontend should not invent timing or mode logic on its own.

Backend responsibilities:

- receive selected places from the detail map;
- normalize the selected places into itinerary candidates;
- determine visit order;
- group stops into day plans;
- request real Amap route results for each consecutive leg;
- compute suggested departure and arrival times;
- return source status and uncertainty.

### 7.2 Response Shape

`POST /api/travel/plan` should evolve from a simple itinerary summary into a planning response with route legs.

Target response sections:

- `answer`
- `selected_reasoning`
- `itinerary`
- `poi_cards`
- `source_status`
- `uncertainty`

The `itinerary` object should contain:

- `title`
- `days[]`
  - `day`
  - `title`
  - `summary`
  - `stops[]`
  - `legs[]`

The existing `map_route_days` field can stay temporarily as a compatibility layer during migration, but the new frontend should consume `days[].legs[]` and `days[].stops[]` as the primary source of truth.

The request contract should also expand from the current `1-3` selected nodes shape to a planning shape that supports `2-5` selected places for route composition.

### 7.3 Itinerary Assembly Logic

Version 1 should use a stable and explainable planner, not an opaque optimization engine.

Recommended planning sequence:

1. accept `2-5` selected places;
2. resolve usable coordinates for all selected places;
3. build an initial visit order from place type, proximity, and simple day or night preference;
4. call Amap route planning for each consecutive candidate leg;
5. compare feasible modes where relevant and choose the primary recommended mode;
6. compute arrival, dwell, departure, and next-leg start times;
7. emit a single best itinerary with explicit uncertainty if any leg is partial or failed.

### 7.4 Time Model

Version 1 should return planning-friendly times, not free-text guesses.

Required stop timing fields:

- `arrival_time`
- `departure_time`
- `dwell_minutes`

Required leg timing fields:

- `departure_time`
- `arrival_time`
- `duration_minutes`

## 8. Frontend Design

### 8.1 Detail Map As The Execution Surface

The Amap detail map becomes the main execution surface for itinerary planning.

Required visual layers:

- numbered stop markers;
- active stop emphasis;
- per-leg route polylines;
- compact leg labels with mode and duration;
- current-day filter;
- source failure badges when needed.

### 8.2 Itinerary Panel

The current travel panel should evolve from a control panel into an itinerary workspace.

Required panel sections:

- selected places;
- trip settings;
- day tabs;
- stop cards in visit order;
- leg summaries between stop cards;
- source status;
- uncertainty and failure notes.

Each stop card should show:

- stop number;
- stop name;
- arrival and departure time;
- recommended dwell time;
- short reason for inclusion.

Each leg summary should show:

- transport mode;
- estimated duration;
- distance when available;
- whether the leg is `ready`, `partial`, or `failed`.

### 8.3 Interaction Contract

The frontend must support these linked interactions:

- click stop card -> highlight matching marker and related leg;
- click marker -> scroll and focus matching stop card;
- click leg -> focus the two surrounding stops and the matching leg summary;
- switch day -> swap visible itinerary layers on the map;
- regenerate plan -> replace both map and panel state together.

## 9. API And State Changes

### 9.1 Frontend State

The plan state should expand beyond plain text and simple coordinate lists.

Required client-side state concepts:

- `selectedNodes`
- `planState.days`
- `activeDay`
- `activeStopId`
- `activeLegId`
- `planOverlayStatus`

### 9.2 Suggested Schema Additions

The backend schema should add explicit models for:

- `ItineraryStop`
- `ItineraryLeg`
- `ItineraryDay`

The request schema should update accordingly:

- `selected_nodes`: `min_length=2`, `max_length=5` for plan generation;
- keep city scope constrained to one city in Version 1;
- reject cross-city mixes explicitly instead of attempting a hidden fallback.

This keeps route rendering, panel rendering, and testing aligned around one data contract.

## 10. Error Handling And Uncertainty

The product must distinguish these cases clearly:

- stop coordinates missing;
- route leg request failed;
- route leg returned partial data;
- selected places are too far apart for a same-day city itinerary;
- the plan is valid but only some legs are real.

Display rules:

- `ready`: real stop and leg data available;
- `partial`: itinerary usable, but some fields are approximate or missing;
- `failed`: no real result for that leg or provider call.

No UI should hide these states behind generic success language.

## 11. Testing Strategy

### 11.1 Backend

Add tests for:

- selected places become ordered stops;
- legs are created between consecutive stops;
- route failure is represented as `failed` without fake geometry;
- same-city timing fields are returned consistently;
- `source_status` and `uncertainty` remain visible when some legs fail.

### 11.2 Frontend

Add tests for:

- day switching changes the visible map overlays;
- stop-card and marker linking works in both directions;
- failed leg states render visibly;
- the panel can render multi-stop, multi-leg plans without collapsing.

### 11.3 Manual Verification

Manual verification should include:

- entering the detail map from the 3D homepage;
- selecting `2-5` city places;
- generating a plan;
- confirming that a day itinerary appears on both panel and map;
- confirming that a failed route request is shown as failed rather than silently replaced.

## 12. Implementation Phases

### Phase 1

- upgrade the backend response from simple route days to `stops + legs`;
- keep existing itinerary text for compatibility;
- connect Amap route planning per leg.

### Phase 2

- render stops, legs, and labels on the Amap detail map;
- upgrade the travel panel into a day itinerary workspace.

### Phase 3

- add stop replacement and plan regeneration for a single day;
- keep the city-only scope.

## 13. Success Criteria

This design is successful when:

- a user can select city places and get a same-city day itinerary;
- the itinerary is visible as numbered stops and real route legs on the detail map;
- each leg shows transport mode and duration;
- the itinerary panel and map stay linked;
- any Amap failure is shown explicitly;
- the feature feels like a travel planner, not just a text answer with a line on top.
