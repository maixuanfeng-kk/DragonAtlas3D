"""DragonAtlas3D LangGraph Agent — node implementations.

Six nodes as defined in the Wuhan travel-agent design spec:
  intent_router → clarification → poi_selection → itinerary_draft → explanation → response_formatter

Each node receives the full AgentState, returns a partial state dict to merge.
"""

import json
import logging
from datetime import UTC, datetime

import httpx

from app.agent.state import AgentState
from app.config import get_settings
from app.services.amap_route_service import build_failed_leg, fetch_primary_leg
from app.services.map_projection import build_visit_order_polylines
from app.services.poi_registry import collect_poi_cards_for_selection, read_seed_nodes
from app.services.source_registry import build_default_source_statuses, build_source_status

logger = logging.getLogger(__name__)

MAX_LOOP = 3  # safety valve — prevent infinite clarification / draft cycles


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def _time_now() -> str:
    return datetime.now(UTC).isoformat()


def _llm_client():
    """Return a QwenClient if configured, else None."""
    settings = get_settings()
    if not settings.qwen_api_key or not settings.qwen_base_url:
        return None
    from app.services.llm.qwen_client import QwenClient

    return QwenClient(
        api_key=settings.qwen_api_key,
        base_url=settings.qwen_base_url,
        model=settings.qwen_model,
        timeout_seconds=settings.qwen_timeout_seconds,
    )


def _add_source_status(state: dict, source_id: str, label: str, status: str, note: str, error: str = "") -> None:
    state.setdefault("source_status", [])
    state["source_status"].append(
        build_source_status(
            source_id=source_id,
            source_label=label,
            status=status,
            coverage_note=note,
            provenance="langgraph-agent-node",
            error=error,
        )
    )


# ─────────────────────────────────────────────────────────────────
# Node 1 — Intent Router
# ─────────────────────────────────────────────────────────────────

def intent_router(state: AgentState) -> dict:
    """Determine whether to enter the clarify or plan flow.

    If phase == "clarify" → clarification node next.
    If phase == "plan"    → poi_selection node next (skip clarification).
    """
    phase = state.get("phase", "clarify")
    if phase == "plan":
        return {"next_step": "poi_selection"}
    return {"next_step": "clarification"}


# ─────────────────────────────────────────────────────────────────
# Node 2 — Clarification
# ─────────────────────────────────────────────────────────────────

CLARIFY_SYSTEM = """You are a travel agent for DragonAtlas3D, specializing in Wuhan city trips.

The user has selected some places on the map. Your job is to ask 1-3 clarifying questions
to better understand their travel needs before building an itinerary.

Rules:
- Ask concise, actionable questions in Chinese.
- Each question must have 2-4 concrete options.
- Cover: trip rhythm, missing interest categories, group type, budget level.
- Return ONLY valid JSON with this exact shape:
{"questions": [{"id": "...", "label": "...", "options": ["...", "..."]}]}
"""


def _build_clarify_messages(state: AgentState) -> list[dict]:
    nodes_desc = ", ".join(
        f"{n.get('name','')}({n.get('id','')})" for n in state.get("selected_nodes", [])
    )
    return [
        {
            "role": "user",
            "content": (
                f"The user is planning a {state.get('trip_days', 1)}-day trip in {state.get('current_city', 'wuhan')}.\n"
                f"Interest tags: {', '.join(state.get('interest_tags', []))}.\n"
                f"Preference: {state.get('day_or_night_preference', 'balanced')}.\n"
                f"Selected nodes: {nodes_desc or 'none yet'}.\n"
                f"Generate clarifying questions."
            ),
        }
    ]


def _rule_clarify_questions(state: AgentState) -> list[dict]:
    """Fallback rule-based questions when LLM is unavailable."""
    return [
        {
            "id": "trip_days_confirm",
            "label": "您计划在武汉玩几天？",
            "options": ["1", "2", "3"],
        },
        {
            "id": "time_bias",
            "label": "您更喜欢白天还是夜晚的活动节奏？",
            "options": ["day", "night", "balanced"],
        },
        {
            "id": "interest_detail",
            "label": "最感兴趣的方向是？",
            "options": ["景点观光", "美食探店", "街区漫步", "博物馆文化"],
        },
    ]


