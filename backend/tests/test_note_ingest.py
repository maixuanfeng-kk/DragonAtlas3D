from pathlib import Path

from app.services.note_ingest import load_note_records, normalize_note_records


def test_load_note_records_reads_jsonl(tmp_path: Path):
    source = tmp_path / "notes.jsonl"
    source.write_text('{"note_id":"1","title":"东湖","desc":"适合散步"}\n', encoding="utf-8")

    rows = load_note_records([source])

    assert len(rows) == 1
    assert rows[0]["note_id"] == "1"


def test_normalize_note_records_selects_known_fields():
    rows = normalize_note_records([{"note_id": "1", "title": "东湖", "desc": "适合散步", "extra": "ignored"}])
    assert rows == [
        {
            "note_id": "1",
            "title": "东湖",
            "desc": "适合散步",
            "tag_list": "",
            "liked_count": "",
            "collected_count": "",
            "comment_count": "",
            "share_count": "",
            "note_url": "",
            "source_keyword": "",
        }
    ]
