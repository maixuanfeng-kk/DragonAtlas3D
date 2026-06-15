"""Node 6 — Response Formatter.

Finalizes the agent state for API response serialization.
No LLM calls — builds map_route_days, source_status, and uncertainty payload.
"""

from app.agent.state import AgentState
from app.services.map_projection import build_visit_order_polylines
from app.services.source_registry import build_default_source_statuses


def response_formatter(state: AgentState) -> dict:
    """Finalize the agent state for API response serialization.

    Builds map_route_days from the itinerary and assembles
    source_status / uncertainty in the shape expected by the API schema.
    """
    itinerary = state.get("itinerary") or {}
    poi_cards = state.get("poi_cards", [])

    # Build map_route_days via existing map_projection service
    map_route_days: list[dict] = []
    if itinerary.get("days"):
        try:
            projections = build_visit_order_polylines(itinerary, poi_cards)
            map_route_days = [proj.model_dump() for proj in projections]
        except Exception:
            map_route_days = []

    # Merge default source statuses
    source_status = list(state.get("source_status", []))
    for default_item in build_default_source_statuses():
        existing_ids = {s.get("source_id") for s in source_status}
        if default_item["source_id"] not in existing_ids:
            source_status.append(default_item)

    # Build uncertainty
    uncertainty = state.get("uncertainty")
    if not uncertainty:
        failed_legs = sum(
            1 for d in itinerary.get("days", [])
            for leg in d.get("legs", [])
            if leg.get("status") != "ready"
        )
        uncertainty = {
            "level": "partial" if failed_legs else "ready",
            "message": (
                f"{failed_legs} route leg(s) without real Amap data."
                if failed_legs
                else "All route legs use real Amap responses."
            ),
            "items": [],
        }

    return {
        "map_route_days": map_route_days,
        "source_status": source_status,
        "uncertainty": uncertainty,
    }
