from datetime import UTC, datetime


def build_source_status(
    source_id: str,
    source_label: str,
    status: str,
    coverage_note: str = "",
    provenance: str = "",
    error: str = "",
) -> dict:
    return {
        "source_id": source_id,
        "source_label": source_label,
        "status": status,
        "fetched_at": datetime.now(UTC),
        "stale_at": None,
        "error": error,
        "coverage_note": coverage_note,
        "provenance": provenance,
    }


def build_default_source_statuses() -> list[dict]:
    return [
        build_source_status(
            source_id="wuhan-note-corpus",
            source_label="Local Wuhan Note Snapshot",
            status="ready",
            coverage_note="Trend and POI extraction based on local note snapshot",
            provenance="configured-note-source-paths",
        ),
        build_source_status(
            source_id="wuhan-seed-nodes",
            source_label="Wuhan Seed Nodes",
            status="partial",
            coverage_note="Only seed-backed nodes can be projected to the map",
            provenance="backend/data/wuhan_seed_nodes.json",
        ),
    ]
