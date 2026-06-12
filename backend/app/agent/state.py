"""DragonAtlas3D LangGraph Agent — shared state definition."""

from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """Shared state that flows through every node in the travel-agent graph.

    Fields are divided into three groups:
    1. Request input — filled from the API request, never mutated by nodes.
    2. Agent runtime — updated by nodes as the graph executes.
    3. Output — consumed by response_formatter to build the HTTP response.
    """

    # ── Request input ────────────────────────────────────────────
    thread_id: str
    current_city: str                # "wuhan"
    selected_nodes: list[dict]       # [{id, name, node_type, center}]
    trip_days: int
    day_or_night_preference: str     # "day" | "night" | "balanced"
    interest_tags: list[str]         # e.g. ["sightseeing", "food"]
    answers: dict[str, str]          # 追问回答  {question_id: answer}

    # ── Agent runtime ────────────────────────────────────────────
    messages: Annotated[list[dict], add_messages]  # LLM 对话历史（LangGraph reducer）
    phase: str                       # "clarify" | "plan" — 路由依据
    next_step: str                   # 供条件边使用
    loop_count: int                  # 防止死循环的计数器

    # ── Intermediate results ─────────────────────────────────────
    follow_up_questions: list[dict]  # [{id, label, options}]
    poi_cards: list[dict]            # 精选 POI 卡片
    itinerary: dict | None           # {title, days: [...]}
    map_route_days: list[dict]       # [{day, route_type, coordinates}]

    # ── Output ───────────────────────────────────────────────────
    answer: str                      # 面向用户的推荐说明
    selected_reasoning: str          # 为什么如此组织路线
    source_status: list[dict]        # 数据源状态
    uncertainty: dict | None         # {level, message, items}
    error: str


def initial_state() -> AgentState:
    """Return a clean state with sensible defaults.

    Used by runner.py to merge with request payload before invoking the graph.
    """
    return {
        "thread_id": "",
        "current_city": "wuhan",
        "selected_nodes": [],
        "trip_days": 1,
        "day_or_night_preference": "balanced",
        "interest_tags": [],
        "answers": {},
        "messages": [],
        "phase": "clarify",
        "next_step": "",
        "loop_count": 0,
        "follow_up_questions": [],
        "poi_cards": [],
        "itinerary": None,
        "map_route_days": [],
        "answer": "",
        "selected_reasoning": "",
        "source_status": [],
        "uncertainty": None,
        "error": "",
    }
