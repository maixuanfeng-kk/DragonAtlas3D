import httpx


class RerankClient:
    def __init__(self, api_key: str, base_url: str, model: str, timeout_seconds: int = 60):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    def rerank(self, query: str, documents: list[str], top_n: int = 5) -> list[dict]:
        response = httpx.post(
            f"{self.base_url}/reranks",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "query": query,
                "documents": documents,
                "top_n": top_n,
            },
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        return response.json().get("results", [])
