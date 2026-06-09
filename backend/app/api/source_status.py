from fastapi import APIRouter

from app.models.schemas import SourceStatus, SourceStatusListResponse
from app.services.source_registry import build_default_source_statuses

router = APIRouter(prefix="/source-status", tags=["source-status"])


@router.get("", response_model=SourceStatusListResponse)
def get_source_status() -> SourceStatusListResponse:
    items = [SourceStatus.model_validate(item) for item in build_default_source_statuses()]
    return SourceStatusListResponse(items=items)
