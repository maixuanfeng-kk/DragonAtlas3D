"""Node 4 — Itinerary Draft (Agent Loop).

The core travel-planning node.  Uses an Agent loop where the LLM decides
which tools to call (Amap search, route calculation, seed lookup) before
producing the final itinerary JSON.

When the LLM or tools are unavailable, falls back through three layers:
  1. Reuse partial results from the Agent loop.
  2. Direct Amap API calls (no LLM).
  3. Static seed-node data from wuhan_seed_nodes.json.

Every degradation is recorded in source_status for frontend transparency.
"""

import json
import logging
from datetime import UTC, datetime

import httpx

from app.agent.state import AgentState
from app.config import get_settings
from app.services.amap_route_service import build_failed_leg, fetch_primary_leg
from app.services.source_registry import build_source_status

logger = logging.getLogger("agent.itinerary_draft")

MAX_AGENT_STEPS = 8
TOOL_EXECUTORS: dict[str, callable] = {}  # populated at module level

# ── System prompt ──────────────────────────────────────────────────

ITINERARY_SYSTEM = """\
You are a Wuhan travel itinerary planner with access to real-time tools.

## Available tools
- **search_amap_place(keyword, city)**: Search Amap for real places.
  Use this BEFORE naming any location.  Search at least twice with different
  keywords to cover different areas (e.g. "武昌景点", "汉口美食").
- **get_route(origin, destination, mode)**: Get travel time and distance
  between two coordinates.  origin/destination are [lng, lat] lists.
- **lookup_seed_pois(city, node_ids)**: Query the local Wuhan POI database
  for curated, high-quality place data.

## Workflow
1. Search for places matching the user's interest tags and day/night preference.
2. For adjacent stops within the same day, query routes to ensure reasonable
   travel times.
3. Only after you have real data from the tools, output the final itinerary.

## Output format (only when you have sufficient data)
Return a single JSON object:
{
  "title": "trip title",
  "days": [
    {
      "day": 1,
      "title": "Day theme",
      "summary": "What this day covers",
      "stops": [
        {
          "stop_id": "...", "name": "...", "place_type": "...",
          "center": [lng, lat],
          "arrival_time": "HH:MM", "departure_time": "HH:MM",
          "dwell_minutes": 90, "reason": "why this stop fits"
        }
      ]
    }
  ]
}

## Rules
- Never invent place names.  Every stop must come from a tool result.
- Group nearby locations into the same day.
- Respect day/night preference (nightlife areas → evening, sightseeing → morning).
- Default dwell times: sightseeing=90min, food=60min, landmark=90min, lake=120min,
  business=75min, street=75min.
- Start each day around 09:30.
- If a tool returns empty, tell the user that data is unavailable rather than guessing.
"""


# ── Tool definitions (OpenAI function-calling format) ─────────────

AGENT_TOOL_DEFS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_amap_place",
            "description": (
                "搜索高德地图上的真实POI数据。"
                "在规划行程、推荐地点之前必须调用此工具，不能凭空编造地名。"
                "返回地点名称、地址、类别和坐标。"
                "空结果表示该区域暂无数据——请如实告知用户。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "搜索关键词，如'黄鹤楼'、'武汉景点'、'汉口美食'",
                    },
                    "city": {
                        "type": "string",
                        "description": "城市名称或adcode，默认'武汉'(420100)",
                    },
                },
                "required": ["keyword"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_route",
            "description": (
                "获取两点之间的真实路线、距离和耗时。"
                "在将多个地点放入同一天之前，必须先查询它们之间的路线，"
                "确保行程合理。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "起点坐标 [longitude, latitude]",
                    },
                    "destination": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "终点坐标 [longitude, latitude]",
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["walking", "driving", "transit"],
                        "description": "出行方式，默认walking",
                    },
                },
                "required": ["origin", "destination"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_seed_pois",
            "description": (
                "查询本地武汉POI种子数据库，获取精选、高质量的地点数据。"
                "当需要了解武汉有哪些推荐景点时使用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名，目前仅支持'wuhan'",
                    },
                    "node_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "可选的地点ID列表，不传则返回全部",
                    },
                },
                "required": [],
            },
        },
    },
]


# ── Tool executors ─────────────────────────────────────────────────

