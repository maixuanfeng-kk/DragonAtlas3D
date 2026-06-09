from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SourceState = Literal["pending", "ready", "partial", "failed"]
NodeType = Literal["poi", "area"]
PreferenceBias = Literal["day", "night", "balanced"]


class SourceStatus(BaseModel):
    source_id: str
    source_label: str
    status: SourceState
    fetched_at: datetime | None = None
    stale_at: datetime | None = None
    error: str = ""
    coverage_note: str = ""
    provenance: str = ""


class SelectedNode(BaseModel):
    id: str
    name: str
    node_type: NodeType
    center: list[float] | None = None


class FollowUpQuestion(BaseModel):
    id: str
    label: str
    type: Literal["single_select"] = "single_select"
    options: list[str] = Field(default_factory=list)


class Uncertainty(BaseModel):
    level: SourceState
    message: str
    items: list[str] = Field(default_factory=list)


class TravelClarifyRequest(BaseModel):
    thread_id: str
    current_city: str = Field(pattern="^wuhan$")
    selected_nodes: list[SelectedNode] = Field(min_length=1, max_length=3)
    trip_days: int = Field(ge=3, le=5)
    day_or_night_preference: PreferenceBias
    interest_tags: list[str] = Field(min_length=1)


class TravelClarifyResponse(BaseModel):
    thread_id: str
    selected_nodes: list[SelectedNode]
    follow_up_questions: list[FollowUpQuestion]
    source_status: list[SourceStatus]
    uncertainty: Uncertainty


class TravelPlanRequest(TravelClarifyRequest):
    answers: dict[str, str] = Field(default_factory=dict)


class PoiCard(BaseModel):
    id: str
    name: str
    node_type: NodeType
    category: str
    district: str = ""
    center: list[float] | None = None
    coordinate_status: str = "partial"
    tags: list[str] = Field(default_factory=list)
    reason_summary: str = ""
    recommended_time: str = ""
    visit_period: str = ""
    confidence: float = 0.0
    source_count: int = 0
    source_note_ids: list[str] = Field(default_factory=list)
    status: str = "auto_extracted"


class ItineraryDay(BaseModel):
    day: int
    summary: str = ""
    nodes: list[str] = Field(default_factory=list)


class Itinerary(BaseModel):
    title: str
    days: list[ItineraryDay] = Field(default_factory=list)


class RouteDay(BaseModel):
    day: int
    route_type: Literal["visit_order_polyline"]
    coordinates: list[list[float]] = Field(default_factory=list)


class TravelPlanResponse(BaseModel):
    thread_id: str
    answer: str
    selected_reasoning: str
    itinerary: Itinerary
    map_route_days: list[RouteDay]
    poi_cards: list[PoiCard]
    source_status: list[SourceStatus]
    uncertainty: Uncertainty
    follow_up_questions: list[FollowUpQuestion] = Field(default_factory=list)


class PoiExtractRequest(BaseModel):
    city: str = Field(pattern="^wuhan$")
    source_paths: list[str] = Field(default_factory=list)


class PoiExtractResponse(BaseModel):
    city: str
    job_status: SourceState
    notes_loaded: int
    pois_extracted: int
    pois_seed_matched: int
    pois_coordinate_partial: int
    source_status: list[SourceStatus]


class PoiListResponse(BaseModel):
    items: list[PoiCard]
    total: int


class SourceStatusListResponse(BaseModel):
    items: list[SourceStatus]
