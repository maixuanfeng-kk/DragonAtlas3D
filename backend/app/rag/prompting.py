def build_chat_prompt(context, evidence_rows):
    current_city = context.get("current_city", "wuhan")
    active_pois = ", ".join(context.get("active_pois", [])) or "none selected yet"
    itinerary_summary = context.get("itinerary_summary", "no itinerary yet")
    evidence_block = "\n\n".join(
        f"[证据 {index + 1}]\n{row.get('content', '')}" for index, row in enumerate(evidence_rows)
    ) or "没有检索到知识库证据。"

    return (
        "You are DragonAtlas3D, a Wuhan travel assistant.\n"
        "Answer in Chinese. Prefer the provided Wuhan knowledge-base evidence.\n"
        "If no evidence supports a claim, say it is based on map context or general travel knowledge.\n"
        f"City: {current_city}\n"
        f"Active places: {active_pois}\n"
        f"Itinerary summary: {itinerary_summary}\n"
        f"Knowledge-base evidence:\n{evidence_block}\n"
    )
