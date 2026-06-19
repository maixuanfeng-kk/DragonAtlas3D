from app.rag.retrieval import fuse_ranked_results


def test_fuse_ranked_results_prefers_overlap():
    fused = fuse_ranked_results(
        lexical=[{"chunk_id": "a", "score": 0.9}, {"chunk_id": "b", "score": 0.8}],
        semantic=[{"chunk_id": "b", "score": 0.95}, {"chunk_id": "c", "score": 0.7}],
    )

    assert fused[0]["chunk_id"] == "b"
    assert len(fused) == 3


def test_retrieve_chat_evidence_reads_from_database():
    from sqlmodel import Session, SQLModel, create_engine

    from app.config import Settings
    from app.models.tables_rag import KbChunkRecord, KbDocumentRecord
    from app.rag.service import retrieve_chat_evidence

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine, tables=[KbDocumentRecord.__table__, KbChunkRecord.__table__])

    with Session(engine) as session:
        session.add(
            KbDocumentRecord(
                document_id="doc-yellow-crane",
                source_type="structured_poi",
                source_path="backend/data/wuhan_tourism_pois.json",
                source_record_id="yellow-crane-tower",
                title="Yellow Crane Tower",
                city="wuhan",
                district="Wuchang",
                doc_type="poi_card",
                tags_json=["landmark"],
                raw_payload={},
            )
        )
        session.add(
            KbChunkRecord(
                chunk_id="doc-yellow-crane-chunk-0",
                document_id="doc-yellow-crane",
                chunk_index=0,
                content="Yellow Crane Tower is a landmark with skyline views over the Yangtze River.",
                city="wuhan",
                district="Wuchang",
                topic_tags_json=["landmark"],
                poi_ids_json=["yellow-crane-tower"],
                metadata_json={"category": "landmark"},
            )
        )
        session.commit()

        evidence_rows, source_status = retrieve_chat_evidence(
            session=session,
            message="What is special about Yellow Crane Tower?",
            context={"current_city": "wuhan", "active_pois": ["Yellow Crane Tower"]},
            settings=Settings(database_url="sqlite://", rag_retrieval_candidates=10, rag_top_k=5),
        )

    assert evidence_rows[0]["chunk_id"] == "doc-yellow-crane-chunk-0"
    assert any(item["source_id"] == "kb-retrieval" and item["status"] == "ready" for item in source_status)


def test_retrieve_chat_evidence_applies_rerank_when_configured():
    from sqlmodel import Session, SQLModel, create_engine

    from app.config import Settings
    from app.models.tables_rag import KbChunkRecord, KbDocumentRecord
    from app.rag.service import retrieve_chat_evidence

    captured = {}

    class FakeRerankClient:
        def rerank(self, query, documents, top_n):
            assert query == "Which place has the best river view?"
            assert len(documents) == 2
            assert top_n == 2
            captured["documents"] = list(documents)
            return [
                {"index": 1, "relevance_score": 0.98},
                {"index": 0, "relevance_score": 0.42},
            ]

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine, tables=[KbDocumentRecord.__table__, KbChunkRecord.__table__])

    with Session(engine) as session:
        session.add_all(
            [
                KbDocumentRecord(
                    document_id="doc-a",
                    source_type="structured_poi",
                    source_path="backend/data/wuhan_tourism_pois.json",
                    source_record_id="museum",
                    title="Museum",
                    city="wuhan",
                    district="Wuchang",
                    doc_type="poi_card",
                    tags_json=["museum"],
                    raw_payload={},
                ),
                KbDocumentRecord(
                    document_id="doc-b",
                    source_type="structured_poi",
                    source_path="backend/data/wuhan_tourism_pois.json",
                    source_record_id="tower",
                    title="Tower",
                    city="wuhan",
                    district="Wuchang",
                    doc_type="poi_card",
                    tags_json=["landmark"],
                    raw_payload={},
                ),
                KbChunkRecord(
                    chunk_id="doc-a-chunk-0",
                    document_id="doc-a",
                    chunk_index=0,
                    content="The museum is rich in history and exhibitions.",
                    city="wuhan",
                    district="Wuchang",
                    topic_tags_json=["museum"],
                    poi_ids_json=["museum"],
                    metadata_json={},
                ),
                KbChunkRecord(
                    chunk_id="doc-b-chunk-0",
                    document_id="doc-b",
                    chunk_index=0,
                    content="The tower offers the best river view and skyline panorama.",
                    city="wuhan",
                    district="Wuchang",
                    topic_tags_json=["landmark"],
                    poi_ids_json=["tower"],
                    metadata_json={},
                ),
            ]
        )
        session.commit()

        evidence_rows, source_status = retrieve_chat_evidence(
            session=session,
            message="Which place has the best river view?",
            context={"current_city": "wuhan", "active_pois": []},
            settings=Settings(
                database_url="sqlite://",
                rag_retrieval_candidates=10,
                rag_top_k=5,
                rerank_base_url="https://rerank.example.com/v1",
                rerank_api_key="test-key",
                rerank_model="test-rerank",
                rerank_top_n=2,
            ),
            rerank_client=FakeRerankClient(),
        )

    assert evidence_rows[0]["content"] == captured["documents"][1]
    assert any(item["source_id"] == "kb-rerank" and item["status"] == "ready" for item in source_status)


