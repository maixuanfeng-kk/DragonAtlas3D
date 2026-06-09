import json
from pathlib import Path


def load_note_records(paths: list[str | Path]) -> list[dict]:
    rows: list[dict] = []
    for raw_path in paths:
        path = Path(raw_path)
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            rows.append(json.loads(line))
    return rows


def normalize_note(row: dict) -> dict:
    return {
        "note_id": row.get("note_id", ""),
        "title": row.get("title", ""),
        "desc": row.get("desc", ""),
        "tag_list": row.get("tag_list", ""),
        "liked_count": row.get("liked_count", ""),
        "collected_count": row.get("collected_count", ""),
        "comment_count": row.get("comment_count", ""),
        "share_count": row.get("share_count", ""),
        "note_url": row.get("note_url", ""),
        "source_keyword": row.get("source_keyword", ""),
    }


def normalize_note_records(rows: list[dict]) -> list[dict]:
    return [normalize_note(row) for row in rows]
