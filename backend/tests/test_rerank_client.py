from app.services.llm.rerank_client import RerankClient


def test_rerank_client_posts_to_reranks_endpoint(monkeypatch):
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "data": [
                    {"index": 1, "relevance_score": 0.95},
                    {"index": 0, "relevance_score": 0.61},
                ]
            }

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("app.services.llm.rerank_client.httpx.post", fake_post)

    client = RerankClient(
        api_key="test",
        base_url="https://dashscope.aliyuncs.com/compatible-api/v1",
        model="qwen3-rerank",
        timeout_seconds=30,
    )
    results = client.rerank("黄鹤楼有什么特点", ["A", "B"], top_n=2)

    assert results[0]["index"] == 1
    assert captured["url"] == "https://dashscope.aliyuncs.com/compatible-api/v1/reranks"
    assert captured["json"]["model"] == "qwen3-rerank"
    assert captured["json"]["top_n"] == 2
