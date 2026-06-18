"""DragonAtlas3D Agent Chat API."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.config import get_settings
from app.db import get_session
from app.models.schemas import SourceStatus
from app.rag.service import answer_chat_with_rag, build_fallback_reply, retrieve_chat_evidence
from app.services.source_registry import build_source_status

router = APIRouter(prefix="/agent", tags=["agent-chat"])


@router.post("/chat")
def agent_chat(payload: dict, session: Session = Depends(get_session)) -> dict:
    """Handle a single chat turn with knowledge-base-first retrieval."""
    thread_id = payload.get("thread_id", "")
    message = payload.get("message", "")
    context = payload.get("context") or {}
    settings = get_settings()

    qwen_api_key = payload.get("qwen_api_key") or settings.qwen_api_key
    qwen_base_url = payload.get("qwen_base_url") or settings.qwen_base_url
    qwen_model = payload.get("qwen_model") or settings.qwen_model
    from_frontend = bool(payload.get("qwen_api_key"))

    if not message.strip():
        return {
            "thread_id": thread_id,
            "reply": "请告诉我你想了解的武汉旅行问题。",
            "source_status": [],
        }

    evidence_rows, rag_statuses = retrieve_chat_evidence(
        session=session,
        message=message,
        context=context,
        settings=settings,
    )
    retrieval_statuses = [SourceStatus.model_validate(item) for item in rag_statuses]

    if not qwen_api_key or not qwen_base_url:
        source_status = [
            *retrieval_statuses,
            SourceStatus.model_validate(
                build_source_status(
                    source_id="agent-chat",
                    source_label="Agent Chat (Qwen)",
                    status="failed",
                    coverage_note="Chat generation requires Qwen LLM configuration.",
                    provenance="qwen",
                    error="Missing QWEN_API_KEY or QWEN_BASE_URL.",
                )
            ),
        ]
        return {
            "thread_id": thread_id,
            "reply": build_fallback_reply(evidence_rows),
            "source_status": [item.model_dump() for item in source_status],
        }

    try:
        from app.services.llm.qwen_client import QwenClient

        client = QwenClient(
            api_key=qwen_api_key,
            base_url=qwen_base_url,
            model=qwen_model,
            timeout_seconds=settings.qwen_timeout_seconds,
        )
        reply, rag_statuses = answer_chat_with_rag(
            session=session,
            payload=payload,
            llm_client=client,
            settings=settings,
        )
        source_status = [
            *[SourceStatus.model_validate(item) for item in rag_statuses],
            SourceStatus.model_validate(
                build_source_status(
                    source_id="agent-chat",
                    source_label=f"Qwen ({qwen_model})",
                    status="ready",
                    coverage_note="Config from frontend settings." if from_frontend else "Config from backend .env.",
                    provenance=qwen_model,
                )
            ),
        ]
        return {
            "thread_id": thread_id,
            "reply": reply.strip() or "抱歉，我暂时无法回答这个问题。",
            "source_status": [item.model_dump() for item in source_status],
        }
    except Exception as exc:
        source_status = [
            *retrieval_statuses,
            SourceStatus.model_validate(
                build_source_status(
                    source_id="agent-chat",
                    source_label="Agent Chat (Qwen)",
                    status="failed",
                    coverage_note="Chat request reached Qwen but did not complete successfully.",
                    provenance=qwen_model,
                    error=str(exc),
                )
            ),
        ]
        return {
            "thread_id": thread_id,
            "reply": f"抱歉，聊天服务暂时不可用：{exc}",
            "source_status": [item.model_dump() for item in source_status],
        }
