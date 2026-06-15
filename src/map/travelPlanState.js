export const TRAVEL_PLAN_DEFAULTS = {
  tripDays: 1,
  dayOrNightPreference: "balanced",
  interestTags: ["sightseeing", "street"],
};

export function createInitialTravelClarifyState() {
  return {
    status: "idle",
    questions: [],
    sourceStatus: [],
    uncertainty: null,
    thinkingSteps: [],
    error: "",
  };
}

export function createInitialTravelPlanState() {
  return {
    status: "idle",
    answer: "",
    selectedReasoning: "",
    itinerary: null,
    days: [],
    activeDay: 1,
    activeStopId: "",
    activeLegId: "",
    mapRouteDays: [],
    poiCards: [],
    sourceStatus: [],
    uncertainty: null,
    thinkingSteps: [],
    error: "",
  };
}
