import os
from pathlib import Path
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
TEST_DB_PATH = ROOT / f"test_travel_agent_{uuid4().hex}.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB_PATH.as_posix()}")

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
