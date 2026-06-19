import re

from sqlmodel import Session, select

from app.config import Settings, get_settings
from app.models.tables_rag import KbChunkRecord
from app.rag.ingest import build_ingest_status_snapshot, ingest_configured_knowledge_base
from app.rag.prompting import build_chat_prompt
from app.rag.retrieval import fuse_ranked_results
from app.services.llm.embedding_client import EmbeddingClient
from app.services.llm.rerank_client import RerankClient
from app.services.source_registry import build_source_status

TERM_PATTERN = re.compile(r"[A-Za-z0-9]+|[\u4e00-\u9fff]+")


def _extract_terms(text: str) -> list[str]:
    return [term.lower() for term in TERM_PATTERN.findall(text or "") if term.strip()]


def _build_embedding_client(settings: Settings) -> EmbeddingClient | None:
    if not (settings.embedding_base_url and settings.embedding_api_key and settings.embedding_model):
        return None
    return EmbeddingClient(
        api_key=settings.embedding_api_key,
        base_url=settings.embedding_base_url,
        model=settings.embedding_model,
        dimensions=settings.embedding_dimensions,
    )


def _build_rerank_client(settings: Settings) -> RerankClient | None:
    if not (settings.rerank_base_url and settings.rerank_api_key and settings.rerank_model):
        return None
    return RerankClient(
        api_key=settings.rerank_api_key,
        base_url=settings.rerank_base_url,
        model=settings.rerank_model,
    )


def _chunk_to_candidate(chunk: KbChunkRecord, score: float, mode: str) -> dict:
    return {
        "chunk_id": chunk.chunk_id,
        "document_id": chunk.document_id,
        "content": chunk.content,
        "city": chunk.city,
        "district": chunk.district,
        "topic_tags": list(chunk.topic_tags_json or []),
        "poi_ids": list(chunk.poi_ids_json or []),
        "metadata": dict(chunk.metadata_json or {}),
        "score": float(score),
        "retrieval_mode": mode,
    }


def _score_chunk(chunk: KbChunkRecord, message: str, active_pois: list[str]) -> float:
    haystack = (chunk.content or "").lower()
    score = 0.0

    for poi_name in active_pois:
        term = (poi_name or "").strip().lower()
        if term and term in haystack:
            score += 8.0

    lowered_message = (message or "").strip().lower()
    if lowered_message and lowered_message in haystack:
        score += 4.0

    for term in _extract_terms(message):
        if len(term) <= 1:
            continue
        if term in haystack:
            score += 1.0

    return score


def _fetch_lexical_candidates(session: Session, message: str, context: dict, settings: Settings) -> list[dict]:
    current_city = (context.get("current_city") or "").strip()
    query = select(KbChunkRecord)
    if current_city:
        query = query.where(KbChunkRecord.city == current_city)
    rows = session.exec(query).all()

    active_pois = context.get("active_pois", [])
    scored = []
    for chunk in rows:
        score = _score_chunk(chunk, message, active_pois)
        if score > 0:
            scored.append(_chunk_to_candidate(chunk, score, "lexical"))

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[: settings.rag_retrieval_candidates]


def _fetch_semantic_candidates(
    session: Session,
    message: str,
    context: dict,
    settings: Settings,
    embedding_client: EmbeddingClient | None,
    embedded_chunks: int,
) -> tuple[list[dict], str]:
    if not embedding_client:
        return [], ""

    if embedded_chunks <= 0:
        return [], ""

    dialect_name = session.get_bind().dialect.name
    if dialect_name != "postgresql":
        return [], ""

    vectors = embedding_client.embed_texts([message])
    if not vectors:
        return [], "Embedding provider returned no query vector."

    query_vector = vectors[0]
    current_city = (context.get("current_city") or "").strip()
    query = select(KbChunkRecord).where(KbChunkRecord.embedding.is_not(None))
    if current_city:
        query = query.where(KbChunkRecord.city == current_city)
    query = query.order_by(KbChunkRecord.embedding.cosine_distance(query_vector)).limit(settings.rag_retrieval_candidates)
    rows = session.exec(query).all()

    semantic = []
    total = len(rows)
    for index, chunk in enumerate(rows):
        semantic.append(_chunk_to_candidate(chunk, float(total - index), "semantic"))
    return semantic, ""


def _fuse_candidates(lexical: list[dict], semantic: list[dict], top_k: int) -> list[dict]:
    if not lexical and not semantic:
        return []

    fused = fuse_ranked_results(lexical=lexical, semantic=semantic)
    lexical_map = {item["chunk_id"]: item for item in lexical}
    semantic_map = {item["chunk_id"]: item for item in semantic}

    combined = []
    for item in fused:
        candidate = dict(lexical_map.get(item["chunk_id"]) or semantic_map.get(item["chunk_id"]) or {})
        if not candidate:
            continue
        candidate["score"] = item["score"]
        combined.append(candidate)
    return combined[:top_k]


