from datetime import datetime, UTC

from sqlmodel import Field, SQLModel


class PoiNodeRecord(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    node_type: str
    category: str
    district: str = ""
    center_lon: float | None = None
    center_lat: float | None = None
    coordinate_status: str = "partial"
    tags_csv: str = ""
    reason_summary: str = ""
    recommended_time: str = ""
    visit_period: str = ""
    confidence: float = 0.0
    source_count: int = 0
    source_note_ids_csv: str = ""
    status: str = "auto_extracted"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SourceStatusRecord(SQLModel, table=True):
    source_id: str = Field(primary_key=True)
    source_label: str
    status: str
    fetched_at: datetime | None = None
    stale_at: datetime | None = None
    error: str = ""
    coverage_note: str = ""
    provenance: str = ""
