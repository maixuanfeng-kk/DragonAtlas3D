from sqlmodel import Session, select

from app.models.tables import PoiNodeRecord


def list_poi_records(session: Session) -> list[PoiNodeRecord]:
    return list(session.exec(select(PoiNodeRecord)))
