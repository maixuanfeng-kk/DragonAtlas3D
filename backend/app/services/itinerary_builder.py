from app.models.schemas import Itinerary, ItineraryDay


def build_single_best_itinerary(context: dict, poi_rows: list[dict]) -> Itinerary:
    trip_days = int(context.get("trip_days") or context.get("answers", {}).get("trip_days_confirm", 3) or 3)
    trip_days = max(3, min(5, trip_days))
    if not poi_rows:
        poi_rows = [
            {"id": "donghu"},
            {"id": "yellow-crane-tower"},
            {"id": "jianghan-road"},
        ]
    cycle = [row["id"] for row in poi_rows]
    days = []
    for index in range(trip_days):
        summary = f"第 {index + 1} 天围绕 {cycle[index % len(cycle)]} 展开"
        ordered = cycle[index:] + cycle[:index]
        days.append(ItineraryDay(day=index + 1, summary=summary, nodes=ordered[: min(3, len(ordered))]))
    return Itinerary(title=f"武汉 {trip_days} 天单城市深度游路线", days=days)
