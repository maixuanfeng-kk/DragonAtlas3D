import json
from pathlib import Path

from app.models.schemas import PoiCard, SelectedNode

SEED_PATH = Path(__file__).resolve().parents[2] / "data" / "wuhan_seed_nodes.json"


def read_seed_nodes() -> list[dict]:
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def merge_seed_and_extracted_nodes(seed_rows: list[dict], extracted_rows: list[dict]) -> list[dict]:
    seed_by_id = {row["id"]: row for row in seed_rows}
    merged = []
    for row in extracted_rows:
        seed = seed_by_id.get(row["id"])
        if seed:
            merged.append({**row, **seed, "confidence": row["confidence"], "status": row["status"]})
        else:
            merged.append({**row, "center": None, "coordinate_status": "partial"})
    return merged


def collect_poi_cards_for_selection(selected_nodes: list[SelectedNode]) -> list[PoiCard]:
    seed_by_id = {row["id"]: row for row in read_seed_nodes()}
    items: list[PoiCard] = []
    for selected in selected_nodes:
        seed = seed_by_id.get(selected.id)
        if seed:
            items.append(
                PoiCard.model_validate(
                    {
                        **seed,
                        "reason_summary": seed.get("reason_summary", f"围绕 {seed['name']} 组织武汉玩法。"),
                        "confidence": 1.0,
                        "source_count": 1,
                        "source_note_ids": [],
                        "status": seed.get("status", "seed"),
                    }
                )
            )
            continue
        items.append(
            PoiCard(
                id=selected.id,
                name=selected.name,
                node_type=selected.node_type,
                category="unknown",
                center=selected.center,
                coordinate_status="partial" if not selected.center else "selected_input",
                reason_summary=f"根据用户选择保留节点 {selected.name}",
                status="selected_input",
            )
        )
    if not items:
        for seed in read_seed_nodes()[:2]:
            items.append(PoiCard.model_validate({**seed, "confidence": 1.0, "source_count": 1, "source_note_ids": [], "status": "seed"}))
    return items