def _apply_rerank(
    message: str,
    candidates: list[dict],
    settings: Settings,
    rerank_client: RerankClient | None,
) -> tuple[list[dict], dict]:
    if not candidates:
        return [], build_source_status(
            source_id="kb-rerank",
            source_label="Knowledge Base Rerank",
            status="pending",
            coverage_note="No retrieval candidates were available for reranking.",
            provenance=settings.rerank_model or "not-configured",
        )

    if not rerank_client:
        return candidates, build_source_status(
            source_id="kb-rerank",
            source_label="Knowledge Base Rerank",
            status="partial",
            coverage_note="Rerank is not configured, so chat uses the fused retrieval order directly.",
            provenance=settings.rerank_model or "not-configured",
        )

    try:
        rerank_top_n = min(settings.rerank_top_n, len(candidates))
        results = rerank_client.rerank(message, [item["content"] for item in candidates], top_n=rerank_top_n)
        reranked = []
        seen_indexes = set()
        for item in results:
            index = int(item.get("index", -1))
            if index < 0 or index >= len(candidates):
                continue
            seen_indexes.add(index)
            row = dict(candidates[index])
            row["rerank_score"] = float(item.get("relevance_score", 0.0))
            reranked.append(row)

        for index, candidate in enumerate(candidates):
            if index not in seen_indexes:
                reranked.append(candidate)

        return reranked[: settings.rag_top_k], build_source_status(
            source_id="kb-rerank",
            source_label="Knowledge Base Rerank",
            status="ready",
            coverage_note=f"Reranked {min(len(candidates), rerank_top_n)} candidates before answering.",
            provenance=settings.rerank_model,
        )
    except Exception as exc:
        return candidates, build_source_status(
            source_id="kb-rerank",
            source_label="Knowledge Base Rerank",
            status="failed",
            coverage_note="Rerank was configured but the provider request did not complete successfully.",
            provenance=settings.rerank_model,
            error=str(exc),
        )


def _ensure_ingested(session: Session, embedding_client: EmbeddingClient | None) -> tuple[dict, str]:
    snapshot = build_ingest_status_snapshot(session)
    needs_embedding_backfill = snapshot["chunks"] > 0 and snapshot["embedded_chunks"] <= 0 and embedding_client is not None
    if snapshot["chunks"] > 0 and not needs_embedding_backfill:
        return snapshot, ""

    try:
        ingest_configured_knowledge_base(session=session, embedding_client=embedding_client)
    except Exception as exc:
        return build_ingest_status_snapshot(session), str(exc)
    return build_ingest_status_snapshot(session), ""


def _build_ingest_status(snapshot: dict, ingest_error: str) -> dict:
    latest_job = snapshot.get("latest_job")
    if snapshot["chunks"] > 0:
        return build_source_status(
            source_id="kb-ingest",
            source_label="Knowledge Base Ingest",
            status="ready",
            coverage_note=(
                f"Knowledge base is loaded with {snapshot['documents']} documents, "
                f"{snapshot['chunks']} chunks, and {snapshot['embedded_chunks']} embedded chunks."
            ),
            provenance=str(getattr(latest_job, "source_path", "backend/data")),
        )

    error_text = ingest_error or getattr(latest_job, "notes", "")
    return build_source_status(
        source_id="kb-ingest",
        source_label="Knowledge Base Ingest",
        status="failed" if error_text else "pending",
        coverage_note="Knowledge base chunks are not available in the database yet.",
        provenance=str(getattr(latest_job, "source_path", "backend/data")),
        error=error_text,
    )


def _build_embedding_status(snapshot: dict, settings: Settings, embedding_error: str = "") -> dict:
    configured = bool(settings.embedding_base_url and settings.embedding_api_key and settings.embedding_model)
    if embedding_error:
        return build_source_status(
            source_id="kb-embedding",
            source_label="Knowledge Base Embedding",
            status="failed",
            coverage_note="Semantic retrieval was configured but query embedding failed.",
            provenance=settings.embedding_model,
            error=embedding_error,
        )

    if snapshot["embedded_chunks"] > 0 and configured:
        return build_source_status(
            source_id="kb-embedding",
            source_label="Knowledge Base Embedding",
            status="ready",
            coverage_note=f"Semantic retrieval is available for {snapshot['embedded_chunks']} embedded chunks.",
            provenance=settings.embedding_model,
        )

    if snapshot["chunks"] > 0 and not configured:
        return build_source_status(
            source_id="kb-embedding",
            source_label="Knowledge Base Embedding",
            status="partial",
            coverage_note="Embedding is not configured, so retrieval currently runs in lexical-only mode.",
            provenance="not-configured",
        )

    if snapshot["chunks"] > 0:
        return build_source_status(
            source_id="kb-embedding",
            source_label="Knowledge Base Embedding",
            status="partial",
            coverage_note="Knowledge base chunks exist, but embeddings are missing so semantic retrieval is unavailable.",
            provenance=settings.embedding_model or "not-configured",
        )

    return build_source_status(
        source_id="kb-embedding",
        source_label="Knowledge Base Embedding",
        status="pending",
        coverage_note="Embedding status will become available after the knowledge base is ingested.",
        provenance=settings.embedding_model or "not-configured",
    )


