import { buildLabels, createLabelElements, createLineGroup, createPoiMarker, disposeObject3D } from "./overlays.js";
import { clearPoiLayer } from "./sceneRuntime.js";

export function regionLabelForSearch(node) {
  if (!node) {
    return "全国";
  }

  return node.fullName || node.name || "全国";
}

export function searchRegionForNode(node) {
  if (!node?.adcode || node.adcode === "100000") {
    return { adcode: "", label: "全国" };
  }

  return {
    adcode: String(node.adcode),
    label: regionLabelForSearch(node),
  };
}

export function renderPoiSelection(state, feature) {
  clearPoiLayer(state);
  if (!feature || !state.context) {
    return;
  }

  const sampleHeight = state.context.terrain.sampleHeight;
  if (feature.geometry) {
    state.poiLayer.group = createLineGroup({
      features: [feature],
      bounds: state.context.bounds,
      size: state.context.size,
      sampleHeight,
      selectedAdcode: String(feature.properties?.adcode || ""),
      variant: "poiOutline",
    });
    state.terrainGroup.add(state.poiLayer.group);
  }

  const [lon, lat] = feature.properties?.center || [];
  if (Number.isFinite(lon) && Number.isFinite(lat)) {
    state.poiLayer.marker = createPoiMarker({
      lon,
      lat,
      bounds: state.context.bounds,
      size: state.context.size,
      sampleHeight,
    });
    state.terrainGroup.add(state.poiLayer.marker);
  }

  state.poiLayer.labels = createLabelElements({
    labels: buildLabels({ features: [feature], bounds: state.context.bounds, level: "poi" }).map((item) => ({
      ...item,
      offset: [0, -16],
      heightOffset: 0.26,
    })),
    labelLayer: state.labelLayer,
    replace: false,
  });
  state.poiLayer.feature = feature;
}

export function disposePoiLayer(state) {
  if (state.poiLayer.group) {
    state.terrainGroup.remove(state.poiLayer.group);
    disposeObject3D(state.poiLayer.group);
  }
  if (state.poiLayer.marker) {
    state.terrainGroup.remove(state.poiLayer.marker);
    disposeObject3D(state.poiLayer.marker);
  }
  state.poiLayer.labels.forEach((item) => item.element.remove());
  state.poiLayer = { group: null, marker: null, labels: [], feature: null };
}