def clarification(state: AgentState) -> dict:
    """Generate dynamic follow-up questions from the selected nodes and preferences."""
    llm = _llm_client()
    status = "ready"

    if llm:
        try:
            messages = [
                {"role": "system", "content": CLARIFY_SYSTEM},
                *_build_clarify_messages(state),
            ]
            raw = llm.chat(messages, tool_choice="none")
            content = raw.get("content", "")
            parsed = json.loads(content)
            questions = parsed.get("questions", [])
            if questions:
                _add_source_status(state, "travel-clarifier", "Travel Clarifier (Qwen)", "ready",
                                   "Dynamic clarification generated by Qwen.", "")
                return {
                    "follow_up_questions": questions,
                    "source_status": state.get("source_status", []),
                }
        except Exception as exc:
            logger.warning("LLM clarification failed, falling back to rules: %s", exc)
            status = "partial"

    # Fallback to rule-based
    questions = _rule_clarify_questions(state)
    _add_source_status(state, "travel-clarifier", "Travel Clarifier (Rule)", status,
                       "Clarification generated from built-in rules.", "" if status == "ready" else "LLM unavailable")
    return {
        "follow_up_questions": questions,
        "source_status": state.get("source_status", []),
    }


# ─────────────────────────────────────────────────────────────────
# Node 3 — POI Selection
# ─────────────────────────────────────────────────────────────────

def _amap_enrich_poi(keyword: str) -> list[dict]:
    """Quick Amap text search to enrich a seed node."""
    settings = get_settings()
    if not settings.amap_web_key:
        return []
    try:
        resp = httpx.get(
            f"{settings.amap_web_base_url}/v5/place/text",
            params={"key": settings.amap_web_key, "keywords": keyword, "region": "420100", "page_size": 3},
            timeout=10,
        )
        pois = resp.json().get("pois") or []
        return [
            {"id": p.get("id", ""), "name": p.get("name", ""), "center": [float(c) for c in p.get("location", "0,0").split(",")]}
            for p in pois
        ]
    except Exception:
        return []


def poi_selection(state: AgentState) -> dict:
    """Select and rank POIs based on user-selected nodes and preferences.

    Reuses the existing poi_registry.collect_poi_cards_for_selection().
    Enriches with Amap search when seed data is thin.
    """
    from app.models.schemas import SelectedNode

    selected = state.get("selected_nodes", [])
    if not selected:
        return {"poi_cards": [], "error": "No selected nodes to build POI cards from."}

    # Convert to SelectedNode model instances
    nodes = [
        SelectedNode(
            id=n.get("id", ""),
            name=n.get("name", ""),
            node_type=n.get("node_type", "poi"),
            center=n.get("center"),
        )
        for n in selected
    ]

    try:
        cards = collect_poi_cards_for_selection(nodes)
        poi_rows = [card.model_dump() for card in cards]
    except Exception:
        # Fallback — build cards directly from seed registry
        seed_by_id = {r["id"]: r for r in read_seed_nodes()}
        poi_rows = []
        for n in selected:
            seed = seed_by_id.get(n.get("id", ""))
            if seed:
                poi_rows.append({**seed, "confidence": 1.0, "status": "seed"})
            else:
                poi_rows.append({
                    "id": n.get("id", ""),
                    "name": n.get("name", ""),
                    "node_type": n.get("node_type", "poi"),
                    "category": "unknown",
                    "center": n.get("center"),
                    "coordinate_status": "selected_input",
                    "tags": [],
                    "reason_summary": f"User-selected: {n.get('name', '')}",
                })

    # Sort by preference
    pref = state.get("day_or_night_preference", "balanced")
    night_cats = {"business_area", "street", "nightlife"}
    day_cats = {"sightseeing", "landmark", "lake", "museum"}

    if pref == "night":
        poi_rows.sort(key=lambda r: 0 if r.get("category") in night_cats else 1)
    elif pref == "day":
        poi_rows.sort(key=lambda r: 0 if r.get("category") in day_cats else 1)

    _add_source_status(state, "poi-selector", "POI Selector", "ready",
                       f"Selected {len(poi_rows)} POI card(s) for itinerary.", "")

    return {
        "poi_cards": poi_rows,
        "source_status": state.get("source_status", []),
    }