def _execute_search_amap(keyword: str, city: str = "武汉") -> str:
    """Execute Amap text search, return JSON string."""
    settings = get_settings()
    if not settings.amap_web_key:
        return json.dumps({"status": "failed", "reason": "AMAP_KEY_MISSING", "pois": []}, ensure_ascii=False)

    adcode = "420100" if city in ("武汉", "wuhan") else city
    try:
        resp = httpx.get(
            f"{settings.amap_web_base_url}/v5/place/text",
            params={"key": settings.amap_web_key, "keywords": keyword, "region": adcode, "page_size": 8},
            timeout=10,
        )
        resp.raise_for_status()
        pois = resp.json().get("pois") or []
        results = [
            {
                "id": p.get("id", ""),
                "name": p.get("name", ""),
                "address": p.get("address", ""),
                "category": p.get("typecode", ""),
                "center": [float(c) for c in p.get("location", "0,0").split(",")],
            }
            for p in pois[:8]
        ]
        return json.dumps({"status": "ready", "count": len(results), "pois": results}, ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"status": "failed", "reason": str(exc), "pois": []}, ensure_ascii=False)


def _execute_get_route(origin: list[float], destination: list[float], mode: str = "walking") -> str:
    """Execute Amap route query, return JSON string."""
    settings = get_settings()
    if not settings.amap_web_key:
        return json.dumps({"status": "failed", "reason": "AMAP_KEY_MISSING"}, ensure_ascii=False)

    endpoints = {
        "walking": "/v5/direction/walking",
        "driving": "/v5/direction/driving",
        "transit": "/v5/direction/transit/integrated",
    }
    try:
        resp = httpx.get(
            f"{settings.amap_web_base_url}{endpoints.get(mode, endpoints['walking'])}",
            params={
                "key": settings.amap_web_key,
                "origin": f"{origin[0]},{origin[1]}",
                "destination": f"{destination[0]},{destination[1]}",
            },
            timeout=15,
        )
        payload = resp.json()
        paths = (payload.get("route") or {}).get("paths") or []
        if resp.status_code != 200 or not paths:
            return json.dumps({"status": "failed", "reason": "EMPTY_ROUTE"}, ensure_ascii=False)

        path = paths[0]
        return json.dumps({
            "status": "ready",
            "duration_minutes": max(1, round(int(path.get("duration", 0)) / 60)),
            "distance_meters": int(path.get("distance", 0)),
        }, ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"status": "failed", "reason": str(exc)}, ensure_ascii=False)


def _execute_lookup_seed(city: str = "wuhan", node_ids: list[str] | None = None) -> str:
    """Query local seed POI registry."""
    from pathlib import Path

    SEED_PATH = Path(__file__).resolve().parents[3] / "data" / "wuhan_seed_nodes.json"
    if city.lower() != "wuhan":
        return json.dumps({"status": "failed", "reason": "UNSUPPORTED_CITY", "pois": []}, ensure_ascii=False)
    try:
        rows: list[dict] = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except Exception:
        return json.dumps({"status": "failed", "reason": "SEED_FILE_MISSING", "pois": []}, ensure_ascii=False)

    if node_ids:
        id_set = set(node_ids)
        rows = [r for r in rows if r.get("id") in id_set]

    results = [
        {"id": r.get("id"), "name": r.get("name"), "category": r.get("category"),
         "center": r.get("center"), "tags": r.get("tags", []),
         "reason_summary": r.get("reason_summary", "")}
        for r in rows[:10]
    ]
    return json.dumps({"status": "ready", "count": len(results), "pois": results}, ensure_ascii=False)


TOOL_EXECUTORS = {
    "search_amap_place": _execute_search_amap,
    "get_route": _execute_get_route,
    "lookup_seed_pois": _execute_lookup_seed,
}


# ── Helpers ────────────────────────────────────────────────────────

def _time_now() -> str:
    return datetime.now(UTC).isoformat()


def _add_source_status(state: dict, source_id: str, label: str, status: str, note: str, error: str = "") -> None:
    state.setdefault("source_status", [])
    state["source_status"].append(
        build_source_status(
            source_id=source_id, source_label=label, status=status,
            coverage_note=note, provenance="langgraph-agent-node", error=error,
        )
    )


