from app.models.schemas import RouteDay


def build_visit_order_polylines(itinerary: dict, poi_rows: list[dict]) -> list[RouteDay]:
    poi_by_id = {row["id"]: row for row in poi_rows if row.get("center")}
    result = []
    for day in itinerary.get("days", []):
        if day.get("stops"):
            coordinates = [stop["center"] for stop in day.get("stops", []) if stop.get("center")]
        else:
            coordinates = [poi_by_id[node_id]["center"] for node_id in day.get("nodes", []) if node_id in poi_by_id]
        result.append(RouteDay(day=day["day"], route_type="visit_order_polyline", coordinates=coordinates))
    return result
