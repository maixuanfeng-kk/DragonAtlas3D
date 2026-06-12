"""DragonAtlas3D LangGraph Agent — execution wrapper.

Provides a clean `run_agent_clarify` / `run_agent_plan` API for the FastAPI routes.
"""

from app.agent.graph import get_agent_graph
from app.agent.state import AgentState, initial_state


def _invoke(state: AgentState) -> AgentState:
    """Invoke the compiled agent graph with the given state.

    Uses LangGraph's config mechanism to preserve thread-level memory
    across calls with the same thread_id.
    """
    graph = get_agent_graph()
    config = {"configurable": {"thread_id": state.get("thread_id", "default")}}
    result = graph.invoke(state, config)
    return result


def run_agent_clarify(request_payload: dict) -> AgentState:
    """Run the agent in 'clarify' mode.

    Args:
        request_payload: Dict matching TravelClarifyRequest fields.

    Returns:
        Full AgentState after graph execution. The API route maps
        the returned state to TravelClarifyResponse.
    """
    state = {**initial_state(), **request_payload, "phase": "clarify"}
    return _invoke(state)


def run_agent_plan(request_payload: dict) -> AgentState:
    """Run the agent in 'plan' mode.

    Args:
        request_payload: Dict matching TravelPlanRequest fields.

    Returns:
        Full AgentState after graph execution. The API route maps
        the returned state to TravelPlanResponse.
    """
    state = {**initial_state(), **request_payload, "phase": "plan"}
    return _invoke(state)
