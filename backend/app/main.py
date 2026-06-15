import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health_router, poi_router, source_status_router, travel_router
from app.api.chat import router as chat_router
from app.db import init_db

# ── Agent logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("agent").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="DragonAtlas3D Travel Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router, prefix="/api")
app.include_router(poi_router, prefix="/api")
app.include_router(source_status_router, prefix="/api")
app.include_router(travel_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
