from datetime import UTC, datetime

from pgvector.sqlalchemy import VECTOR
from sqlmodel import JSON, Column, Field, SQLModel


class KbDocumentRecord(SQLModel, table=True):
    document_id: str = Field(primary_key=True)
    source_type: str
    source_path: str
    source_record_id: str
    title: str
    city: str = "wuhan"
    district: str = ""
    doc_type: str = "tourism_note"
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    raw_payload: dict = Field(default_factory=dict, sa_column=Column(JSON))
    is_active: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class KbChunkRecord(SQLModel, table=True):
    chunk_id: str = Field(primary_key=True)
    document_id: str = Field(index=True)
    chunk_index: int
    content: str
    city: str = Field(default="wuhan", index=True)
    district: str = ""
    embedding: list[float] | None = Field(default=None, sa_column=Column(VECTOR()))
    topic_tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    poi_ids_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    metadata_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class KbIngestJobRecord(SQLModel, table=True):
    job_id: str = Field(primary_key=True)
    source_path: str
    status: str
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