def _llm_client():
    settings = get_settings()
    if not settings.qwen_api_key or not settings.qwen_base_url:
        return None
    from app.services.llm.qwen_client import QwenClient

    return QwenClient(
        api_key=settings.qwen_api_key, base_url=settings.qwen_base_url,
        model=settings.qwen_model, timeout_seconds=settings.qwen_timeout_seconds,
    )


def _build_context_message(state: AgentState) -> dict:
    """Build the initial user message with trip parameters."""
    poi_summary = json.dumps(state.get("poi_cards", []), ensure_ascii=False)
    return {
        "role": "user",
        "content": (
            f"Plan a {state.get('trip_days', 1)}-day trip in {state.get('current_city', 'wuhan')}.\n"
            f"Preference: {state.get('day_or_night_preference', 'balanced')}.\n"
            f"Interest tags: {', '.join(state.get('interest_tags', []))}.\n"
            f"Pre-selected POI cards:\n{poi_summary}"
        ),
    }


def _parse_itinerary(content: str) -> dict | None:
    """Try to parse the LLM's final answer as itinerary JSON."""
    if not content:
        return None

    attempts: list[str] = []

    # 1. Direct JSON parse
    try:
        result = json.loads(content)
        if result.get("days"):
            return result
    except json.JSONDecodeError:
        attempts.append("direct")

    # 2. Extract from markdown code block
    for marker in ("```json", "```"):
        if marker in content:
            block = content.split(marker, 1)[1].split("```", 1)[0]
            try:
                result = json.loads(block.strip())
                if result.get("days"):
                    return result
            except json.JSONDecodeError:
                attempts.append(f"md:{marker}")

    # 3. Find first { and last } and try that substring
    start = content.find("{")
    end = content.rfind("}")
    if start >= 0 and end > start:
        try:
            result = json.loads(content[start:end + 1])
            if result.get("days"):
                return result
        except json.JSONDecodeError:
            attempts.append("braces")

    logger.debug("_parse_itinerary failed: attempts=%s, content[:200]=%s", attempts, content[:200])
    return None


# ── Agent loop ─────────────────────────────────────────────────────

