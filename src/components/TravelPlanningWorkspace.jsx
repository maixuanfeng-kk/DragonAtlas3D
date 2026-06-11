import { AmapDetailView } from "./AmapDetailView.jsx";
import { TravelPlannerPanel } from "./TravelPlannerPanel.jsx";

export function TravelPlanningWorkspace({
  detailMapMode,
  detailMapViewport,
  onExitDetailMap,
  currentCandidate,
  planner,
}) {
  if (detailMapMode && detailMapViewport) {
    return (
      <>
        <AmapDetailView
          viewport={detailMapViewport}
          itineraryState={planner.planState}
          onBack={onExitDetailMap}
          onSelectStop={planner.setActiveStopId}
          onSelectLeg={planner.setActiveLegId}
        />
        <TravelPlannerPanel
          detailMode
          currentCandidate={currentCandidate}
          selectedNodes={planner.selectedNodes}
          tripDays={planner.tripDays}
          setTripDays={planner.setTripDays}
          dayOrNightPreference={planner.dayOrNightPreference}
          setDayOrNightPreference={planner.setDayOrNightPreference}
          interestTags={planner.interestTags}
          setInterestTags={planner.setInterestTags}
          clarifyState={planner.clarifyState}
          planState={planner.planState}
          addCurrentSelection={() => planner.addCurrentSelection(currentCandidate)}
          removeSelection={planner.removeSelection}
          clearSelection={planner.clearSelection}
          handleClarify={planner.handleClarify}
          handlePlan={planner.handlePlan}
          onSelectDay={planner.setActiveDay}
          onSelectStop={planner.setActiveStopId}
          onSelectLeg={planner.setActiveLegId}
        />
      </>
    );
  }

  return (
    <TravelPlannerPanel
      detailMode={false}
      currentCandidate={currentCandidate}
      selectedNodes={planner.selectedNodes}
      tripDays={planner.tripDays}
      setTripDays={planner.setTripDays}
      dayOrNightPreference={planner.dayOrNightPreference}
      setDayOrNightPreference={planner.setDayOrNightPreference}
      interestTags={planner.interestTags}
      setInterestTags={planner.setInterestTags}
      clarifyState={planner.clarifyState}
      planState={planner.planState}
      addCurrentSelection={() => planner.addCurrentSelection(currentCandidate)}
      removeSelection={planner.removeSelection}
      clearSelection={planner.clearSelection}
      handleClarify={planner.handleClarify}
      handlePlan={planner.handlePlan}
      onSelectDay={planner.setActiveDay}
      onSelectStop={planner.setActiveStopId}
      onSelectLeg={planner.setActiveLegId}
    />
  );
}
