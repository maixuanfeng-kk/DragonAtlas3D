def fuse_ranked_results(lexical, semantic, k=60):
    scores = {}

    for rank, item in enumerate(lexical, start=1):
        chunk_id = item["chunk_id"]
        scores.setdefault(chunk_id, {"chunk_id": chunk_id, "score": 0.0})
        scores[chunk_id]["score"] += 1.0 / (k + rank)

    for rank, item in enumerate(semantic, start=1):
        chunk_id = item["chunk_id"]
        scores.setdefault(chunk_id, {"chunk_id": chunk_id, "score": 0.0})
        scores[chunk_id]["score"] += 1.0 / (k + rank)

    return sorted(scores.values(), key=lambda item: item["score"], reverse=True)
