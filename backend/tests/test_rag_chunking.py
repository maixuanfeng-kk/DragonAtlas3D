from app.rag.chunking import build_documents_and_chunks


def test_build_documents_and_chunks_yields_note_chunks():
    documents, chunks = build_documents_and_chunks(
        kb_rows=[
            {
                "note_id": "kb-1",
                "title": "黄鹤楼",
                "desc": "经典地标，适合看长江风景。",
                "tag_list": "地标,观景",
                "source_keyword": "黄鹤楼",
            }
        ],
        poi_rows=[],
        seed_rows=[],
    )

    assert documents[0]["source_record_id"] == "kb-1"
    assert chunks[0]["content"]
    assert chunks[0]["city"] == "wuhan"


def test_build_documents_and_chunks_yields_structured_poi_chunks():
    documents, chunks = build_documents_and_chunks(
        kb_rows=[],
        poi_rows=[
            {
                "id": "yellow-crane-tower",
                "name": "黄鹤楼",
                "district": "武昌区",
                "category": "landmark",
                "description": "江景地标。",
                "tags": ["地标", "江景"],
                "opening": "08:00-18:00",
                "ticket": "70元",
                "visit_period": "day",
            }
        ],
        seed_rows=[],
    )

    assert documents[0]["source_record_id"] == "yellow-crane-tower"
    assert "08:00-18:00" in chunks[0]["content"]
    assert "yellow-crane-tower" in chunks[0]["poi_ids"]