def _run_agent_loop(state: AgentState) -> tuple[dict | None, list[dict], int, list[dict]]:
    """Run the tool-calling Agent loop.

    Returns:
        (itinerary_dict or None, collected_source_statuses, steps_taken, thinking_steps)
    """
    llm = _llm_client()
    if not llm:
        logger.warning("Qwen not configured -- using rule engine.")
        return None, [], 0, [{"step": 0, "action": "fallback", "detail": "Qwen not configured, using rule engine"}]

    thinking_steps: list[dict] = []

    trip_days = state.get("trip_days", 1)
    city = state.get("current_city", "wuhan")
    logger.info("Agent loop started: %d day(s), city=%s, preference=%s",
                trip_days, city, state.get("day_or_night_preference", "balanced"))

    messages: list[dict] = [
        {"role": "system", "content": ITINERARY_SYSTEM},
        _build_context_message(state),
    ]
    loop_statuses: list[dict] = []

    for step in range(1, MAX_AGENT_STEPS + 1):
        logger.info("[Agent step %d/%d] calling LLM...", step, MAX_AGENT_STEPS)
        thinking_steps.append({"step": step, "action": "llm_call", "detail": f"Calling Qwen..."})
        try:
            msg = llm.chat(messages, tools=AGENT_TOOL_DEFS)
        except Exception as exc:
            logger.warning("[Agent step %d] LLM call failed: %s", step, exc)
            thinking_steps.append({"step": step, "action": "llm_error", "detail": str(exc)})
            loop_statuses.append(build_source_status(
                source_id="itinerary-agent", source_label="Itinerary Agent (Qwen)",
                status="failed", coverage_note=f"LLM call failed at step {step}.",
                provenance="agent-loop", error=str(exc),
            ))
            return None, loop_statuses, step, thinking_steps

        # LLM returned content → try to parse as final itinerary
        content = msg.get("content")
        if content:
            logger.info("[Agent step %d] LLM returned text (len=%d), parsing itinerary...", step, len(content))
            itinerary = _parse_itinerary(content)
            if itinerary:
                days_count = len(itinerary.get("days", []))
                logger.info("[Agent step %d] PARSED itinerary, %d day(s)", step, days_count)
                thinking_steps.append({"step": step, "action": "done", "detail": f"Generated {days_count}-day itinerary"})
                loop_statuses.append(build_source_status(
                    source_id="itinerary-agent", source_label="Itinerary Agent (Qwen)",
                    status="ready", coverage_note=f"Agent completed itinerary in {step} step(s).",
                    provenance="agent-loop",
                ))
                return itinerary, loop_statuses, step, thinking_steps
            # Parse failed — log and push a retry hint
            logger.warning("[Agent step %d] unparseable content, asking LLM to retry. First 200 chars: %s",
                           step, content[:200])

        # LLM wants to call tools
        tool_calls = msg.get("tool_calls") or []
        if not tool_calls and not content:
            # Truly empty — dead end
            logger.warning("[Agent step %d] empty response (no content, no tool_calls), stopping loop", step)
            break

        # Append assistant message to history
        messages.append(msg)

        # If content was returned but couldn't parse, ask LLM to retry with correct format
        if content and not tool_calls and not itinerary:
            messages.append({
                "role": "user",
                "content": (
                    "你上一条回复的格式不正确。请严格按照系统提示中的 JSON 格式输出行程，"
                    '包含 "title" 和 "days" 字段。不要添加额外说明文字，只输出 JSON。'
                ),
            })
            continue

        # Append assistant message to history, then execute tools
        for tc in tool_calls:
            fn_name = tc["function"]["name"]
            fn_args = json.loads(tc["function"].get("arguments", "{}"))
            args_summary = ", ".join(f"{k}={v}" for k, v in fn_args.items())
            logger.info("[Agent step %d] TOOL: %s(%s)", step, fn_name, args_summary)
            thinking_steps.append({"step": step, "action": "tool_call", "detail": f"{fn_name}({args_summary})"})
            executor = TOOL_EXECUTORS.get(fn_name)

            if executor:
                try:
                    result = executor(**fn_args)
                    try:
                        rj = json.loads(result)
                        t_status = rj.get("status", "?")
                        t_count = rj.get("count", "N/A")
                        logger.info("[Agent step %d] TOOL OK: status=%s, count=%s", step, t_status, t_count)
                        thinking_steps.append({"step": step, "action": "tool_result", "detail": f"{fn_name} -> {t_status}, {t_count} results"})
                    except Exception:
                        logger.info("[Agent step %d] TOOL OK (len=%d)", step, len(result))
                        thinking_steps.append({"step": step, "action": "tool_result", "detail": f"{fn_name} -> ok"})
                except Exception as exc:
                    logger.warning("[Agent step %d] TOOL FAIL: %s", step, exc)
                    result = json.dumps({"status": "failed", "reason": str(exc)}, ensure_ascii=False)
            else:
                logger.warning("[Agent step %d] UNKNOWN TOOL: %s", step, fn_name)
                result = json.dumps({"status": "failed", "reason": f"Unknown tool: {fn_name}"}, ensure_ascii=False)

            messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id", ""),
                "content": result,
            })

    # Exhausted steps without producing itinerary
    logger.warning("[Agent] exhausted %d steps without valid itinerary, falling back to rule engine", MAX_AGENT_STEPS)
    loop_statuses.append(build_source_status(
        source_id="itinerary-agent", source_label="Itinerary Agent (Qwen)",
        status="partial", coverage_note=f"Agent did not finish within {MAX_AGENT_STEPS} steps.",
        provenance="agent-loop",
    ))
    return None, loop_statuses, MAX_AGENT_STEPS


# ── Fallback: rule-based planner ───────────────────────────────────

def _search_amap_direct(keyword: str = "武汉景点") -> list[dict]:
    """Direct Amap search (no LLM). Layer 2 fallback."""
    settings = get_settings()
    if not settings.amap_web_key:
        return []
    try:
        resp = httpx.get(
            f"{settings.amap_web_base_url}/v5/place/text",
            params={"key": settings.amap_web_key, "keywords": keyword, "region": "420100", "page_size": 10},
            timeout=10,
        )
        pois = resp.json().get("pois") or []
        return [
            {"id": p.get("id"), "name": p.get("name"), "category": p.get("typecode"),
             "center": [float(c) for c in p.get("location", "0,0").split(",")],
             "address": p.get("address", "")}
            for p in pois
        ]
    except Exception:
        return []


def _load_seed_nodes() -> list[dict]:
    """Load static seed data. Layer 3 fallback."""
    from pathlib import Path
    seed_path = Path(__file__).resolve().parents[3] / "data" / "wuhan_seed_nodes.json"
    try:
        return json.loads(seed_path.read_text(encoding="utf-8"))
    except Exception:
        return []


