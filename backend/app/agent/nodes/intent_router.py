"""Node 1 — Intent Router.

Routes to clarification or poi_selection based on the `phase` field.
"""

from app.agent.state import AgentState


def intent_router(state: AgentState) -> dict:
    """Determine whether to enter the clarify or plan flow.

    If phase == "clarify" → clarification node next.
    If phase == "plan"    → poi_selection node next (skip clarification).
    """
    phase = state.get("phase", "clarify")
    if phase == "plan":
        return {"next_step": "poi_selection"}
    return {"next_step": "clarification"}
