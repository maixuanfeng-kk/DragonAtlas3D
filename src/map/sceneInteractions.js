import { findFeatureAt } from "./geo.js";
import { revealPoiFeature } from "./poiFocus.js";
import { pickResidentialFeatureAt } from "./residentialLayer.js";
import { renderRegion } from "./regionRenderer.js";
import { chooseFeature as submitChooseFeature, selectTravelFeatureOnMap } from "./searchController.js";
import { updateDetailLayers } from "./sceneDetails.js";
import { syncTravelRouteLayer } from "./travelRouteLayer.js";
import { clientPointToLonLat, clientPointToMapLocal, localPointToLonLat, visibleGeoBounds } from "./viewBounds.js";
import { COUNTRY_NODE, MAX_VIEW_ZOOM, MIN_VIEW_ZOOM } from "./viewState.js";
import { pickTravelNodeAt } from "./wuhanTravelNodes.js";

function activePointerCenter(state) {
  const pointers = [...state.activePointers.values()];
  if (!pointers.length) {
    const rect = state.container.getBoundingClientRect();
    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
  }

  const total = pointers.reduce((sum, item) => ({ x: sum.x + item.x, y: sum.y + item.y }), { x: 0, y: 0 });
  return {
    clientX: total.x / pointers.length,
    clientY: total.y / pointers.length,
  };
}