# ─────────────────────────────────────────────────────────────────
# Node 4 — Itinerary Draft
# ─────────────────────────────────────────────────────────────────

ITINERARY_SYSTEM = """You are a travel itinerary planner for Wuhan city trips.

Given a list of selected places with coordinates, build a multi-day itinerary.

Rules:
- Distribute stops evenly across the requested number of days.
- Group nearby locations into the same day.
- Respect the user's day/night preference (e.g. nightlife areas go later in the day,
  sightseeing earlier).
- Each stop needs: arrival_time, departure_time, dwell_minutes (sightseeing=90, food=60, landmark=90, lake=120, business=75, street=75).
- Start each day around 09:30.

Return ONLY valid JSON:
{
  "title": "...",
  "days": [
    {
      "day": 1,
      "title": "Day 1 theme",
      "summary": "What this day covers",
      "stops": [
        {"stop_id": "...", "name": "...", "place_type": "...", "center": [lng, lat],
         "arrival_time": "HH:MM", "departure_time": "HH:MM", "dwell_minutes": N, "reason": "..."}
      ]
    }
  ]
}
"""


def _build_itinerary_messages(state: AgentState) -> list[dict]:
    poi_summary = json.dumps(state.get("poi_cards", []), ensure_ascii=False)
    return [{
        "role": "user",
        "content": (
            f"Plan a {state.get('trip_days', 1)}-day Wuhan trip.\n"
            f"Preference: {state.get('day_or_night_preference', 'balanced')}.\n"
            f"POI cards:\n{poi_summary}"
        ),
    }]


def _rule_itinerary(state: AgentState) -> dict:
    """Fallback rule-based itinerary using the existing planner."""
    from app.services.city_itinerary_planner import build_city_day_plan

    poi_rows = state.get("poi_cards", [])
    if not poi_rows:
        return {"title": "Wuhan city itinerary", "days": []}

    # Build legs via Amap
    from app.models.schemas import ItineraryLeg
    leg_lookup: dict[tuple[str, str], ItineraryLeg] = {}
    settings = get_settings()

    import httpx as _httpx
    with _httpx.Client() as client:
        for start, end in zip(poi_rows, poi_rows[1:]):
            sid, eid = start["id"], end["id"]
            if not start.get("center") or not end.get("center"):
                leg_lookup[(sid, eid)] = build_failed_leg(
                    from_stop_id=sid, to_stop_id=eid, mode="walking", mode_label="Walking", reason="MISSING_CENTER"
                )
            else:
                leg_lookup[(sid, eid)] = fetch_primary_leg(
                    client=client, settings=settings,
                    origin=start["center"], destination=end["center"],
                    from_stop_id=sid, to_stop_id=eid, mode="walking", mode_label="Walking",
                )

    itinerary = build_city_day_plan(
        context=state,
        poi_rows=poi_rows,
        leg_lookup=leg_lookup,
    )
    return itinerary.model_dump()


def itinerary_draft(state: AgentState) -> dict:
    """Generate a multi-day itinerary from selected POIs."""
    llm = _llm_client()
    loop_count = state.get("loop_count", 0)

    if loop_count >= MAX_LOOP:
        _add_source_status(state, "itinerary-drafter", "Itinerary Drafter", "partial",
                           "Max loop reached — using rule-based fallback.", "")
        rule_result = _rule_itinerary(state)
        return {
            "itinerary": rule_result,
            "loop_count": loop_count + 1,
            "source_status": state.get("source_status", []),
        }

    if llm:
        try:
            messages = [
                {"role": "system", "content": ITINERARY_SYSTEM},
                *_build_itinerary_messages(state),
            ]
            raw = llm.chat(messages, tool_choice="none")
            content = raw.get("content", "")
            itinerary = json.loads(content)
            if itinerary.get("days"):
                _add_source_status(state, "itinerary-drafter", "Itinerary Drafter (Qwen)", "ready",
                                   "Multi-day itinerary generated by Qwen.", "")
                return {
                    "itinerary": itinerary,
                    "loop_count": loop_count + 1,
                    "source_status": state.get("source_status", []),
                }
        except Exception as exc:
            logger.warning("LLM itinerary failed, falling back to rules: %s", exc)

    # Rule-based fallback
    _add_source_status(state, "itinerary-drafter", "Itinerary Drafter (Rule)", "partial",
                       "Itinerary generated by rule engine (Day 1 only typically).", "LLM unavailable")
    rule_result = _rule_itinerary(state)
    return {
        "itinerary": rule_result,
        "loop_count": loop_count + 1,
        "source_status": state.get("source_status", []),
    }


