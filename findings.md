# Findings

## Repository Scope
- The repo has already moved beyond a pure 3D terrain prototype.
- Frontend contains both the national 3D terrain entry surface and a city-detail planning workflow.
- Backend exposes travel, POI, and source-status APIs for a Wuhan travel-agent MVP.
- Product docs in `docs/superpowers/specs` explicitly define the repo as a map-first China travel agent, with Wuhan as the first pilot city.

## Frontend
- `src/App.jsx` keeps the 3D China terrain as the macro entry point and hands off into a detail-map planning mode.
- `src/components/TravelPlanningWorkspace.jsx` mounts two travel-agent surfaces together: an Amap detail map and a planning workspace.
- `src/components/DetailMapPlannerWorkspace.jsx` supports:
  - Amap place search
  - recommended POI loading from backend
  - itinerary candidate selection
  - trip-day, rhythm, and interest-tag inputs
  - clarify and plan actions
  - itinerary timeline display
  - source-status and uncertainty display
- `src/components/AmapDetailView.jsx` uses Amap JS as the city-detail execution surface and renders itinerary overlays tied to day/stop/leg state.
- `src/useTravelPlanner.js` manages the planner state machine for selection, clarify, plan, active day, active stop, and active leg.
- The frontend is currently hard-wired around Wuhan city planning rather than a general China-wide travel-agent workflow.

## Backend
- `backend/app/main.py` exposes `/api/travel`, `/api/poi`, `/api/source-status`, and `/api/health`.
- `backend/app/api/travel.py` implements:
  - `POST /api/travel/clarify`
  - `POST /api/travel/plan`
- `backend/app/models/schemas.py` defines explicit contracts for:
  - source-status states: `pending`, `ready`, `partial`, `failed`
  - clarify request/response
  - itinerary structure with days, stops, and legs
  - uncertainty payloads
- `backend/app/services/city_itinerary_planner.py` builds a same-city itinerary, but it is currently rule-based and returns only `Day 1`.
- `backend/app/services/amap_route_service.py` requests real Amap route legs when `AMAP_WEB_KEY` is configured, otherwise it returns explicit failed legs.
- `backend/app/api/poi.py` supports POI listing and Qwen-based extraction from local Wuhan note snapshots, with explicit failure when Qwen is not configured.
- `backend/app/services/poi_registry.py` merges extracted POIs with Wuhan seed nodes and clearly marks non-seed coordinates as partial.

## Product Direction
- AGENTS.md defines the north star as a China travel agent, with the current 3D terrain page serving as a frontend geography foundation.
- Current implementation is best described as a Wuhan same-city itinerary MVP nested inside a China terrain explorer.
- The product direction is present in both code and docs, but nationwide travel-agent capabilities are not yet generalized.
