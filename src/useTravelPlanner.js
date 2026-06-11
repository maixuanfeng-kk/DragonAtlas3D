import { startTransition, useState } from "react";
import { postTravelClarify, postTravelPlan } from "./api/travelAgentClient.js";
import { normalizePlanDays } from "./map/detailMapItineraryModel.js";
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
    setNotice("已加入旅游路线候选");
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
    if (!selectedNodes.length) {
      setNotice("请先在地图上选择并加入 1-3 个武汉节点");
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
      setNotice("旅游 Agent 已生成首轮追问");
    } catch (error) {
      const message = error instanceof Error ? error.message : "旅游 Agent 追问生成失败";
      setClarifyState((current) => ({ ...current, status: "failed", error: message }));
      setNotice(message);
    }
  };

  const handlePlan = async () => {
    if (!selectedNodes.length) {
      setNotice("请先在地图上选择并加入 1-3 个武汉节点");
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
      setNotice("武汉旅游路线已生成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "旅游路线生成失败";
      setPlanState((current) => ({ ...current, status: "failed", error: message }));
      setNotice(message);
    }
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
  };
}