def _build_retrieval_status(evidence_rows: list[dict], lexical_count: int, semantic_count: int) -> dict:
    status = "ready" if evidence_rows else "partial"
    return build_source_status(
        source_id="kb-retrieval",
        source_label="Knowledge Base Retrieval",
        status=status,
        coverage_note=(
            f"Retrieved {len(evidence_rows)} evidence chunks from the database "
            f"(lexical candidates={lexical_count}, semantic candidates={semantic_count})."
            if evidence_rows
            else "No matching knowledge-base chunks were retrieved for this chat turn."
        ),
        provenance="kb_documents;kb_chunks",
    )


def retrieve_chat_evidence(
    session: Session,
    message: str,
    context: dict,
    settings: Settings | None = None,
    embedding_client: EmbeddingClient | None = None,
    rerank_client: RerankClient | None = None,
) -> tuple[list[dict], list[dict]]:
    settings = settings or get_settings()
    embedding_client = embedding_client if embedding_client is not None else _build_embedding_client(settings)
    rerank_client = rerank_client if rerank_client is not None else _build_rerank_client(settings)

    snapshot, ingest_error = _ensure_ingested(session, embedding_client)
    source_status = [_build_ingest_status(snapshot, ingest_error)]

    if snapshot["chunks"] <= 0:
        source_status.append(_build_embedding_status(snapshot, settings))
        source_status.append(_build_retrieval_status([], 0, 0))
        source_status.append(
            build_source_status(
                source_id="kb-rerank",
                source_label="Knowledge Base Rerank",
                status="pending",
                coverage_note="Rerank is skipped because no knowledge-base chunks were retrieved.",
                provenance=settings.rerank_model or "not-configured",
            )
        )
        return [], source_status

    lexical = _fetch_lexical_candidates(session, message, context, settings)
    semantic = []
    embedding_error = ""
    try:
        semantic, embedding_error = _fetch_semantic_candidates(
            session=session,
            message=message,
            context=context,
            settings=settings,
            embedding_client=embedding_client,
            embedded_chunks=snapshot["embedded_chunks"],
        )
    except Exception as exc:
        embedding_error = str(exc)

    source_status.append(_build_embedding_status(snapshot, settings, embedding_error=embedding_error))
    evidence_rows = _fuse_candidates(lexical=lexical, semantic=semantic, top_k=settings.rag_top_k)
    source_status.append(_build_retrieval_status(evidence_rows, len(lexical), len(semantic)))

    reranked_rows, rerank_status = _apply_rerank(message, evidence_rows, settings, rerank_client)
    source_status.append(rerank_status)
    return reranked_rows, source_status


def build_retrieval_statuses(evidence_rows: list[dict]) -> list[dict]:
    return [_build_retrieval_status(evidence_rows, len(evidence_rows), 0)]


def build_fallback_reply(evidence_rows: list[dict]) -> str:
    if not evidence_rows:
        return "我已优先检索武汉知识库，但这一轮没有找到直接证据。你可以继续指定景点、片区或玩法，我再按知识库优先模式回答。"

    preview = "\n".join(row.get("content", "") for row in evidence_rows[:2])
    return "当前后端未配置聊天模型，先返回知识库摘录：\n" + preview


def answer_chat_with_rag(
    session: Session,
    payload: dict,
    llm_client,
    settings: Settings | None = None,
    embedding_client: EmbeddingClient | None = None,
    rerank_client: RerankClient | None = None,
) -> tuple[str, list[dict]]:
    settings = settings or get_settings()
    message = payload.get("message", "")
    context = payload.get("context") or {}
    evidence_rows, source_status = retrieve_chat_evidence(
        session=session,
        message=message,
        context=context,
        settings=settings,
        embedding_client=embedding_client,
        rerank_client=rerank_client,
    )

    system = build_chat_prompt(context, evidence_rows)
    reply = llm_client.chat_text(messages=[{"role": "user", "content": message}], system=system)
    return reply, source_status
