from fastapi import APIRouter

from app.models.schemas import (
    FollowUpQuestion,
    PoiCard,
    SourceStatus,
    TravelClarifyRequest,
    TravelClarifyResponse,
    TravelPlanRequest,
    TravelPlanResponse,
    Uncertainty,
)
from app.services.itinerary_builder import build_single_best_itinerary
from app.services.map_projection import build_visit_order_polylines
from app.services.poi_registry import collect_poi_cards_for_selection
from app.services.source_registry import build_default_source_statuses, build_source_status

router = APIRouter(prefix="/travel", tags=["travel"])


def default_follow_up_questions() -> list[FollowUpQuestion]:
    return [
        FollowUpQuestion(id="trip_days_confirm", label="这次想玩几天？", options=["3", "4", "5"]),
        FollowUpQuestion(id="time_bias", label="你更偏白天景点还是夜游逛吃？", options=["day", "night", "balanced"]),
    ]


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
        uncertainty=Uncertainty(level="ready", message="当前仅生成追问问题，尚未输出正式行程。", items=[]),
    )


@router.post("/plan", response_model=TravelPlanResponse)
def plan_trip(request: TravelPlanRequest) -> TravelPlanResponse:
    poi_cards = collect_poi_cards_for_selection(request.selected_nodes)
    itinerary = build_single_best_itinerary(request.model_dump(), [card.model_dump() for card in poi_cards])
    map_route_days = build_visit_order_polylines(itinerary.model_dump(), [card.model_dump() for card in poi_cards])
    source_status = [
        SourceStatus.model_validate(item)
        for item in [
            *build_default_source_statuses(),
            build_source_status(
                source_id="travel-planner",
                source_label="Travel Planner",
                status="ready",
                coverage_note="Single best itinerary generated from selected nodes and seed-backed map nodes",
                provenance="rule-and-llm-mix",
            ),
        ]
    ]
    answer = "这条路线先围绕你选中的武汉区域展开，白天优先景点与街区，晚上再收束到更适合逛吃和夜游的节点。"
    reasoning = "系统围绕已选区域的 seed 坐标节点组织访问顺序，并保留自动抽取 POI 的趋势说明。"
    return TravelPlanResponse(
        thread_id=request.thread_id,
        answer=answer,
        selected_reasoning=reasoning,
        itinerary=itinerary,
        map_route_days=map_route_days,
        poi_cards=poi_cards,
        source_status=source_status,
        uncertainty=Uncertainty(
            level="partial",
            message="部分 POI 由本地笔记自动抽取，只有 seed 节点带已验证坐标。",
            items=["趋势总结不代表官方营业信息", "未验证坐标节点不会进入地图线路"],
        ),
        follow_up_questions=[],
    )
