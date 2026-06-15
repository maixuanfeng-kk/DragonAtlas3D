"""Node 3 — POI Selection.

Ranks and enriches POI cards based on user-selected nodes and preferences.
Uses Amap text search to enrich seed data when thin.
"""

import logging

import httpx

from app.agent.state import AgentState
from app.config import get_settings
from app.services.poi_registry import collect_poi_cards_for_selection, read_seed_nodes
from app.services.source_registry import build_source_status

logger = logging.getLogger(__name__)


def _add_source_status(state: dict, source_id: str, label: str, status: str, note: str, error: str = "") -> None:
    state.setdefault("source_status", [])
    state["source_status"].append(
        build_source_status(
            source_id=source_id,
            source_label=label,
            status=status,
            coverage_note=note,
            provenance="langgraph-agent-node",
            error=error,
        )
    )


def _amap_enrich_poi(keyword: str) -> list[dict]:
    """Quick Amap text search to enrich a seed node."""
    settings = get_settings()
    if not settings.amap_web_key:
        return []
    try:
        resp = httpx.get(
            f"{settings.amap_web_base_url}/v5/place/text",
            params={
                "key": settings.amap_web_key,
                "keywords": keyword,
                "region": "420100",
                "page_size": 3,
            },
            timeout=10,
        )
        pois = resp.json().get("pois") or []
        return [
            {
                "id": p.get("id", ""),
                "name": p.get("name", ""),
                "center": [float(c) for c in p.get("location", "0,0").split(",")],
            }
            for p in pois
        ]
    except Exception:
        return []


def poi_selection(state: AgentState) -> dict:
    """Select and rank POIs based on user-selected nodes and preferences."""
    from app.models.schemas import SelectedNode

    selected = state.get("selected_nodes", [])
    if not selected:
        return {"poi_cards": [], "error": "No selected nodes to build POI cards from."}

    nodes = [
        SelectedNode(
            id=n.get("id", ""),
            name=n.get("name", ""),
            node_type=n.get("node_type", "poi"),
            center=n.get("center"),
        )
        for n in selected
    ]

    try:
        cards = collect_poi_cards_for_selection(nodes)
        poi_rows = [card.model_dump() for card in cards]
    except Exception:
        seed_by_id = {r["id"]: r for r in read_seed_nodes()}
        poi_rows = []
        for n in selected:
            seed = seed_by_id.get(n.get("id", ""))
            if seed:
                poi_rows.append({**seed, "confidence": 1.0, "status": "seed"})
            else:
                poi_rows.append({
                    "id": n.get("id", ""),
                    "name": n.get("name", ""),
                    "node_type": n.get("node_type", "poi"),
                    "category": "unknown",
                    "center": n.get("center"),
                    "coordinate_status": "selected_input",
                    "tags": [],
                    "reason_summary": f"User-selected: {n.get('name', '')}",
                })

    # Sort by preference
    pref = state.get("day_or_night_preference", "balanced")
    night_cats = {"business_area", "street", "nightlife"}
    day_cats = {"sightseeing", "landmark", "lake", "museum"}

    if pref == "night":
        poi_rows.sort(key=lambda r: 0 if r.get("category") in night_cats else 1)
    elif pref == "day":
        poi_rows.sort(key=lambda r: 0 if r.get("category") in day_cats else 1)

    _add_source_status(state, "poi-selector", "POI Selector", "ready",
                       f"Selected {len(poi_rows)} POI card(s) for itinerary.", "")

    return {
        "poi_cards": poi_rows,
        "source_status": state.get("source_status", []),
    }
