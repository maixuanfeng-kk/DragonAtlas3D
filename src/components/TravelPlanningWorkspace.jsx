import { AmapDetailView } from "./AmapDetailView.jsx";
import { DetailMapPlannerWorkspace } from "./DetailMapPlannerWorkspace.jsx";

export function TravelPlanningWorkspace({
  detailMapMode,
  detailMapViewport,
  onExitDetailMap,
  planner,
  onPreviewNode,
  onPreviewNodes,
}) {
  if (!detailMapMode || !detailMapViewport) {
    return null;
  }

  return (
    <>
      <AmapDetailView
        viewport={detailMapViewport}
        itineraryState={planner.planState}
        selectedNodes={planner.selectedNodes}
        onBack={onExitDetailMap}
        onSelectStop={planner.setActiveStopId}
        onSelectLeg={planner.setActiveLegId}
      />
      <DetailMapPlannerWorkspace
        viewport={detailMapViewport}
        planner={planner}
        onPreviewNode={onPreviewNode}
        onPreviewNodes={onPreviewNodes}
      />
    </>
  );
}
