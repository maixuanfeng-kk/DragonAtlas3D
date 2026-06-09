import json

from sqlmodel import Session, delete, select

from app.models.tables import PoiNodeRecord
from app.services.poi_registry import merge_seed_and_extracted_nodes


def _serialize_list(values: list[str]) -> str:
    return json.dumps(values, ensure_ascii=False)


def _deserialize_list(raw_value: str) -> list[str]:
    if not raw_value:
        return []
    return json.loads(raw_value)


def _record_to_row(record: PoiNodeRecord) -> dict:
    center = None
    if record.center_lon is not None and record.center_lat is not None:
        center = [record.center_lon, record.center_lat]
    return {
        "id": record.id,
        "name": record.name,
        "node_type": record.node_type,
        "category": record.category,
        "district": record.district,
        "center": center,
        "coordinate_status": record.coordinate_status,
        "tags": _deserialize_list(record.tags_csv),
        "reason_summary": record.reason_summary,
        "recommended_time": record.recommended_time,
        "visit_period": record.visit_period,
        "confidence": record.confidence,
        "source_count": record.source_count,
        "source_note_ids": _deserialize_list(record.source_note_ids_csv),
        "status": record.status,
    }


def _row_to_record(row: dict) -> PoiNodeRecord:
    center = row.get("center") or [None, None]
    return PoiNodeRecord(
        id=row["id"],
        name=row["name"],
        node_type=row["node_type"],
        category=row.get("category", "unknown"),
        district=row.get("district", ""),
        center_lon=center[0],
        center_lat=center[1],
        coordinate_status=row.get("coordinate_status", "partial"),
        tags_csv=_serialize_list(row.get("tags", [])),
        reason_summary=row.get("reason_summary", ""),
        recommended_time=row.get("recommended_time", ""),
        visit_period=row.get("visit_period", ""),
        confidence=float(row.get("confidence", 0.0)),
        source_count=int(row.get("source_count", 0)),
        source_note_ids_csv=_serialize_list(row.get("source_note_ids", [])),
        status=row.get("status", "auto_extracted"),
    )


def replace_extracted_snapshot(session: Session, rows: list[dict]) -> None:
    session.exec(delete(PoiNodeRecord))
    for row in rows:
        session.add(_row_to_record(row))
    session.commit()


def read_persisted_poi_rows(session: Session) -> list[dict]:
    statement = select(PoiNodeRecord).order_by(PoiNodeRecord.confidence.desc(), PoiNodeRecord.name.asc())
    return [_record_to_row(record) for record in session.exec(statement).all()]


def build_poi_catalog(seed_rows: list[dict], persisted_rows: list[dict]) -> list[dict]:
    merged_rows = merge_seed_and_extracted_nodes(seed_rows, persisted_rows)
    seen_ids = {row["id"] for row in merged_rows}
    catalog = [*merged_rows]

    for seed in seed_rows:
        if seed["id"] not in seen_ids:
            catalog.append(seed)

    return catalog
