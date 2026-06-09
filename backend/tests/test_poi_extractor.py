from app.services.poi_extractor import build_poi_prompt, extract_poi_candidates, slugify_name
from app.services.poi_registry import merge_seed_and_extracted_nodes


class FakeLlmClient:
    def __init__(self):
        self.prompts = []

    def complete_json(self, prompt: str) -> dict:
        self.prompts.append(prompt)
        return {
            "pois": [
                {
                    "name": "东湖",
                    "node_type": "area",
                    "category": "lake",
                    "district": "武昌区",
                    "tags": ["散步", "湖景"],
                    "reason_summary": "高频出现的武汉休闲区域",
                    "confidence": 0.84,
                    "source_note_ids": ["note-1", "note-2"],
                }
            ]
        }


class FakeBatchLlmClient:
    def __init__(self):
        self.prompts = []

    def complete_json(self, prompt: str) -> dict:
        self.prompts.append(prompt)
        if len(self.prompts) == 1:
            return {
                "pois": [
                    {
                        "name": "凌波门",
                        "node_type": "poi",
                        "category": "spot",
                        "district": "武昌区",
                        "tags": ["拍照", "江景"],
                        "reason_summary": "本地笔记高频出现的江边打卡点。",
                        "confidence": 0.88,
                        "source_note_ids": ["note-1"],
                    },
                    {
                        "name": "东湖",
                        "node_type": "area",
                        "category": "lake",
                        "district": "武昌区",
                        "tags": ["骑行"],
                        "reason_summary": "经典武汉湖景休闲区域。",
                        "confidence": 0.86,
                        "source_note_ids": ["note-1"],
                    },
                ]
            }
        return {
            "pois": [
                {
                    "name": "凌波门",
                    "node_type": "poi",
                    "category": "spot",
                    "district": "武昌区",
                    "tags": ["日落"],
                    "reason_summary": "第二批笔记继续提到这个点位。",
                    "confidence": 0.8,
                    "source_note_ids": ["note-7"],
                },
                {
                    "name": "粮道街",
                    "node_type": "area",
                    "category": "food_street",
                    "district": "武昌区",
                    "tags": ["过早", "小吃"],
                    "reason_summary": "典型武汉美食街区。",
                    "confidence": 0.82,
                    "source_note_ids": ["note-7"],
                },
            ]
        }


def test_extract_poi_candidates_sets_auto_extracted_status():
    notes = [{"note_id": "note-1", "title": "东湖适合散步", "desc": "晚上也舒服"}]

    rows = extract_poi_candidates(notes, FakeLlmClient())

    assert rows[0]["status"] == "auto_extracted"
    assert rows[0]["source_count"] == 2


def test_merge_seed_and_extracted_nodes_keeps_seed_coordinates():
    seed = [{"id": "donghu", "name": "东湖", "node_type": "area", "center": [114.419, 30.560], "coordinate_status": "verified_seed"}]
    extracted = [{"id": "donghu", "name": "东湖", "node_type": "area", "confidence": 0.84, "status": "auto_extracted"}]

    rows = merge_seed_and_extracted_nodes(seed, extracted)

    assert rows[0]["center"] == [114.419, 30.560]
    assert rows[0]["coordinate_status"] == "verified_seed"


def test_slugify_name_uses_stable_hash_for_non_ascii_names():
    value = slugify_name("凌波门")

    assert value.startswith("poi-")
    assert value != "poi"


def test_build_poi_prompt_limits_note_count_and_trims_long_desc():
    long_desc = "东湖" * 300
    notes = [{"note_id": f"note-{index}", "title": "武汉旅游", "desc": long_desc} for index in range(8)]

    prompt = build_poi_prompt(notes)

    assert "note-6" not in prompt
    assert len(prompt) < 2600


def test_extract_poi_candidates_batches_and_dedupes_non_seed_candidates():
    notes = [
        {"note_id": f"note-{index}", "title": "武汉旅游", "desc": f"笔记 {index} 提到凌波门和粮道街"}
        for index in range(8)
    ]

    rows = extract_poi_candidates(notes, FakeBatchLlmClient())
    row_ids = [row["id"] for row in rows]

    assert len(rows) == 3
    assert len(set(row_ids)) == 3
    assert any(row["name"] == "凌波门" for row in rows)
