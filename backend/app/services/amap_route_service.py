from app.models.schemas import ItineraryLeg

ROUTE_ENDPOINTS = {
    "walking": "/v5/direction/walking",
    "driving": "/v5/direction/driving",
    "transit": "/v5/direction/transit/integrated",
}


def decode_polyline(text: str) -> list[list[float]]:
    if not text:
        return []

    points: list[list[float]] = []
    for pair in text.split(";"):
        lon, lat = pair.split(",")
        points.append([float(lon), float(lat)])
    return points


def build_failed_leg(*, from_stop_id: str, to_stop_id: str, mode: str, mode_label: str, reason: str) -> ItineraryLeg:
    return ItineraryLeg(
        leg_id=f"{from_stop_id}:{to_stop_id}:{mode}",
        from_stop_id=from_stop_id,
        to_stop_id=to_stop_id,
        mode=mode,
        mode_label=mode_label,
        status="failed",
        failure_reason=reason,
    )


def normalize_amap_path(*, payload: dict, mode: str, mode_label: str, from_stop_id: str, to_stop_id: str) -> ItineraryLeg:
    route = payload.get("route") or {}
    paths = route.get("paths") or []
    path = paths[0] if paths else {}
    steps = path.get("steps") or []
    polyline = []
    for step in steps:
        polyline.extend(decode_polyline(step.get("polyline", "")))

    duration_seconds = int(((path.get("cost") or {}).get("duration")) or path.get("duration") or 0)
    return ItineraryLeg(
        leg_id=f"{from_stop_id}:{to_stop_id}:{mode}",
        from_stop_id=from_stop_id,
        to_stop_id=to_stop_id,
        mode=mode,
        mode_label=mode_label,
        duration_minutes=max(1, round(duration_seconds / 60)),
        distance_meters=int(path.get("distance") or 0),
        polyline=polyline,
        status="ready",
    )


def fetch_primary_leg(*, client, settings, origin: list[float], destination: list[float], from_stop_id: str, to_stop_id: str, mode: str, mode_label: str) -> ItineraryLeg:
    endpoint = ROUTE_ENDPOINTS[mode]
    response = client.get(
        f"{settings.amap_web_base_url}{endpoint}",
        params={
            "key": settings.amap_web_key,
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
        },
        timeout=20,
    )
    payload = response.json()
    paths = ((payload.get("route") or {}).get("paths")) or []
    if response.status_code != 200 or not paths:
        return build_failed_leg(
            from_stop_id=from_stop_id,
            to_stop_id=to_stop_id,
            mode=mode,
            mode_label=mode_label,
            reason=f"AMAP_{mode.upper()}_EMPTY",
        )

    return normalize_amap_path(
        payload=payload,
        mode=mode,
        mode_label=mode_label,
        from_stop_id=from_stop_id,
        to_stop_id=to_stop_id,
    )
