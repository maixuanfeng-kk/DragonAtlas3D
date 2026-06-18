from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings


def _connect_args(database_url: str) -> dict:
    return {"check_same_thread": False} if database_url.startswith("sqlite") else {}


def _build_init_statements() -> list[str]:
    return ["CREATE EXTENSION IF NOT EXISTS vector"]


settings = get_settings()
engine = create_engine(settings.database_url, connect_args=_connect_args(settings.database_url))


def init_db() -> None:
    from app.models.tables import PoiNodeRecord, SourceStatusRecord
    from app.models.tables_rag import KbChunkRecord, KbDocumentRecord, KbIngestJobRecord

    if not settings.database_url.startswith("sqlite"):
        with engine.begin() as connection:
            for statement in _build_init_statements():
                connection.execute(text(statement))

    SQLModel.metadata.create_all(
        engine,
        tables=[
            PoiNodeRecord.__table__,
            SourceStatusRecord.__table__,
            KbDocumentRecord.__table__,
            KbChunkRecord.__table__,
            KbIngestJobRecord.__table__,
        ],
    )


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