function pointerDistance(state) {
  const pointers = [...state.activePointers.values()];
  if (pointers.length < 2) {
    return 0;
  }

  const [first, second] = pointers;
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function zoomAtPoint(state, clientX, clientY, nextZoom) {
  const local = clientPointToMapLocal(state, clientX, clientY);
  if (!local || !state.context) {
    state.targetZoom = nextZoom;
    return null;
  }

  const lonLat = localPointToLonLat(state, local);
  const rect = state.container.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const viewWidth = (state.camera.right - state.camera.left) / nextZoom;
  const viewHeight = (state.camera.top - state.camera.bottom) / nextZoom;
  state.targetZoom = nextZoom;
  state.targetPan.x = (ndcX * viewWidth) / 2 - local.x;
  state.targetPan.z = (-ndcY * viewHeight) / 2 - local.z;
  return lonLat;
}

function refreshDetailLayers(state) {
  void updateDetailLayers(state, state.lodFocusLonLat);
  state.scheduleResidentialRefresh?.();
  state.callbacks.onViewportChange?.({
    currentNode: state.context?.node,
    bounds: visibleGeoBounds(state),
  });
}

export function setupSceneInteractions({ state, sceneApiRef, resizeScene }) {
  const { container } = state;

  const handleClick = (event) => {
    const lonLat = clientPointToLonLat(state, event.clientX, event.clientY);
    if (!lonLat || !state.context) {
      return;
    }

    const travelFeature = pickTravelNodeAt(lonLat[0], lonLat[1], state.travelNodeLayer.features);
    if (travelFeature) {
      sceneApiRef.current?.selectTravelFeature(travelFeature);
      return;
    }

    const poiFeature = pickResidentialFeatureAt(lonLat[0], lonLat[1], state.residentialLayer.features);
    if (poiFeature) {
      sceneApiRef.current?.selectPoiFeature(poiFeature);
      return;
    }

    const feature = findFeatureAt(lonLat[0], lonLat[1], state.context.namedFeatures);
    if (feature) {
      sceneApiRef.current?.chooseByAdcode(String(feature.properties?.adcode || ""));
    }
  };

  const onPointerDown = (event) => {
    state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.pointerStart.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.lastPinchDistance = pointerDistance(state);
    state.isPointerDragging = false;
    container.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!state.activePointers.has(event.pointerId)) {
      return;
    }

    const previous = state.activePointers.get(event.pointerId);
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const start = state.pointerStart.get(event.pointerId);
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
      state.isPointerDragging = true;
    }

    if (state.activePointers.size >= 2) {
      const nextDistance = pointerDistance(state);
      if (nextDistance > 0 && state.lastPinchDistance > 0) {
        const zoomRatio = nextDistance / state.lastPinchDistance;
        const nextZoom = Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, state.targetZoom * zoomRatio));
        const center = activePointerCenter(state);
        state.lodFocusLonLat = zoomAtPoint(state, center.clientX, center.clientY, nextZoom);
        refreshDetailLayers(state);
      }
      state.lastPinchDistance = nextDistance;
      return;
    }

    const viewWidth = state.camera.right - state.camera.left;
    const viewHeight = state.camera.top - state.camera.bottom;
    state.targetPan.x += (dx / container.clientWidth) * (viewWidth / state.viewZoom);
    state.targetPan.z += (dy / container.clientHeight) * (viewHeight / state.viewZoom);
  };

  const onPointerUp = (event) => {
    const start = state.pointerStart.get(event.pointerId);
    state.activePointers.delete(event.pointerId);
    state.pointerStart.delete(event.pointerId);
    state.lastPinchDistance = pointerDistance(state);
    container.releasePointerCapture?.(event.pointerId);

    if (start && !state.isPointerDragging) {
      handleClick(event);
      return;
    }

    if (state.isPointerDragging && state.activePointers.size === 0) {
      const center = activePointerCenter(state);
      state.lodFocusLonLat = clientPointToLonLat(state, center.clientX, center.clientY) || state.lodFocusLonLat;
      refreshDetailLayers(state);
    }
  };

  const onKeyDown = (event) => {
    if (!state.context) {
      return;
    }

    const panStep = Math.max(0.18, 0.72 / state.targetZoom);
    const center = activePointerCenter(state);
    const keyHandlers = {
      ArrowLeft: () => {
        state.targetPan.x += panStep;
      },
      ArrowRight: () => {
        state.targetPan.x -= panStep;
      },
      ArrowUp: () => {
        state.targetPan.z += panStep;
      },
      ArrowDown: () => {
        state.targetPan.z -= panStep;
      },
      "+": () => {
        state.lodFocusLonLat = zoomAtPoint(state, center.clientX, center.clientY, state.targetZoom * 1.18);
      },
      "=": () => {
        state.lodFocusLonLat = zoomAtPoint(state, center.clientX, center.clientY, state.targetZoom * 1.18);
      },
      "-": () => {
        state.lodFocusLonLat = zoomAtPoint(state, center.clientX, center.clientY, Math.max(MIN_VIEW_ZOOM, state.targetZoom / 1.18));
      },
      Home: () => {
        renderRegion(state, COUNTRY_NODE, [COUNTRY_NODE]);
      },
    };
    const handler = keyHandlers[event.key];
    if (!handler) {
      return;
    }

    event.preventDefault();
    handler();
    refreshDetailLayers(state);
  };

  const onWheel = (event) => {
    event.preventDefault();
    const nextZoom = Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, state.targetZoom * Math.exp(-event.deltaY * 0.0012)));
    state.lodFocusLonLat = zoomAtPoint(state, event.clientX, event.clientY, nextZoom);
    refreshDetailLayers(state);
  };

  const resizeObserver = new ResizeObserver(() => resizeScene(state));
  resizeObserver.observe(container);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerUp);
  container.addEventListener("pointerleave", onPointerUp);
  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("keydown", onKeyDown);

  sceneApiRef.current = {
    reset: () => {
      state.transitionPreset = null;
      renderRegion(state, COUNTRY_NODE, [COUNTRY_NODE]);
    },
    goToTrail: (index) => {
      const node = state.trailRef.current[index] || COUNTRY_NODE;
      const nextTrail = state.trailRef.current.slice(0, index + 1);
      state.transitionPreset = null;
      renderRegion(state, node, nextTrail);
    },
    goToNode: (node, nextTrail = null, options = {}) => {
      const trail = Array.isArray(nextTrail) && nextTrail.length ? nextTrail : node?.adcode === COUNTRY_NODE.adcode ? [COUNTRY_NODE] : [COUNTRY_NODE, node];
      state.transitionPreset = options.transition || null;
      renderRegion(state, node, trail);
    },
    chooseByAdcode: (adcode, options = {}) => {
      const feature = state.context?.namedFeatures.find((item) => String(item.properties?.adcode) === String(adcode));
      if (feature) {
        state.transitionPreset = options.transition || null;
        return submitChooseFeature(state, feature);
      }
      return undefined;
    },
    selectPoiFeature: (feature) => {
      revealPoiFeature(state, feature);
    },
    selectTravelFeature: (feature) => {
      selectTravelFeatureOnMap(state, feature);
    },
    syncTravelRoutes: (routeDays) => {
      syncTravelRouteLayer(state, routeDays);
    },
  };

  return () => {
    resizeObserver.disconnect();
    container.removeEventListener("pointerdown", onPointerDown);
    container.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("pointerup", onPointerUp);
    container.removeEventListener("pointercancel", onPointerUp);
    container.removeEventListener("pointerleave", onPointerUp);
    container.removeEventListener("wheel", onWheel);
    container.removeEventListener("keydown", onKeyDown);
    sceneApiRef.current = null;
  };
}
