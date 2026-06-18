from sqlmodel import Session, SQLModel, create_engine, select

from app.models.tables_rag import KbChunkRecord, KbDocumentRecord, KbIngestJobRecord
from app.rag.ingest import ingest_knowledge_base


def test_ingest_knowledge_base_persists_documents_and_chunks():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(
        engine,
        tables=[KbDocumentRecord.__table__, KbChunkRecord.__table__, KbIngestJobRecord.__table__],
    )

    with Session(engine) as session:
        counts = ingest_knowledge_base(
            session=session,
            kb_rows=[
                {
                    "note_id": "kb-1",
                    "title": "黄鹤楼",
                    "desc": "经典地标。",
                    "tag_list": "地标,观景",
                    "source_keyword": "黄鹤楼",
                }
            ],
            poi_rows=[],
            seed_rows=[],
            embedding_client=None,
        )
        stored_docs = session.exec(select(KbDocumentRecord)).all()
        stored_chunks = session.exec(select(KbChunkRecord)).all()

    assert counts["documents"] == 1
    assert counts["chunks"] == 1
    assert len(stored_docs) == 1
    assert len(stored_chunks) == 1
