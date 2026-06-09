from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.config import get_settings
from app.db import get_session
from app.models.schemas import PoiCard, PoiExtractRequest, PoiExtractResponse, PoiListResponse, SourceStatus
from app.services.note_ingest import load_note_records, normalize_note_records
from app.services.poi_extractor import extract_poi_candidates
from app.services.llm.qwen_client import QwenClient
from app.services.poi_registry import merge_seed_and_extracted_nodes, read_seed_nodes
from app.services.poi_store import build_poi_catalog, read_persisted_poi_rows, replace_extracted_snapshot
from app.services.source_registry import build_source_status

router = APIRouter(prefix="/poi", tags=["poi"])


@router.get("", response_model=PoiListResponse)
def list_poi(
    city: str = Query(default="wuhan"),
    mapped_only: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> PoiListResponse:
    seed_rows = read_seed_nodes()
    persisted_rows = read_persisted_poi_rows(session)
    catalog_rows = build_poi_catalog(seed_rows, persisted_rows)
    items = [PoiCard.model_validate(row) for row in catalog_rows if city == "wuhan"]
    if mapped_only:
        items = [item for item in items if item.center]
    return PoiListResponse(items=items, total=len(items))


@router.post("/extract", response_model=PoiExtractResponse)
def extract_poi(request: PoiExtractRequest, session: Session = Depends(get_session)) -> PoiExtractResponse:
    note_rows = normalize_note_records(load_note_records(request.source_paths))
    note_status = SourceStatus.model_validate(
        build_source_status(
            source_id="wuhan-note-corpus",
            source_label="Local Wuhan Note Snapshot",
            status="ready" if note_rows else "failed",
            coverage_note="Trend and POI extraction based on local note snapshot",
            provenance=";".join(request.source_paths),
            error="" if note_rows else "No readable Wuhan note records were loaded.",
        ),
    )
    settings = get_settings()
    if not settings.qwen_api_key or not settings.qwen_base_url:
        extractor_status = SourceStatus.model_validate(
            build_source_status(
                source_id="poi-extractor",
                source_label="Qwen POI Extractor",
                status="failed",
                coverage_note="Qwen extraction is not configured for this backend instance.",
                provenance=settings.qwen_model,
                error="Missing QWEN_API_KEY or QWEN_BASE_URL.",
            ),
        )
        return PoiExtractResponse(
            city=request.city,
            job_status="failed",
            notes_loaded=len(note_rows),
            pois_extracted=0,
            pois_seed_matched=0,
            pois_coordinate_partial=0,
            source_status=[note_status, extractor_status],
        )

    try:
        qwen_client = QwenClient(
            api_key=settings.qwen_api_key,
            base_url=settings.qwen_base_url,
            model=settings.qwen_model,
            timeout_seconds=settings.qwen_timeout_seconds,
        )
        extracted_rows = extract_poi_candidates(note_rows, llm_client=qwen_client)
        merged_rows = merge_seed_and_extracted_nodes(read_seed_nodes(), extracted_rows)
        replace_extracted_snapshot(session, merged_rows)
        seed_matched = sum(1 for row in merged_rows if row.get("coordinate_status") == "verified_seed")
        partial_count = sum(1 for row in merged_rows if row.get("coordinate_status") != "verified_seed")
        extractor_status = SourceStatus.model_validate(
            build_source_status(
                source_id="poi-extractor",
                source_label="Qwen POI Extractor",
                status="ready",
                coverage_note="Extraction completed from local Wuhan notes.",
                provenance=settings.qwen_model,
            ),
        )
        return PoiExtractResponse(
            city=request.city,
            job_status="ready",
            notes_loaded=len(note_rows),
            pois_extracted=len(extracted_rows),
            pois_seed_matched=seed_matched,
            pois_coordinate_partial=partial_count,
            source_status=[note_status, extractor_status],
        )
    except Exception as error:
        extractor_status = SourceStatus.model_validate(
            build_source_status(
                source_id="poi-extractor",
                source_label="Qwen POI Extractor",
                status="failed",
                coverage_note="Extraction request reached the configured model provider but did not complete successfully.",
                provenance=settings.qwen_model,
                error=str(error),
            ),
        )
        return PoiExtractResponse(
            city=request.city,
            job_status="failed",
            notes_loaded=len(note_rows),
            pois_extracted=0,
            pois_seed_matched=0,
            pois_coordinate_partial=0,
            source_status=[note_status, extractor_status],
        )
