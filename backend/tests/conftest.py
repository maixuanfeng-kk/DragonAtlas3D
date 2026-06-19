import os
from pathlib import Path
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
TEST_DB_PATH = ROOT / f"test_travel_agent_{uuid4().hex}.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB_PATH.as_posix()}")
os.environ.setdefault("QWEN_API_KEY", "")
os.environ.setdefault("QWEN_BASE_URL", "")
os.environ.setdefault("QWEN_MODEL", "")
os.environ.setdefault("EMBEDDING_API_KEY", "")
os.environ.setdefault("EMBEDDING_BASE_URL", "")
os.environ.setdefault("EMBEDDING_MODEL", "")
os.environ.setdefault("RERANK_API_KEY", "")
os.environ.setdefault("RERANK_BASE_URL", "")
os.environ.setdefault("RERANK_MODEL", "")

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
