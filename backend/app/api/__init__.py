from app.api.health import router as health_router
from app.api.poi import router as poi_router
from app.api.source_status import router as source_status_router
from app.api.travel import router as travel_router

__all__ = [
    "health_router",
    "poi_router",
    "source_status_router",
    "travel_router",
]