def _build_fallback_legs(poi_rows: list[dict]) -> dict:
    """Build route legs for the fallback planner."""
    from app.models.schemas import ItineraryLeg

    settings = get_settings()
    leg_lookup: dict[tuple[str, str], ItineraryLeg] = {}

    with httpx.Client() as client:
        for start, end in zip(poi_rows, poi_rows[1:]):
            sid, eid = start["id"], end["id"]
            if not start.get("center") or not end.get("center"):
                leg_lookup[(sid, eid)] = build_failed_leg(
                    from_stop_id=sid, to_stop_id=eid, mode="walking",
                    mode_label="Walking", reason="MISSING_CENTER",
                )
            else:
                leg_lookup[(sid, eid)] = fetch_primary_leg(
                    client=client, settings=settings,
                    origin=start["center"], destination=end["center"],
                    from_stop_id=sid, to_stop_id=eid, mode="walking", mode_label="Walking",
                )
    return leg_lookup


def _rule_plan(state: AgentState, agent_statuses: list[dict] | None = None) -> dict:
    """Three-layer fallback itinerary planner (no LLM required).

    Layer 1: Reuse POI cards already selected by poi_selection node.
    Layer 2: Direct Amap text search for additional data.
    Layer 3: Static seed nodes from wuhan_seed_nodes.json.
    """
    from app.services.city_itinerary_planner import build_city_day_plan

    poi_rows = state.get("poi_cards", [])

    # Layer 2: enrich with direct Amap search if thin
    if len(poi_rows) < 3:
        amap_results = _search_amap_direct("武汉景点")
        existing_ids = {r.get("id") for r in poi_rows}
        for r in amap_results:
            if r["id"] not in existing_ids:
                poi_rows.append(r)
                existing_ids.add(r["id"])

    # Layer 3: static seed as last resort
    if not poi_rows:
        poi_rows = _load_seed_nodes()

    if not poi_rows:
        return {
            "itinerary": {"title": "数据不足，无法生成行程", "days": []},
            "source_status": agent_statuses or [],
            "agent_loop_completed": False,
            "fallback_level": 3,
        }

    legs = _build_fallback_legs(poi_rows)
    itinerary = build_city_day_plan(context=state, poi_rows=poi_rows, leg_lookup=legs)

    fallback_note = (
        "行程由规则引擎生成（未使用LLM）。"
        if not agent_statuses
        else f"Agent循环中断后由规则引擎接管。"
    )
    statuses = list(agent_statuses or [])
    statuses.append(build_source_status(
        source_id="itinerary-drafter", source_label="Itinerary Drafter (Rule Engine)",
        status="partial", coverage_note=fallback_note, provenance="rule-fallback",
    ))

    return {
        "itinerary": itinerary.model_dump(),
        "source_status": statuses,
        "agent_loop_completed": False,
        "fallback_level": 3 if not agent_statuses else 1,
    }


# ── Main node ──────────────────────────────────────────────────────

def itinerary_draft(state: AgentState) -> dict:
    """Generate a multi-day itinerary using Agent loop + tools.

    Flow:
        1. Try Agent loop (LLM + Amap tools).     → best quality
        2. Fall back to rule engine on any failure.  → always works
    """
    from app.services.city_itinerary_planner import build_city_day_plan

    # ── Path A: Agent loop ─────────────────────────────────────────
    itinerary, agent_statuses, steps, thinking_steps = _run_agent_loop(state)

    if itinerary:
        _add_source_status(state, "itinerary-drafter", "Itinerary Drafter (Qwen Agent)",
                           "ready", f"Multi-day itinerary generated by Agent in {steps} step(s).", "")
        return {
            "itinerary": itinerary,
            "loop_count": state.get("loop_count", 0) + 1,
            "source_status": [*state.get("source_status", []), *agent_statuses],
            "agent_loop_completed": True,
            "fallback_level": 0,
            "thinking_steps": thinking_steps,
        }

    # ── Path B: Rule-based fallback ────────────────────────────────
    result = _rule_plan(state, agent_statuses)
    result["loop_count"] = state.get("loop_count", 0) + 1
    result["thinking_steps"] = thinking_steps
    return result