def test_retrieve_chat_evidence_reingests_to_backfill_embeddings_when_provider_is_added():
    from sqlmodel import Session, SQLModel, create_engine, select

    from app.config import Settings
    from app.models.tables_rag import KbChunkRecord, KbDocumentRecord, KbIngestJobRecord
    from app.rag.service import retrieve_chat_evidence

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(
        engine,
        tables=[KbDocumentRecord.__table__, KbChunkRecord.__table__, KbIngestJobRecord.__table__],
    )

    class FakeEmbeddingClient:
        def __init__(self):
            self.calls = []

        def embed_texts(self, texts):
            self.calls.append(list(texts))
            return [[0.5, 0.25, 0.125] for _ in texts]

    embedding_client = FakeEmbeddingClient()

    with Session(engine) as session:
        session.add(
            KbDocumentRecord(
                document_id="doc-yellow-crane",
                source_type="structured_poi",
                source_path="backend/data/wuhan_tourism_pois.json",
                source_record_id="yellow-crane-tower",
                title="Yellow Crane Tower",
                city="wuhan",
                district="Wuchang",
                doc_type="poi_card",
                tags_json=["landmark"],
                raw_payload={},
            )
        )
        session.add(
            KbChunkRecord(
                chunk_id="doc-yellow-crane-chunk-0",
                document_id="doc-yellow-crane",
                chunk_index=0,
                content="Yellow Crane Tower is a landmark with skyline views over the Yangtze River.",
                city="wuhan",
                district="Wuchang",
                topic_tags_json=["landmark"],
                poi_ids_json=["yellow-crane-tower"],
                metadata_json={"category": "landmark"},
            )
        )
        session.commit()

        _, source_status = retrieve_chat_evidence(
            session=session,
            message="What is special about Yellow Crane Tower?",
            context={"current_city": "wuhan", "active_pois": ["Yellow Crane Tower"]},
            settings=Settings(
                database_url="sqlite://",
                rag_retrieval_candidates=10,
                rag_top_k=5,
                embedding_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                embedding_api_key="test-key",
                embedding_model="text-embedding-v4",
                embedding_dimensions=3,
            ),
            embedding_client=embedding_client,
        )

        refreshed_chunks = session.exec(select(KbChunkRecord)).all()

    assert embedding_client.calls
    assert refreshed_chunks
    assert any(chunk.embedding is not None for chunk in refreshed_chunks)
    assert any(item["source_id"] == "kb-embedding" and item["status"] == "ready" for item in source_status)
