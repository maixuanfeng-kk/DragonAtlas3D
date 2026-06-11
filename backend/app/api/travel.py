import httpx
from fastapi import APIRouter

from app.config import get_settings
from app.models.schemas import (
    FollowUpQuestion,
    SourceStatus,
    TravelClarifyRequest,
    TravelClarifyResponse,
    TravelPlanRequest,
    TravelPlanResponse,
    Uncertainty,
)
from app.services.amap_route_service import build_failed_leg, fetch_primary_leg
from app.services.city_itinerary_planner import build_city_day_plan
from app.services.map_projection import build_visit_order_polylines
from app.services.poi_registry import collect_poi_cards_for_selection
from app.services.source_registry import build_default_source_statuses, build_source_status

router = APIRouter(prefix="/travel", tags=["travel"])


def default_follow_up_questions() -> list[FollowUpQuestion]:
    return [
        FollowUpQuestion(id="trip_days_confirm", label="How many days do you want to plan?", options=["1", "2", "3"]),
        FollowUpQuestion(id="time_bias", label="Do you prefer day or night activity rhythm?", options=["day", "night", "balanced"]),
    ]


def build_route_bundle_for_pois(poi_rows: list[dict]) -> tuple[dict[tuple[str, str], object], list[SourceStatus], Uncertainty]:
    settings = get_settings()
    leg_lookup = {}
    failure_items: list[str] = []

    with httpx.Client() as client:
        for start, end in zip(poi_rows, poi_rows[1:]):
            start_id = start["id"]
            end_id = end["id"]
            if not start.get("center") or not end.get("center"):
                leg = build_failed_leg(
                    from_stop_id=start_id,
                    to_stop_id=end_id,
                    mode="walking",
                    mode_label="Walking",
                    reason="MISSING_CENTER",
                )
            else:
                leg = fetch_primary_leg(
                    client=client,
                    settings=settings,
                    origin=start["center"],
                    destination=end["center"],
                    from_stop_id=start_id,
                    to_stop_id=end_id,
                    mode="walking",
                    mode_label="Walking",
                )
            if leg.status != "ready":
                failure_items.append(f"{start['name']} -> {end['name']}")
            leg_lookup[(start_id, end_id)] = leg

    route_status = SourceStatus.model_validate(
        build_source_status(
            source_id="amap-route-v2",
            source_label="Amap Route Planning 2.0",
            status="partial" if failure_items else "ready",
            coverage_note="Real city-leg routing for consecutive itinerary stops",
            provenance="amap-webservice-route-v2",
            error="; ".join(failure_items),
        )
    )
    uncertainty = Uncertainty(
        level="partial" if failure_items else "ready",
        message="Some route legs are missing real Amap results." if failure_items else "All current route legs use real Amap responses.",
        items=failure_items,
    )
    return leg_lookup, [route_status], uncertainty


@router.post("/clarify", response_model=TravelClarifyResponse)
def clarify_trip(request: TravelClarifyRequest) -> TravelClarifyResponse:
    source_status = [
        SourceStatus.model_validate(
            build_source_status(
                source_id="travel-clarifier",
                source_label="Travel Clarifier",
                status="ready",
                coverage_note="Clarification generated from map context only",
                provenance="backend-rule-and-llm",
            ),
        )
    ]
    return TravelClarifyResponse(
        thread_id=request.thread_id,
        selected_nodes=request.selected_nodes,
        follow_up_questions=default_follow_up_questions(),
        source_status=source_status,
        uncertainty=Uncertainty(level="ready", message="Clarification only; no formal itinerary yet.", items=[]),
    )


@router.post("/plan", response_model=TravelPlanResponse)
def plan_trip(request: TravelPlanRequest) -> TravelPlanResponse:
    poi_cards = collect_poi_cards_for_selection(request.selected_nodes)
    poi_rows = [card.model_dump() for card in poi_cards]
    leg_lookup, route_source_status, route_uncertainty = build_route_bundle_for_pois(poi_rows)
    itinerary = build_city_day_plan(
        context=request.model_dump(),
        poi_rows=poi_rows,
        leg_lookup=leg_lookup,
    )
    map_route_days = build_visit_order_polylines(itinerary.model_dump(), poi_rows)
    source_status = [
        SourceStatus.model_validate(item)
        for item in [
            *build_default_source_statuses(),
            *[item.model_dump() for item in route_source_status],
            build_source_status(
                source_id="travel-planner",
                source_label="Travel Planner",
                status="ready",
                coverage_note="Same-city itinerary generated from selected places and route legs",
                provenance="rule-based-city-itinerary-planner",
            ),
        ]
    ]
    answer = "Generated a same-city itinerary from your selected places."
    reasoning = "The planner orders selected places into a single city day plan and keeps route-leg failures visible."
    return TravelPlanResponse(
        thread_id=request.thread_id,
        answer=answer,
        selected_reasoning=reasoning,
        itinerary=itinerary,
        map_route_days=map_route_days,
        poi_cards=poi_cards,
        source_status=source_status,
        uncertainty=route_uncertainty,
        follow_up_questions=[],
    )
