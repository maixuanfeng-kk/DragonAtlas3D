"""DragonAtlas3D LangGraph Agent — tool definitions.

Exposes 3 tools the agent can call autonomously:
1. search_amap_place  — Amap POI / place text search.
2. get_route          — Amap walking / driving / transit route between two points.
3. lookup_seed_pois   — Query local Wuhan seed-node registry.
"""

import json
from pathlib import Path
from typing import Any

import httpx
from langchain_core.tools import tool

from app.config import get_settings

SEED_PATH = Path(__file__).resolve().parents[2] / "data" / "wuhan_seed_nodes.json"


# ─────────────────────────────────────────────────────────────────
# Tool 1 — Amap place search
# ─────────────────────────────────────────────────────────────────

@tool
def search_amap_place(keyword: str, city: str = "wuhan") -> list[dict]:
    """Search Amap for POIs, landmarks, hotels, stations, business areas by keyword.

    Args:
        keyword: Search keyword, e.g. "黄鹤楼", "户部巷", "hotel".
        city: City name or adcode, default "wuhan" (adcode 420100).

    Returns:
        List of place dicts with keys: id, name, address, category, center [lng, lat].
        Empty list on failure — the agent should report the gap explicitly.
    """
    settings = get_settings()
    if not settings.amap_web_key:
        return []

    adcode = "420100" if city.lower() == "wuhan" else city
    try:
        resp = httpx.get(
            f"{settings.amap_web_base_url}/v5/place/text",
            params={
                "key": settings.amap_web_key,
                "keywords": keyword,
                "region": adcode,
                "page_size": 10,
            },
            timeout=15,
        )
        resp.raise_for_status()
        pois = resp.json().get("pois") or []
        return [
            {
                "id": p.get("id", ""),
                "name": p.get("name", ""),
                "type": p.get("type", ""),
                "address": p.get("address", ""),
                "category": p.get("typecode", ""),
                "center": [float(c) for c in p.get("location", "0,0").split(",")],
            }
            for p in pois
        ]
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────
# Tool 2 — Route between two points
# ─────────────────────────────────────────────────────────────────

@tool
def get_route(
    origin: list[float],
    destination: list[float],
    mode: str = "walking",
) -> dict:
    """Fetch a real route leg between two geographic points via Amap.

    Args:
        origin: [longitude, latitude] of start point.
        destination: [longitude, latitude] of end point.
        mode: "walking", "driving", or "transit".

    Returns:
        Route dict with keys: status ("ready"|"failed"), duration_minutes,
        distance_meters, polyline ([[lng,lat],...]), failure_reason.
    """
    settings = get_settings()
    if not settings.amap_web_key:
        return {"status": "failed", "failure_reason": "AMAP_WEB_KEY_MISSING"}

    endpoints = {
        "walking": "/v5/direction/walking",
        "driving": "/v5/direction/driving",
        "transit": "/v5/direction/transit/integrated",
    }
    endpoint = endpoints.get(mode, endpoints["walking"])

    try:
        resp = httpx.get(
            f"{settings.amap_web_base_url}{endpoint}",
            params={
                "key": settings.amap_web_key,
                "origin": f"{origin[0]},{origin[1]}",
                "destination": f"{destination[0]},{destination[1]}",
            },
            timeout=20,
        )
        payload = resp.json()
        route = payload.get("route") or {}
        paths = route.get("paths") or []
        if resp.status_code != 200 or not paths:
            return {"status": "failed", "failure_reason": f"AMAP_{mode.upper()}_EMPTY"}

        path = paths[0]
        steps = path.get("steps") or []
        polyline: list[list[float]] = []
        for step in steps:
            for pair in (step.get("polyline") or "").split(";"):
                if pair:
                    lng, lat = pair.split(",")
                    polyline.append([float(lng), float(lat)])

        duration_seconds = int(path.get("duration") or 0)
        return {
            "status": "ready",
            "duration_minutes": max(1, round(duration_seconds / 60)),
            "distance_meters": int(path.get("distance") or 0),
            "polyline": polyline,
        }
    except Exception as exc:
        return {"status": "failed", "failure_reason": str(exc)}


# ─────────────────────────────────────────────────────────────────
# Tool 3 — Local seed POI lookup
# ─────────────────────────────────────────────────────────────────

@tool
def lookup_seed_pois(city: str = "wuhan", node_ids: list[str] | None = None) -> list[dict]:
    """Query the local Wuhan seed-node registry for structured POI data.

    Args:
        city: City name. Currently only "wuhan" is seeded.
        node_ids: Optional list of node IDs to filter. Returns all if None.

    Returns:
        List of POI dicts with keys: id, name, node_type, category, district,
        center, tags, reason_summary, recommended_time, visit_period, confidence.
    """
    if city.lower() != "wuhan":
        return []

    try:
        rows: list[dict] = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []

    if node_ids:
        id_set = set(node_ids)
        rows = [r for r in rows if r.get("id") in id_set]

    return [
        {
            "id": r.get("id", ""),
            "name": r.get("name", ""),
            "node_type": r.get("node_type", "poi"),
            "category": r.get("category", ""),
            "district": r.get("district", ""),
            "center": r.get("center"),
            "tags": r.get("tags", []),
            "reason_summary": r.get("reason_summary", ""),
            "recommended_time": r.get("recommended_time", ""),
            "visit_period": r.get("visit_period", ""),
            "confidence": r.get("confidence", 1.0),
        }
        for r in rows
    ]


# ─────────────────────────────────────────────────────────────────
# Tool set
# ─────────────────────────────────────────────────────────────────

AGENT_TOOLS: list[Any] = [search_amap_place, get_route, lookup_seed_pois]
