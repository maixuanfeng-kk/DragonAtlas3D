from app.models.schemas import Itinerary, ItineraryDay, ItineraryLeg, ItineraryStop
from app.services.amap_route_service import build_failed_leg


def format_clock(total_minutes: int) -> str:
    hour = total_minutes // 60
    minute = total_minutes % 60
    return f"{hour:02d}:{minute:02d}"


def suggested_dwell_minutes(category: str) -> int:
    return {
        "sightseeing": 90,
        "landmark": 90,
        "lake": 120,
        "business_area": 75,
        "street": 75,
        "station": 30,
    }.get(category, 60)


def sort_city_pois(poi_rows: list[dict], preference: str) -> list[dict]:
    if preference == "night":
        return sorted(poi_rows, key=lambda row: 0 if row.get("category") in {"business_area", "street"} else 1)
    return sorted(poi_rows, key=lambda row: 0 if row.get("category") in {"sightseeing", "landmark", "lake"} else 1)


def build_city_day_plan(*, context: dict, poi_rows: list[dict], leg_lookup: dict[tuple[str, str], ItineraryLeg]) -> Itinerary:
    ordered = sort_city_pois(poi_rows, context.get("day_or_night_preference", "balanced"))
    stops: list[ItineraryStop] = []
    legs: list[ItineraryLeg] = []
    current_minutes = 9 * 60 + 30

    for index, row in enumerate(ordered):
        dwell_minutes = suggested_dwell_minutes(row.get("category", "unknown"))
        arrival = format_clock(current_minutes)
        departure = format_clock(current_minutes + dwell_minutes)
        stops.append(
            ItineraryStop(
                stop_id=row["id"],
                name=row["name"],
                place_type=row.get("category", "unknown"),
                center=row["center"],
                arrival_time=arrival,
                departure_time=departure,
                dwell_minutes=dwell_minutes,
                reason=row.get("reason_summary", f"Arrange city time around {row['name']}."),
            )
        )
        if index < len(ordered) - 1:
            next_row = ordered[index + 1]
            leg = leg_lookup.get((row["id"], next_row["id"]))
            if not leg:
                leg = build_failed_leg(
                    from_stop_id=row["id"],
                    to_stop_id=next_row["id"],
                    mode="walking",
                    mode_label="Walking",
                    reason="LEG_NOT_PRECOMPUTED",
                )
            else:
                leg = leg.model_copy()
            leg.departure_time = departure
            leg.arrival_time = format_clock(current_minutes + dwell_minutes + (leg.duration_minutes or 0))
            legs.append(leg)
            current_minutes += dwell_minutes + (leg.duration_minutes or 0)
        else:
            current_minutes += dwell_minutes

    return Itinerary(
        title="Wuhan city itinerary",
        days=[
            ItineraryDay(
                day=1,
                title="Day 1",
                summary="Same-city ordered visit plan",
                stops=stops,
                legs=legs,
            )
        ],
    )
