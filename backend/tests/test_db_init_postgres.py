from app.db import _build_init_statements


def test_build_init_statements_enables_vector_extension():
    statements = _build_init_statements()
    assert any("create extension if not exists vector" in item.lower() for item in statements)
