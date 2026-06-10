import { buildPoiReveal } from "../components/heroCopy.js";
import { projectLonLat } from "./geo.js";
import { selectPoiOnMap } from "./searchController.js";
import { MAX_VIEW_ZOOM } from "./viewState.js";

function centerPanOnFeature(state, feature) {
  if (!state.context) {
    return;
  }

  const [lon, lat] = feature.properties?.center || [];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return;
  }

  const [x, , z] = projectLonLat(lon, lat, state.context.bounds, state.context.size, 0);
  state.targetPan.x = -x;
  state.targetPan.z = -z;
  state.targetZoom = Math.min(MAX_VIEW_ZOOM, Math.max(state.targetZoom * 1.1, 1.18));
}

export function focusPoiFeature(state, feature) {
  if (!feature) {
    return;
  }

  selectPoiOnMap(state, feature);
  centerPanOnFeature(state, feature);
}

export function revealPoiFeature(state, feature) {
  if (!feature) {
    return;
  }

  const reveal = buildPoiReveal({ feature });
  state.callbacks.scheduleLocationReveal?.({
    reveal,
    onAdvance: () => {
      focusPoiFeature(state, feature);
    },
  });
}
