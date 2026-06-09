from datetime import UTC, datetime
import hashlib
import re

NOTE_BATCH_SIZE = 4
MAX_PROMPT_NOTES = 4
MAX_TITLE_CHARS = 60
MAX_DESC_CHARS = 220
MAX_TAG_CHARS = 80
MAX_RETURN_POIS = 6


DEFAULT_CANDIDATES = [
    {
        "name": "东湖",
        "node_type": "area",
        "category": "lake",
        "district": "武昌区",
        "tags": ["湖景", "散步", "骑行"],
        "reason_summary": "武汉高频出现的湖景休闲区域。",
    },
    {
        "name": "江汉路",
        "node_type": "area",
        "category": "street",
        "district": "江汉区",
        "tags": ["夜游", "商业街", "美食"],
        "reason_summary": "武汉高频出现的夜游和商业街区。",
    },
    {
        "name": "黄鹤楼",
        "node_type": "poi",
        "category": "landmark",
        "district": "武昌区",
        "tags": ["地标", "城市视野"],
        "reason_summary": "武汉城市地标，常见于经典路线。",
    },
]


def slugify_name(name: str) -> str:
    if name == "东湖":
        return "donghu"
    if name == "江汉路":
        return "jianghan-road"
    if name == "黄鹤楼":
        return "yellow-crane-tower"
    normalized = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if normalized:
        return normalized
    digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:10]
    return f"poi-{digest}"


def trim_text(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars]}..."


def build_note_line(row: dict) -> str:
    note_id = str(row.get("note_id", "")).strip()
    title = trim_text(str(row.get("title", "")).strip(), MAX_TITLE_CHARS)
    desc = trim_text(str(row.get("desc", "")).strip().replace("\n", " "), MAX_DESC_CHARS)
    tags = trim_text(str(row.get("tag_list", "")).strip(), MAX_TAG_CHARS)
    return f"- note_id={note_id} | title={title} | desc={desc} | tags={tags}"


def build_poi_prompt(notes: list[dict]) -> str:
    lines = [build_note_line(row) for row in notes[:MAX_PROMPT_NOTES]]
    return (
        "你是武汉旅游 POI 抽取器。"
        "请只根据输入笔记提取武汉旅游相关的候选 POI 或区域，并返回 JSON 对象。"
        "顶层字段必须是 pois。"
        "每个 POI 只能包含 name、node_type、category、district、tags、reason_summary、confidence、source_note_ids。"
        f"最多返回 {MAX_RETURN_POIS} 个去重候选。"
        "node_type 只能是 poi 或 area。"
        "name 必须直接来自笔记内容，不要杜撰。"
        "district 不确定时填空字符串。"
        "source_note_ids 只能填写当前笔记批次内真实出现的 note_id。"
        "如果没有明确候选，返回 {\"pois\": []}。\n"
        + "\n".join(lines)
    )


def infer_candidates_from_notes(notes: list[dict]) -> list[dict]:
    text = "\n".join(f"{row.get('title', '')}\n{row.get('desc', '')}\n{row.get('tag_list', '')}" for row in notes)
    candidates = []
    for candidate in DEFAULT_CANDIDATES:
        if candidate["name"] in text:
            candidates.append(candidate)
    return candidates or DEFAULT_CANDIDATES[:2]


def normalize_node_type(raw_value: str) -> str:
    value = str(raw_value or "").strip().lower()
    if value in {"area", "district", "street", "zone", "region", "block", "neighborhood"}:
        return "area"
    return "poi"


def unique_values(values: list[str]) -> list[str]:
    unique = []
    seen = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        unique.append(text)
    return unique


def batched_notes(notes: list[dict], batch_size: int = NOTE_BATCH_SIZE) -> list[list[dict]]:
    return [notes[index : index + batch_size] for index in range(0, len(notes), batch_size)]


def dedupe_raw_items(raw_items: list[dict]) -> list[dict]:
    deduped: dict[str, dict] = {}
    for item in raw_items:
        name = str(item.get("name", "")).strip()
        if not name:
            continue

        row_id = slugify_name(name)
        normalized = {
            "name": name,
            "node_type": normalize_node_type(item.get("node_type", "")),
            "category": str(item.get("category", "")).strip() or "unknown",
            "district": str(item.get("district", "")).strip(),
            "tags": unique_values(item.get("tags", [])),
            "reason_summary": str(item.get("reason_summary", "")).strip(),
            "confidence": float(item.get("confidence", 0.0)),
            "source_note_ids": unique_values(item.get("source_note_ids", [])),
        }

        existing = deduped.get(row_id)
        if not existing:
            deduped[row_id] = {"id": row_id, **normalized}
            continue

        existing["tags"] = unique_values([*existing["tags"], *normalized["tags"]])
        existing["source_note_ids"] = unique_values([*existing["source_note_ids"], *normalized["source_note_ids"]])
        existing["confidence"] = max(existing["confidence"], normalized["confidence"])
        if len(normalized["reason_summary"]) > len(existing["reason_summary"]):
            existing["reason_summary"] = normalized["reason_summary"]
        if not existing["district"] and normalized["district"]:
            existing["district"] = normalized["district"]
        if existing["category"] == "unknown" and normalized["category"] != "unknown":
            existing["category"] = normalized["category"]
        if existing["node_type"] != "area" and normalized["node_type"] == "area":
            existing["node_type"] = "area"

    return list(deduped.values())


def extract_poi_candidates(notes: list[dict], llm_client=None) -> list[dict]:
    now = datetime.now(UTC)
    if llm_client is not None:
        raw_items = []
        for batch in batched_notes(notes):
            payload = llm_client.complete_json(build_poi_prompt(batch))
            raw_items.extend(payload.get("pois", []))
        raw_items = dedupe_raw_items(raw_items)
    else:
        raw_items = []
        note_ids = [row.get("note_id", "") for row in notes[:6] if row.get("note_id")]
        for candidate in infer_candidates_from_notes(notes):
            raw_items.append(
                {
                    **candidate,
                    "confidence": 0.8,
                    "source_note_ids": note_ids[: max(1, min(3, len(note_ids)))],
                }
            )

    rows = []
    for item in raw_items:
        source_note_ids = item.get("source_note_ids", [])
        rows.append(
            {
                "id": item.get("id") or slugify_name(item["name"]),
                "name": item["name"],
                "node_type": normalize_node_type(item.get("node_type", "")),
                "category": item.get("category", "unknown"),
                "district": item.get("district", ""),
                "tags": item.get("tags", []),
                "reason_summary": item.get("reason_summary", ""),
                "recommended_time": item.get("recommended_time", ""),
                "visit_period": item.get("visit_period", ""),
                "confidence": float(item.get("confidence", 0.0)),
                "source_note_ids": source_note_ids,
                "source_count": len(source_note_ids),
                "status": "auto_extracted",
                "created_at": now,
                "updated_at": now,
            }
        )
    return rows
