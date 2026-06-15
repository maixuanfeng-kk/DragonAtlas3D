"""DragonAtlas3D Travel Agent API — powered by LangGraph.

POST /api/travel/clarify — generate dynamic follow-up questions from map selections.
POST /api/travel/plan    — generate a multi-day city itinerary with route legs.
"""

from fastapi import APIRouter

from app.agent.runner import run_agent_clarify, run_agent_plan
from app.models.schemas import (
    FollowUpQuestion,
    Itinerary,
    ItineraryDay,
    ItineraryLeg,
    ItineraryStop,
    PoiCard,
    RouteDay,
    SourceStatus,
    TravelClarifyRequest,
    TravelClarifyResponse,
    TravelPlanRequest,
    TravelPlanResponse,
    Uncertainty,
)

router = APIRouter(prefix="/travel", tags=["travel"])


# ─────────────────────────────────────────────────────────────────
# Helpers — map agent state → Pydantic response models
# ─────────────────────────────────────────────────────────────────

def _build_source_statuses(raw: list[dict]) -> list[SourceStatus]:
    return [SourceStatus.model_validate(item) for item in raw]


def _build_uncertainty(raw: dict | None) -> Uncertainty | None:
    if not raw:
        # Preserve legacy behavior: always return an uncertainty payload.
        return Uncertainty(level="ready", message="Agent completed with no explicit uncertainty signal.", items=[])
    return Uncertainty.model_validate(raw)


def _build_questions(raw: list[dict]) -> list[FollowUpQuestion]:
    return [FollowUpQuestion.model_validate(q) for q in raw]


def _build_selected_nodes(raw: list[dict]) -> list:
    from app.models.schemas import SelectedNode
    return [SelectedNode.model_validate(n) for n in raw]


def _build_itinerary(raw: dict | None) -> Itinerary | None:
    if not raw or not raw.get("days"):
        return None
    days = [
        ItineraryDay(
            day=d.get("day", 1),
            title=d.get("title", ""),
            summary=d.get("summary", ""),
            stops=[ItineraryStop.model_validate(s) for s in d.get("stops", [])],
            legs=[ItineraryLeg.model_validate(leg) for leg in d.get("legs", [])],
        )
        for d in raw.get("days", [])
    ]
    return Itinerary(title=raw.get("title", ""), days=days)


def _build_poi_cards(raw: list[dict]) -> list[PoiCard]:
    return [PoiCard.model_validate(card) for card in raw]


def _build_map_route_days(raw: list[dict]) -> list[RouteDay]:
    return [RouteDay.model_validate(r) for r in raw]


# ─────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────

@router.post("/clarify", response_model=TravelClarifyResponse)
def clarify_trip(request: TravelClarifyRequest) -> TravelClarifyResponse:
    """Generate dynamic follow-up questions based on map-selected nodes.

    Powered by the LangGraph travel agent in 'clarify' phase.
    Falls back to rule-based questions if Qwen LLM is unavailable.
    """
    state = run_agent_clarify(request.model_dump())

    return TravelClarifyResponse(
        thread_id=state["thread_id"],
        selected_nodes=_build_selected_nodes(state.get("selected_nodes", [])),
        follow_up_questions=_build_questions(state.get("follow_up_questions", [])),
        source_status=_build_source_statuses(state.get("source_status", [])),
        uncertainty=_build_uncertainty(state.get("uncertainty")),
    )


@router.post("/plan", response_model=TravelPlanResponse)
def plan_trip(request: TravelPlanRequest) -> TravelPlanResponse:
    """Generate a multi-day city itinerary from selected nodes and preferences.

    Powered by the LangGraph travel agent in 'plan' phase.
    Falls back to the rule-based city_itinerary_planner if Qwen LLM is unavailable.
    """
    state = run_agent_plan(request.model_dump())

    return TravelPlanResponse(
        thread_id=state["thread_id"],
        answer=state.get("answer", ""),
        selected_reasoning=state.get("selected_reasoning", ""),
        itinerary=_build_itinerary(state.get("itinerary")),
        map_route_days=_build_map_route_days(state.get("map_route_days", [])),
        poi_cards=_build_poi_cards(state.get("poi_cards", [])),
        source_status=_build_source_statuses(state.get("source_status", [])),
        uncertainty=_build_uncertainty(state.get("uncertainty")),
        follow_up_questions=_build_questions(state.get("follow_up_questions", [])),
        thinking_steps=state.get("thinking_steps", []),
    )