# ─────────────────────────────────────────────────────────────────
# Node 5 — Explanation
# ─────────────────────────────────────────────────────────────────

EXPLANATION_SYSTEM = """You are a travel agent explaining a Wuhan itinerary to the user.

Given the itinerary and user preferences, produce:
1. A concise, warm answer paragraph in Chinese explaining the trip plan.
2. A reasoning paragraph explaining WHY the stops are organized this way.

Return ONLY valid JSON:
{"answer": "...", "reasoning": "..."}
"""


def _build_explanation_messages(state: AgentState) -> list[dict]:
    return [{
        "role": "user",
        "content": json.dumps({
            "itinerary": state.get("itinerary", {}),
            "preference": state.get("day_or_night_preference", "balanced"),
            "interest_tags": state.get("interest_tags", []),
            "trip_days": state.get("trip_days", 1),
        }, ensure_ascii=False),
    }]


def explanation(state: AgentState) -> dict:
    """Generate human-readable reasoning and answer for the itinerary."""
    itinerary = state.get("itinerary") or {}
    node_names = [n.get("name", "") for n in state.get("selected_nodes", [])]
    pref = state.get("day_or_night_preference", "balanced")

    llm = _llm_client()
    if llm:
        try:
            messages = [
                {"role": "system", "content": EXPLANATION_SYSTEM},
                *_build_explanation_messages(state),
            ]
            raw = llm.chat(messages, tool_choice="none")
            result = json.loads(raw.get("content", "{}"))
            answer = result.get("answer", "")
            reasoning = result.get("reasoning", "")
            if answer:
                _add_source_status(state, "explainer", "Travel Explainer (Qwen)", "ready",
                                   "Explanation generated by Qwen.", "")
                return {
                    "answer": answer,
                    "selected_reasoning": reasoning,
                    "source_status": state.get("source_status", []),
                }
        except Exception as exc:
            logger.warning("LLM explanation failed, falling back to rules: %s", exc)

    # Rule-based fallback
    tag_text = ", ".join(state.get("interest_tags", []))
    rhythm = {"day": "白天为主的游览", "night": "夜晚为主的体验", "balanced": "日夜均衡的节奏"}.get(pref, "均衡的节奏")
    answer = (
        f"为您规划了 {state.get('trip_days', 1)} 天武汉行程，以{', '.join(node_names)}为核心，"
        f"围绕{tag_text or '综合体验'}展开。整体节奏为{rhythm}，同一天的点位尽量就近安排，减少不必要的奔波。"
    )
    reasoning = f"行程基于{len(state.get('selected_nodes', []))}个地图选点，按照您选择的偏好标签和{rhythm}生成。"

    _add_source_status(state, "explainer", "Travel Explainer (Rule)", "ready",
                       "Explanation generated from templates.", "LLM unavailable")
    return {
        "answer": answer,
        "selected_reasoning": reasoning,
        "source_status": state.get("source_status", []),
    }


# ─────────────────────────────────────────────────────────────────
# Node 6 — Response Formatter
# ─────────────────────────────────────────────────────────────────

def response_formatter(state: AgentState) -> dict:
    """Finalize the agent state for API response serialization.

    This node does NOT call any LLM — it builds map_route_days from the itinerary
    and assembles source_status / uncertainty in the shape expected by the API schema.
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
            "message": f"{failed_legs} route leg(s) without real Amap data." if failed_legs
            else "All route legs use real Amap responses.",
            "items": [],
        }

    return {
        "map_route_days": map_route_days,
        "source_status": source_status,
        "uncertainty": uncertainty,
    }
