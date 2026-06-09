import json

from app.services.llm.qwen_client import QwenClient


def test_qwen_client_uses_configured_timeout(monkeypatch):
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": json.dumps({"ok": True})}}]}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("app.services.llm.qwen_client.httpx.post", fake_post)

    client = QwenClient(api_key="test", base_url="https://example.com/v1", model="qwen-test", timeout_seconds=180)
    payload = client.complete_json("return json")

    assert payload["ok"] is True
    assert captured["url"] == "https://example.com/v1/chat/completions"
    assert captured["timeout"] == 180
