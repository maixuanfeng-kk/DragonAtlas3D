import { startTransition, useState } from "react";
import { postTravelClarify, postTravelPlan } from "./api/travelAgentClient.js";
import { normalizePlanDays, selectDayFromPlan } from "./map/detailMapItineraryModel.js";
import { createInitialTravelClarifyState, createInitialTravelPlanState, TRAVEL_PLAN_DEFAULTS } from "./map/travelPlanState.js";
import { addTravelSelection, buildTravelRequestPayload, removeTravelSelection } from "./map/travelSelection.js";

export function useTravelPlanner(setNotice) {
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [tripDays, setTripDays] = useState(TRAVEL_PLAN_DEFAULTS.tripDays);
  const [dayOrNightPreference, setDayOrNightPreference] = useState(TRAVEL_PLAN_DEFAULTS.dayOrNightPreference);
  const [interestTags, setInterestTags] = useState(TRAVEL_PLAN_DEFAULTS.interestTags);
  const [clarifyState, setClarifyState] = useState(createInitialTravelClarifyState());
  const [planState, setPlanState] = useState(createInitialTravelPlanState());

  const addCurrentSelection = (node) => {
    setSelectedNodes((current) => addTravelSelection(current, node));
    setNotice("已加入当前行程候选。");
  };

  const removeSelection = (id) => {
    setSelectedNodes((current) => removeTravelSelection(current, id));
  };

  const clearSelection = () => {
    setSelectedNodes([]);
    setClarifyState(createInitialTravelClarifyState());
    setPlanState(createInitialTravelPlanState());
  };

  const handleClarify = async () => {
    if (selectedNodes.length < 2) {
      setNotice("请先加入 2-5 个地点，再生成追问。");
      return;
    }

    setClarifyState((current) => ({ ...current, status: "pending", error: "" }));

    try {
      const response = await postTravelClarify(
        buildTravelRequestPayload({
          selectedNodes,
          tripDays,
          dayOrNightPreference,
          interestTags,
        }),
      );

      startTransition(() => {
        setClarifyState({
          status: "ready",
          questions: response.follow_up_questions || [],
          sourceStatus: response.source_status || [],
          uncertainty: response.uncertainty || null,
          error: "",
        });
      });
      setNotice("旅行 Agent 已生成一轮追问。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "旅行 Agent 追问生成失败";
      setClarifyState((current) => ({ ...current, status: "failed", error: message }));
      setNotice(message);
    }
  };

  const handlePlan = async () => {
    if (selectedNodes.length < 2) {
      setNotice("请先加入 2-5 个地点，再生成路线。");
      return;
    }

    setPlanState((current) => ({ ...current, status: "pending", error: "" }));

    try {
      const response = await postTravelPlan(
        buildTravelRequestPayload({
          selectedNodes,
          tripDays,
          dayOrNightPreference,
          interestTags,
          answers: {
            trip_days_confirm: String(tripDays),
            time_bias: dayOrNightPreference,
          },
        }),
      );
      const normalizedPlan = normalizePlanDays(response);
      startTransition(() => {
        setPlanState({
          status: "ready",
          answer: response.answer || "",
          selectedReasoning: response.selected_reasoning || "",
          itinerary: response.itinerary || null,
          days: normalizedPlan.days,
          activeDay: normalizedPlan.activeDay,
          activeStopId: normalizedPlan.days[0]?.stops?.[0]?.stop_id || "",
          activeLegId: normalizedPlan.days[0]?.legs?.[0]?.leg_id || "",
          mapRouteDays: response.map_route_days || [],
          poiCards: response.poi_cards || [],
          sourceStatus: response.source_status || [],
          uncertainty: response.uncertainty || null,
          error: "",
        });
      });
      setNotice("城市内路线方案已生成。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "旅行路线生成失败";
      setPlanState((current) => ({ ...current, status: "failed", error: message }));
      setNotice(message);
    }
  };

  const setActiveDay = (requestedDay) => {
    setPlanState((current) => {
      const activeDay = selectDayFromPlan({ requestedDay, days: current.days });
      const activePlan = current.days.find((day) => day.day === activeDay) || current.days[0] || null;
      return {
        ...current,
        activeDay,
        activeStopId: activePlan?.stops?.[0]?.stop_id || "",
        activeLegId: activePlan?.legs?.[0]?.leg_id || "",
      };
    });
  };

  const setActiveStopId = (stopId) => {
    setPlanState((current) => ({ ...current, activeStopId: stopId || "" }));
  };

  const setActiveLegId = (legId) => {
    setPlanState((current) => ({ ...current, activeLegId: legId || "" }));
  };

  return {
    selectedNodes,
    tripDays,
    setTripDays,
    dayOrNightPreference,
    setDayOrNightPreference,
    interestTags,
    setInterestTags,
    clarifyState,
    planState,
    addCurrentSelection,
    removeSelection,
    clearSelection,
    handleClarify,
    handlePlan,
    setActiveDay,
    setActiveStopId,
    setActiveLegId,
  };
}
