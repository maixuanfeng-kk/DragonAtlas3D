from sqlmodel import Session, select

from app.models.tables import SourceStatusRecord


def list_source_status_records(session: Session) -> list[SourceStatusRecord]:
    return list(session.exec(select(SourceStatusRecord)))
