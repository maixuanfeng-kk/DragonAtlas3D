import json
from pathlib import Path
from uuid import uuid4

from sqlalchemy import inspect
from sqlalchemy import func
from sqlmodel import Session, delete
from sqlmodel import select

from app.models.tables_rag import KbChunkRecord, KbDocumentRecord, KbIngestJobRecord
from app.rag.chunking import build_documents_and_chunks

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
KB_PATH = DATA_DIR / "wuhan_tourism_kb.jsonl"
POI_PATH = DATA_DIR / "wuhan_tourism_pois.json"
SEED_PATH = DATA_DIR / "wuhan_seed_nodes.json"


def _load_json(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def _count_rows(session: Session, model) -> int:
    return int(session.exec(select(func.count()).select_from(model)).one())


def build_ingest_status_snapshot(session: Session) -> dict:
    inspector = inspect(session.get_bind())
    table_names = set(inspector.get_table_names())
    document_count = _count_rows(session, KbDocumentRecord) if KbDocumentRecord.__table__.name in table_names else 0
    chunk_count = _count_rows(session, KbChunkRecord) if KbChunkRecord.__table__.name in table_names else 0
    embedded_chunk_count = 0
    if KbChunkRecord.__table__.name in table_names:
        chunk_columns = {column["name"] for column in inspector.get_columns(KbChunkRecord.__table__.name)}
        if "embedding" in chunk_columns:
            embedded_chunk_count = int(
                session.exec(
                    select(func.count()).select_from(KbChunkRecord).where(KbChunkRecord.embedding.is_not(None))
                ).one()
            )
    latest_job = None
    if KbIngestJobRecord.__table__.name in table_names:
        latest_job = session.exec(select(KbIngestJobRecord).order_by(KbIngestJobRecord.created_at.desc())).first()
    return {
        "documents": document_count,
        "chunks": chunk_count,
        "embedded_chunks": embedded_chunk_count,
        "latest_job": latest_job,
    }


def _record_ingest_job(session: Session, status: str, notes: str) -> None:
    session.add(
        KbIngestJobRecord(
            job_id=f"kb-ingest-{uuid4()}",
            source_path=str(DATA_DIR),
            status=status,
            notes=notes,
        )
    )


def ingest_knowledge_base(session: Session, kb_rows: list[dict], poi_rows: list[dict], seed_rows: list[dict], embedding_client=None) -> dict:
    documents, chunks = build_documents_and_chunks(kb_rows=kb_rows, poi_rows=poi_rows, seed_rows=seed_rows)
    embeddings = embedding_client.embed_texts([chunk["content"] for chunk in chunks]) if embedding_client and chunks else []

    session.exec(delete(KbChunkRecord))
    session.exec(delete(KbDocumentRecord))

    for doc in documents:
        session.add(
            KbDocumentRecord(
                document_id=doc["document_id"],
                source_type=doc["source_type"],
                source_path=doc["source_path"],
                source_record_id=doc["source_record_id"],
                title=doc["title"],
                city=doc["city"],
                district=doc["district"],
                doc_type=doc["doc_type"],
                tags_json=doc["tags"],
                raw_payload=doc["raw_payload"],
            )
        )

    for index, chunk in enumerate(chunks):
        vector = embeddings[index] if index < len(embeddings) else None
        session.add(
            KbChunkRecord(
                chunk_id=chunk["chunk_id"],
                document_id=chunk["document_id"],
                chunk_index=chunk["chunk_index"],
                content=chunk["content"],
                city=chunk["city"],
                district=chunk["district"],
                embedding=vector,
                topic_tags_json=chunk["topic_tags"],
                poi_ids_json=chunk["poi_ids"],
                metadata_json=chunk["metadata"],
            )
        )

    _record_ingest_job(
        session=session,
        status="ready",
        notes=f"documents={len(documents)}, chunks={len(chunks)}, embedded={len(embeddings)}",
    )
    session.commit()
    return {"documents": len(documents), "chunks": len(chunks), "embedded_chunks": len(embeddings)}


def ingest_configured_knowledge_base(session: Session, embedding_client=None) -> dict:
    try:
        if not KB_PATH.exists() or not POI_PATH.exists() or not SEED_PATH.exists():
            missing_paths = [str(path) for path in [KB_PATH, POI_PATH, SEED_PATH] if not path.exists()]
            raise FileNotFoundError(f"Missing knowledge-base files: {', '.join(missing_paths)}")

        kb_rows = _load_jsonl(KB_PATH)
        poi_rows = _load_json(POI_PATH)
        seed_rows = _load_json(SEED_PATH)
        return ingest_knowledge_base(
            session=session,
            kb_rows=kb_rows,
            poi_rows=poi_rows,
            seed_rows=seed_rows,
            embedding_client=embedding_client,
        )
    except Exception as exc:
        session.rollback()
        _record_ingest_job(session=session, status="failed", notes=str(exc))
        session.commit()
        raise
