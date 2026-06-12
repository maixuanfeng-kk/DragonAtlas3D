"""DragonAtlas3D LangGraph Agent — graph assembly and compilation.

The travel-agent graph:

    START → intent_router ─┬─→ clarification ──→ response_formatter → END
                            │
                            └─→ poi_selection → itinerary_draft → explanation ─┘

Conditional routing from intent_router uses the `next_step` field.
"""

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.agent.nodes import (
    clarification,
    explanation,
    intent_router,
    itinerary_draft,
    poi_selection,
    response_formatter,
)
from app.agent.state import AgentState


def _route_after_intent(state: AgentState) -> str:
    """Route to clarification or poi_selection based on next_step set by intent_router."""
    return state.get("next_step", "clarification")


def build_travel_agent_graph() -> StateGraph:
    """Build and return the compiled travel-agent StateGraph.

    Returns a compiled graph with MemorySaver for thread-level state persistence.
    """
    builder = StateGraph(AgentState)

    # ── Add nodes ──────────────────────────────────────────────
    builder.add_node("intent_router", intent_router)
    builder.add_node("clarification", clarification)
    builder.add_node("poi_selection", poi_selection)
    builder.add_node("itinerary_draft", itinerary_draft)
    builder.add_node("explanation", explanation)
    builder.add_node("response_formatter", response_formatter)

    # ── Add edges ──────────────────────────────────────────────
    builder.add_edge(START, "intent_router")

    builder.add_conditional_edges(
        "intent_router",
        _route_after_intent,
        {
            "clarification": "clarification",
            "poi_selection": "poi_selection",
        },
    )

    # Clarify flow: clarification → response_formatter → END
    builder.add_edge("clarification", "response_formatter")

    # Plan flow: poi_selection → itinerary_draft → explanation → response_formatter → END
    builder.add_edge("poi_selection", "itinerary_draft")
    builder.add_edge("itinerary_draft", "explanation")
    builder.add_edge("explanation", "response_formatter")

    builder.add_edge("response_formatter", END)

    # ── Compile with memory ────────────────────────────────────
    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


# Singleton compiled graph — lazy init to avoid import-time overhead.
_compiled_graph: StateGraph | None = None


def get_agent_graph() -> StateGraph:
    """Return the singleton compiled agent graph."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_travel_agent_graph()
    return _compiled_graph
