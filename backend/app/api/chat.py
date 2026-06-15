"""DragonAtlas3D Agent Chat API.

Lightweight chat endpoint for the floating chat panel on the detail map page.
Does NOT invoke the full LangGraph agent graph — that is reserved for
/clarify and /plan. This endpoint calls Qwen directly with travel context.
"""

from fastapi import APIRouter

from app.config import get_settings
from app.models.schemas import SourceStatus
from app.services.source_registry import build_source_status

router = APIRouter(prefix="/agent", tags=["agent-chat"])

CHAT_SYSTEM_PROMPT = """You are DragonAtlas3D, a China travel agent specializing in Wuhan city trips.

You are embedded in a map application. The user is looking at an Amap detail map
of {current_city}. They may have selected places and generated itineraries.

Your role:
- Answer travel questions about the current city (Wuhan).
- Recommend places, foods, and routes based on the user's current map context.
- Keep answers concise (2-4 sentences in Chinese) since this is a chat widget.
- If you don't know something, say so clearly — never fake data.

Current context:
- City: {current_city}
- Active places on map: {active_pois}
- Itinerary summary: {itinerary_summary}
"""


def _build_system_prompt(context: dict) -> str:
    current_city = context.get("current_city", "wuhan")
    active_pois = ", ".join(context.get("active_pois", [])) or "none selected yet"
    itinerary_summary = context.get("itinerary_summary", "no itinerary yet")
    return CHAT_SYSTEM_PROMPT.format(
        current_city=current_city,
        active_pois=active_pois,
        itinerary_summary=itinerary_summary,
    )


@router.post("/chat")
def agent_chat(payload: dict) -> dict:
    """Handle a single chat turn with the travel agent.

    Request body:
        thread_id: str
        message: str
        context: { current_city, active_pois, itinerary_summary }

    Returns:
        thread_id, reply, source_status
    """
    thread_id = payload.get("thread_id", "")
    message = payload.get("message", "")
    context = payload.get("context") or {}

    # Allow frontend to override Qwen config — prefer payload, fall back to .env
    qwen_api_key = payload.get("qwen_api_key") or get_settings().qwen_api_key
    qwen_base_url = payload.get("qwen_base_url") or get_settings().qwen_base_url
    qwen_model = payload.get("qwen_model") or get_settings().qwen_model
    from_frontend = bool(payload.get("qwen_api_key"))

    if not message.strip():
        return {
            "thread_id": thread_id,
            "reply": "请说点什么吧，我可以帮你解答武汉旅行的问题。",
            "source_status": [],
        }

    if not qwen_api_key or not qwen_base_url:
        source_status = [
            SourceStatus.model_validate(
                build_source_status(
                    source_id="agent-chat",
                    source_label="Agent Chat (Qwen)",
                    status="failed",
                    coverage_note="Chat requires Qwen LLM configuration.",
                    provenance="qwen",
                    error="Missing QWEN_API_KEY or QWEN_BASE_URL. 请在左下角 ⚙ 设置面板中填写，或在 backend/.env 中配置。",
                )
            )
        ]
        return {
            "thread_id": thread_id,
            "reply": "旅行助手未配置 LLM。请点击左下角 ⚙ 图标，填写 Qwen API Key 和 Base URL。",
            "source_status": [s.model_dump() for s in source_status],
        }

    try:
        from app.services.llm.qwen_client import QwenClient

        client = QwenClient(
            api_key=qwen_api_key,
            base_url=qwen_base_url,
            model=qwen_model,
            timeout_seconds=60,
        )

        system = _build_system_prompt(context)
        reply = client.chat_text(
            messages=[{"role": "user", "content": message}],
            system=system,
        )

        source_status = [
            SourceStatus.model_validate(
                build_source_status(
                    source_id="agent-chat",
                    source_label=f"Qwen ({qwen_model})",
                    status="ready",
                    coverage_note="Config from "
                    + ("frontend settings." if from_frontend else "backend .env."),
                    provenance=qwen_model,
                )
            )
        ]

        return {
            "thread_id": thread_id,
            "reply": reply.strip() or "抱歉，我暂时无法回答这个问题。",
            "source_status": [s.model_dump() for s in source_status],
        }

    except Exception as exc:
        source_status = [
            SourceStatus.model_validate(
                build_source_status(
                    source_id="agent-chat",
                    source_label="Agent Chat (Qwen)",
                    status="failed",
                    coverage_note="Chat request reached Qwen but did not complete successfully.",
                    provenance=qwen_model,
                    error=str(exc),
                )
            )
        ]
        return {
            "thread_id": thread_id,
            "reply": f"抱歉，聊天服务暂时不可用：{exc}",
            "source_status": [s.model_dump() for s in source_status],
        }
