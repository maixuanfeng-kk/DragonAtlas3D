from pathlib import Path

from sqlmodel import SQLModel, Session, create_engine

from app.models.tables import PoiNodeRecord
from app.services.poi_store import build_poi_catalog, read_persisted_poi_rows, replace_extracted_snapshot


def create_test_session(tmp_path: Path) -> Session:
    database_url = f"sqlite:///{tmp_path / 'poi-store.db'}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[PoiNodeRecord.__table__])
    return Session(engine)


def test_replace_extracted_snapshot_round_trips_rows(tmp_path: Path):
    rows = [
        {
            "id": "donghu",
            "name": "东湖",
            "node_type": "area",
            "category": "lake",
            "district": "武昌区",
            "center": [114.419, 30.56],
            "coordinate_status": "verified_seed",
            "tags": ["湖景", "骑行"],
            "reason_summary": "高频出现的武汉休闲区域。",
            "recommended_time": "",
            "visit_period": "",
            "confidence": 0.91,
            "source_count": 2,
            "source_note_ids": ["note-1", "note-2"],
            "status": "auto_extracted",
        }
    ]

    with create_test_session(tmp_path) as session:
        replace_extracted_snapshot(session, rows)
        stored_rows = read_persisted_poi_rows(session)

    assert stored_rows[0]["id"] == "donghu"
    assert stored_rows[0]["center"] == [114.419, 30.56]
    assert stored_rows[0]["source_note_ids"] == ["note-1", "note-2"]


def test_build_poi_catalog_includes_unmapped_extracted_candidates():
    seed_rows = [
        {
            "id": "donghu",
            "name": "东湖",
            "node_type": "area",
            "category": "lake",
            "district": "武昌区",
            "center": [114.419, 30.56],
            "coordinate_status": "verified_seed",
            "tags": ["湖景"],
            "reason_summary": "seed",
        }
    ]
    persisted_rows = [
        {
            "id": "donghu",
            "name": "东湖",
            "node_type": "area",
            "category": "lake",
            "district": "武昌区",
            "center": [114.419, 30.56],
            "coordinate_status": "verified_seed",
            "tags": ["湖景", "骑行"],
            "reason_summary": "高频出现的武汉休闲区域。",
            "recommended_time": "",
            "visit_period": "",
            "confidence": 0.91,
            "source_count": 2,
            "source_note_ids": ["note-1", "note-2"],
            "status": "auto_extracted",
        },
        {
            "id": "lingbomen",
            "name": "凌波门",
            "node_type": "poi",
            "category": "spot",
            "district": "武昌区",
            "center": None,
            "coordinate_status": "partial",
            "tags": ["江景", "拍照"],
            "reason_summary": "来自本地笔记的候选点位。",
            "recommended_time": "",
            "visit_period": "",
            "confidence": 0.88,
            "source_count": 1,
            "source_note_ids": ["note-3"],
            "status": "auto_extracted",
        },
    ]

    rows = build_poi_catalog(seed_rows, persisted_rows)
    row_ids = [row["id"] for row in rows]

    assert "donghu" in row_ids
    assert "lingbomen" in row_ids
