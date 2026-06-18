from app.services.llm.embedding_client import EmbeddingClient


def test_embedding_client_posts_to_embeddings_endpoint(monkeypatch):
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"embedding": [0.1, 0.2, 0.3]}]}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("app.services.llm.embedding_client.httpx.post", fake_post)

    client = EmbeddingClient(
        api_key="test",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="text-embedding-v4",
        dimensions=1024,
        timeout_seconds=30,
    )
    vectors = client.embed_texts(["黄鹤楼"])

    assert vectors == [[0.1, 0.2, 0.3]]
    assert captured["url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"
    assert captured["json"]["model"] == "text-embedding-v4"
    assert captured["json"]["dimensions"] == 1024
