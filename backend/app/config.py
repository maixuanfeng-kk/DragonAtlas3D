from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/dragonatlas3d"
    note_source_paths: str = ""
    amap_web_key: str = ""
    amap_web_base_url: str = "https://restapi.amap.com"
    qwen_api_key: str = ""
    qwen_base_url: str = ""
    qwen_model: str = "qwen3.6-plus"
    qwen_timeout_seconds: int = 180
    embedding_base_url: str = ""
    embedding_api_key: str = ""
    embedding_model: str = ""
    embedding_dimensions: int = 1024
    rerank_base_url: str = ""
    rerank_api_key: str = ""
    rerank_model: str = ""
    rerank_top_n: int = 5
    rag_retrieval_candidates: int = 20
    rag_top_k: int = 8

    def note_paths(self) -> list[Path]:
        raw_items = [item.strip() for chunk in self.note_source_paths.splitlines() for item in chunk.split(";")]
        return [Path(item) for item in raw_items if item]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
