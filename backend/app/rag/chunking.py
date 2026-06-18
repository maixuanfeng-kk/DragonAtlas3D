def _split_tags(raw_value):
    if isinstance(raw_value, list):
        return [str(item).strip() for item in raw_value if str(item).strip()]
    text = str(raw_value or "")
    return [item.strip() for item in text.replace("，", ",").split(",") if item.strip()]


def build_documents_and_chunks(kb_rows, poi_rows, seed_rows):
    documents = []
    chunks = []

    for index, row in enumerate(kb_rows):
        document_id = f"kb-note-{row.get('note_id', index)}"
        tags = _split_tags(row.get("tag_list", ""))
        documents.append(
            {
                "document_id": document_id,
                "source_type": "jsonl_note",
                "source_path": "backend/data/wuhan_tourism_kb.jsonl",
                "source_record_id": row.get("note_id", ""),
                "title": row.get("title", ""),
                "city": "wuhan",
                "district": "",
                "doc_type": "tourism_note",
                "tags": tags,
                "raw_payload": row,
            }
        )
        chunks.append(
            {
                "chunk_id": f"{document_id}-chunk-0",
                "document_id": document_id,
                "chunk_index": 0,
                "content": "\n".join(
                    [
                        f"标题：{row.get('title', '')}",
                        f"正文：{row.get('desc', '')}",
                        f"标签：{', '.join(tags)}",
                        f"关键词：{row.get('source_keyword', '')}",
                    ]
                ),
                "city": "wuhan",
                "district": "",
                "topic_tags": tags,
                "poi_ids": [],
                "metadata": {"source_keyword": row.get("source_keyword", "")},
            }
        )

    for source_type, source_path, rows in [
        ("structured_poi", "backend/data/wuhan_tourism_pois.json", poi_rows),
        ("seed_poi", "backend/data/wuhan_seed_nodes.json", seed_rows),
    ]:
        for row in rows:
            record_id = row.get("id", "")
            tags = _split_tags(row.get("tags", []))
            document_id = f"{source_type}-{record_id}"
            documents.append(
                {
                    "document_id": document_id,
                    "source_type": source_type,
                    "source_path": source_path,
                    "source_record_id": record_id,
                    "title": row.get("name", ""),
                    "city": "wuhan",
                    "district": row.get("district", ""),
                    "doc_type": "poi_card",
                    "tags": tags,
                    "raw_payload": row,
                }
            )
            chunks.append(
                {
                    "chunk_id": f"{document_id}-chunk-0",
                    "document_id": document_id,
                    "chunk_index": 0,
                    "content": "\n".join(
                        [
                            f"名称：{row.get('name', '')}",
                            f"类型：{row.get('category', '')}",
                            f"区域：{row.get('district', '')}",
                            f"描述：{row.get('description', row.get('reason_summary', ''))}",
                            f"标签：{', '.join(tags)}",
                            f"开放时间：{row.get('opening', row.get('opening_hours', ''))}",
                            f"门票：{row.get('ticket', row.get('ticket_info', ''))}",
                            f"建议时段：{row.get('visit_period', '')}",
                        ]
                    ),
                    "city": "wuhan",
                    "district": row.get("district", ""),
                    "topic_tags": tags,
                    "poi_ids": [record_id] if record_id else [],
                    "metadata": {"category": row.get("category", ""), "visit_period": row.get("visit_period", "")},
                }
            )

    return documents, chunks
