import json
from typing import Any

import httpx


class QwenClient:
    def __init__(self, api_key: str, base_url: str, model: str, timeout_seconds: int = 180):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    def _post(self, payload: dict) -> dict:
        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload,
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()

    def complete_json(self, prompt: str) -> dict:
        """Single-turn JSON completion. 用于 POI 抽取等结构化输出场景。"""
        payload = self._post({
            "model": self.model,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": prompt}],
        })
        content = payload["choices"][0]["message"]["content"]
        return json.loads(content)

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict] | None = None,
        tool_choice: str = "auto",
    ) -> dict:
        """Multi-turn chat completion with optional tool calling.

        Args:
            messages: OpenAI-format messages list.
            tools: OpenAI-format tool definitions. Qwen 兼容 OpenAI function calling 协议.
            tool_choice: "auto", "none", or a specific tool choice dict.

        Returns:
            The assistant message dict with optional tool_calls.
        """
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice

        raw = self._post(payload)
        return raw["choices"][0]["message"]

    def chat_text(
        self,
        messages: list[dict[str, Any]],
        system: str = "",
    ) -> str:
        """Simple text-only chat, returns the content string."""
        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.extend(messages)

        raw = self._post({
            "model": self.model,
            "messages": full_messages,
        })
        return raw["choices"][0]["message"].get("content", "")
