import { DEFAULT_VIEW_ZOOM } from "./viewState.js";

export function clearSceneArrival(state) {
  if (state.arrivalTimer) {
    window.clearTimeout(state.arrivalTimer);
    state.arrivalTimer = 0;
  }
}

export function scheduleSceneArrival(
  state,
  {
    startZoom = 0.88,
    targetZoom = DEFAULT_VIEW_ZOOM,
    delay = 240,
  } = {},
) {
  clearSceneArrival(state);
  state.viewZoom = startZoom;
  state.targetZoom = startZoom;
  state.arrivalTimer = window.setTimeout(() => {
    state.arrivalTimer = 0;
    state.targetZoom = targetZoom;
  }, delay);
}
