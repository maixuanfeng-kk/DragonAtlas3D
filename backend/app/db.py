from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings


def _sqlite_connect_args(database_url: str) -> dict:
    return {"check_same_thread": False} if database_url.startswith("sqlite") else {}


settings = get_settings()
engine = create_engine(settings.database_url, connect_args=_sqlite_connect_args(settings.database_url))


def init_db() -> None:
    from app.models.tables import PoiNodeRecord, SourceStatusRecord

    SQLModel.metadata.create_all(engine, tables=[PoiNodeRecord.__table__, SourceStatusRecord.__table__])


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
