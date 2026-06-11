from types import SimpleNamespace

from app.services.amap_route_service import build_failed_leg, fetch_primary_leg, normalize_amap_path


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def get(self, url, params, timeout):
        self.calls.append({"url": url, "params": params, "timeout": timeout})
        return self.response


def test_select_primary_leg_normalizes_a_walking_route():
    payload = {
        "route": {
            "paths": [
                {
                    "distance": "1280",
                    "cost": {"duration": "1080"},
                    "steps": [{"polyline": "114.1,30.1;114.2,30.2"}],
                }
            ]
        }
    }

    leg = normalize_amap_path(
        payload=payload,
        mode="walking",
        mode_label="Walking",
        from_stop_id="jianghan-road",
        to_stop_id="yellow-crane-tower",
    )

    assert leg.mode == "walking"
    assert leg.duration_minutes == 18
    assert leg.distance_meters == 1280
    assert leg.polyline == [[114.1, 30.1], [114.2, 30.2]]
    assert leg.status == "ready"


def test_failed_leg_keeps_reason_without_fake_polyline():
    leg = build_failed_leg(
        from_stop_id="a",
        to_stop_id="b",
        mode="transit",
        mode_label="Transit",
        reason="AMAP_TRANSIT_EMPTY",
    )

    assert leg.status == "failed"
    assert leg.failure_reason == "AMAP_TRANSIT_EMPTY"
    assert leg.polyline == []


def test_fetch_primary_leg_calls_amap_walking_endpoint_and_returns_ready_leg():
    client = FakeClient(
        FakeResponse(
            200,
            {
                "route": {
                    "paths": [
                        {
                            "distance": "820",
                            "duration": "660",
                            "steps": [{"polyline": "114.3,30.5;114.31,30.51"}],
                        }
                    ]
                }
            },
        )
    )
    settings = SimpleNamespace(amap_web_key="demo-key", amap_web_base_url="https://restapi.amap.com")

    leg = fetch_primary_leg(
        client=client,
        settings=settings,
        origin=[114.3, 30.5],
        destination=[114.31, 30.51],
        from_stop_id="jianghan-road",
        to_stop_id="yellow-crane-tower",
        mode="walking",
        mode_label="Walking",
    )

    assert leg.status == "ready"
    assert leg.distance_meters == 820
    assert client.calls[0]["url"] == "https://restapi.amap.com/v5/direction/walking"
    assert client.calls[0]["params"]["origin"] == "114.3,30.5"
    assert client.calls[0]["params"]["destination"] == "114.31,30.51"


def test_fetch_primary_leg_returns_failed_leg_when_route_payload_is_empty():
    client = FakeClient(FakeResponse(200, {"route": {"paths": []}}))
    settings = SimpleNamespace(amap_web_key="demo-key", amap_web_base_url="https://restapi.amap.com")

    leg = fetch_primary_leg(
        client=client,
        settings=settings,
        origin=[114.3, 30.5],
        destination=[114.31, 30.51],
        from_stop_id="jianghan-road",
        to_stop_id="yellow-crane-tower",
        mode="walking",
        mode_label="Walking",
    )

    assert leg.status == "failed"
    assert leg.failure_reason == "AMAP_WALKING_EMPTY"


def test_fetch_primary_leg_returns_failed_leg_when_key_is_missing():
    client = FakeClient(FakeResponse(200, {"route": {"paths": []}}))
    settings = SimpleNamespace(amap_web_key="", amap_web_base_url="https://restapi.amap.com")

    leg = fetch_primary_leg(
        client=client,
        settings=settings,
        origin=[114.3, 30.5],
        destination=[114.31, 30.51],
        from_stop_id="jianghan-road",
        to_stop_id="yellow-crane-tower",
        mode="walking",
        mode_label="Walking",
    )

    assert leg.status == "failed"
    assert leg.failure_reason == "AMAP_WEB_KEY_MISSING"
    assert client.calls == []
