export const TRAVEL_PLAN_DEFAULTS = {
  tripDays: 3,
  dayOrNightPreference: "balanced",
  interestTags: ["sightseeing", "street"],
};

export function createInitialTravelClarifyState() {
  return {
    status: "idle",
    questions: [],
    sourceStatus: [],
    uncertainty: null,
    error: "",
  };
}

export function createInitialTravelPlanState() {
  return {
    status: "idle",
    answer: "",
    selectedReasoning: "",
    itinerary: null,
    mapRouteDays: [],
    poiCards: [],
    sourceStatus: [],
    uncertainty: null,
    error: "",
  };
}
