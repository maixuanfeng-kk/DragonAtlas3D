def summarize_trends(notes: list[dict], llm_client=None) -> dict:
    titles = [row.get("title", "").strip() for row in notes if row.get("title")]
    tags = [row.get("tag_list", "") for row in notes if row.get("tag_list")]
    if llm_client is not None:
        payload = llm_client.complete_json(build_trend_prompt(notes))
        return {
            "city": "wuhan",
            "summary": payload.get("summary", ""),
            "areas": payload.get("areas", []),
            "notes_used": [row.get("note_id", "") for row in notes],
        }
    summary = "；".join(titles[:3]) if titles else "武汉本地趋势内容尚未形成摘要。"
    return {
        "city": "wuhan",
        "summary": summary,
        "areas": tags[:5],
        "notes_used": [row.get("note_id", "") for row in notes],
    }


def build_trend_prompt(notes: list[dict]) -> str:
    lines = []
    for row in notes[:12]:
        lines.append(f"- {row.get('title', '')} | {row.get('desc', '')} | {row.get('tag_list', '')}")
    return (
        "你是武汉旅游内容分析器。请从下面的本地旅游笔记中总结热门玩法、重点区域和适合白天/夜晚的趋势，"
        "并返回 JSON 对象，字段包含 summary 和 areas。\n" + "\n".join(lines)
    )
