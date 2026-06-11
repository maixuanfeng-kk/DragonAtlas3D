from app.services.amap_route_service import build_failed_leg
from app.services.city_itinerary_planner import build_city_day_plan


def test_build_city_day_plan_returns_stops_and_legs():
    poi_rows = [
        {"id": "jianghan-road", "name": "Jianghan Road", "category": "business_area", "center": [114.291, 30.581]},
        {"id": "yellow-crane-tower", "name": "Yellow Crane Tower", "category": "sightseeing", "center": [114.306, 30.547]},
        {"id": "donghu", "name": "Donghu", "category": "sightseeing", "center": [114.419, 30.560]},
    ]
    fake_legs = {
        ("jianghan-road", "yellow-crane-tower"): build_failed_leg(
            from_stop_id="jianghan-road",
            to_stop_id="yellow-crane-tower",
            mode="walking",
            mode_label="Walking",
            reason="TEST_ONLY",
        ),
        ("yellow-crane-tower", "donghu"): build_failed_leg(
            from_stop_id="yellow-crane-tower",
            to_stop_id="donghu",
            mode="walking",
            mode_label="Walking",
            reason="TEST_ONLY",
        ),
    }

    itinerary = build_city_day_plan(
        context={"trip_days": 3, "day_or_night_preference": "balanced"},
        poi_rows=poi_rows,
        leg_lookup=fake_legs,
    )

    assert itinerary.days[0].stops[0].stop_id == "yellow-crane-tower"
    assert itinerary.days[0].legs[0].from_stop_id == "yellow-crane-tower"
    assert itinerary.days[0].legs[0].status == "failed"
    assert itinerary.days[0].stops[0].arrival_time == "09:30"


def test_build_city_day_plan_uses_night_preference_to_frontload_street_content():
    poi_rows = [
        {"id": "donghu", "name": "Donghu", "category": "sightseeing", "center": [114.419, 30.560]},
        {"id": "jianghan-road", "name": "Jianghan Road", "category": "business_area", "center": [114.291, 30.581]},
    ]
    fake_legs = {
        ("jianghan-road", "donghu"): build_failed_leg(
            from_stop_id="jianghan-road",
            to_stop_id="donghu",
            mode="walking",
            mode_label="Walking",
            reason="TEST_ONLY",
        )
    }

    itinerary = build_city_day_plan(
        context={"trip_days": 3, "day_or_night_preference": "night"},
        poi_rows=poi_rows,
        leg_lookup=fake_legs,
    )

    assert itinerary.days[0].stops[0].stop_id == "jianghan-road"
