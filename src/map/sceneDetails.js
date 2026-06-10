import { loadAdminGeoJson, loadRiverGeoJson } from "./dataSources.js";
import { findFeatureAt } from "./geo.js";
import { buildRiverLabels, createRiverGroup, filterRiverFeatures } from "./rivers.js";
import { buildLabels, createLabelElements, createLineGroup } from "./overlays.js";
import { clearDetailLayer } from "./sceneRuntime.js";
import { findFeatureNear, LOD_ZOOM } from "./viewState.js";

function reportLayerError(state, error, fallbackMessage) {
  if (!state.disposed) {
    state.callbacks.setNotice(error instanceof Error ? error.message : fallbackMessage);
  }
}

export async function renderDetailLayer(state, { layer, feature, variant, labelLevel }) {
  if (!feature?.properties?.adcode || !state.context) {
    clearDetailLayer(state, layer);
    return;
  }

  const key = `${labelLevel}:${feature.properties.adcode}`;
  if (layer.key === key || layer.loadingKey === key) {
    return;
  }

  const requestContext = state.context;
  layer.loadingKey = key;

  try {
    const geojson = await loadAdminGeoJson(feature.properties.adcode);
    if (state.disposed || state.context !== requestContext || layer.loadingKey !== key) {
      return;
    }

    const features = (geojson.features || []).filter((item) => item.properties?.name);
    clearDetailLayer(state, layer);
    layer.key = key;
    layer.features = features;
    layer.group = createLineGroup({
      features,
      bounds: requestContext.bounds,
      size: requestContext.size,
      sampleHeight: requestContext.terrain.sampleHeight,
      selectedAdcode: null,
      variant,
    });
    state.terrainGroup.add(layer.group);
    layer.labels = createLabelElements({
      labels: buildLabels({ features, bounds: requestContext.bounds, level: labelLevel }),
      labelLayer: state.labelLayer,
      replace: false,
    });
  } catch (error) {
    if (layer.loadingKey === key) {
      layer.loadingKey = "";
    }
    reportLayerError(state, error, "细节边界加载失败");
  }
}

export async function renderTownshipLayer(state, { provinceFeature, cityFeature, districtFeature, provinceName = "", cityName = "" }) {
  void provinceFeature;
  void cityFeature;
  void districtFeature;
  void provinceName;
  void cityName;
  clearDetailLayer(state, state.townshipDetailLayer);
}

export async function renderTributaryRivers(state, { provinceAdcode = "", maxFeatures = 90, maxLabels = 16 } = {}) {
  if (!state.context) {
    clearDetailLayer(state, state.tributaryRiverLayer);
    return;
  }

  const zoomBucket = Math.min(9, Math.floor(state.targetZoom));
  const key = `tributary:${state.context.node.adcode}:${provinceAdcode || "view"}:${maxFeatures}:z${zoomBucket}`;
  if (state.tributaryRiverLayer.key === key || state.tributaryRiverLayer.loadingKey === key) {
    return;
  }

  const requestContext = state.context;
  state.tributaryRiverLayer.loadingKey = key;

  try {
    const geojson = await loadRiverGeoJson("tributary");
    if (state.disposed || state.context !== requestContext || state.tributaryRiverLayer.loadingKey !== key) {
      return;
    }

    const features = filterRiverFeatures({
      geojson,
      bounds: requestContext.bounds,
      provinceAdcode,
      kind: "tributary",
      maxFeatures,
      targetZoom: state.targetZoom,
    });

    clearDetailLayer(state, state.tributaryRiverLayer);
    state.tributaryRiverLayer.key = key;
    state.tributaryRiverLayer.features = features;
    state.tributaryRiverLayer.group = createRiverGroup({
      features,
      bounds: requestContext.bounds,
      size: requestContext.size,
      sampleHeight: requestContext.terrain.sampleHeight,
      kind: "tributary",
    });
    state.terrainGroup.add(state.tributaryRiverLayer.group);
    state.tributaryRiverLayer.labels = createLabelElements({
      labels: buildRiverLabels({
        features,
        bounds: requestContext.bounds,
        kind: "tributary",
        maxLabels,
      }),
      labelLayer: state.labelLayer,
      replace: false,
    });
  } catch (error) {
    if (state.tributaryRiverLayer.loadingKey === key) {
      state.tributaryRiverLayer.loadingKey = "";
    }
    reportLayerError(state, error, "支流数据加载失败");
  }
}

export async function updateDetailLayers(state, lonLat = state.lodFocusLonLat) {
  if (!lonLat || !state.context || state.isRenderingRegion) {
    return;
  }

  if (state.context.level === "country") {
    if (state.targetZoom < LOD_ZOOM.countryCities) {
      clearDetailLayer(state, state.cityDetailLayer);
      clearDetailLayer(state, state.districtDetailLayer);
      clearDetailLayer(state, state.townshipDetailLayer);
      clearDetailLayer(state, state.tributaryRiverLayer);
      return;
    }

    const provinceFeature = findFeatureAt(lonLat[0], lonLat[1], state.context.namedFeatures);
    if (!provinceFeature) {
      clearDetailLayer(state, state.cityDetailLayer);
      clearDetailLayer(state, state.districtDetailLayer);
      clearDetailLayer(state, state.townshipDetailLayer);
      clearDetailLayer(state, state.tributaryRiverLayer);
      return;
    }

    if (state.targetZoom >= LOD_ZOOM.tributaryRivers) {
      await renderTributaryRivers(state, {
        provinceAdcode: provinceFeature.properties.adcode,
        maxFeatures: 42,
        maxLabels: 8,
      });
    } else {
      clearDetailLayer(state, state.tributaryRiverLayer);
    }

    await renderDetailLayer(state, {
      layer: state.cityDetailLayer,
      feature: provinceFeature,
      variant: "cityDetail",
      labelLevel: "province",
    });

    if (state.targetZoom < LOD_ZOOM.countryDistricts) {
      clearDetailLayer(state, state.districtDetailLayer);
      clearDetailLayer(state, state.townshipDetailLayer);
      return;
    }

    const cityFeature = findFeatureNear(lonLat[0], lonLat[1], state.cityDetailLayer.features);
    if (!cityFeature) {
      clearDetailLayer(state, state.districtDetailLayer);
      clearDetailLayer(state, state.townshipDetailLayer);
      return;
    }

    await renderDetailLayer(state, {
      layer: state.districtDetailLayer,
      feature: cityFeature,
      variant: "districtDetail",
      labelLevel: "city",
    });

    clearDetailLayer(state, state.townshipDetailLayer);
    return;
  }

  clearDetailLayer(state, state.cityDetailLayer);
  if (state.targetZoom >= LOD_ZOOM.tributaryRivers) {
    await renderTributaryRivers(state, {
      provinceAdcode: state.context.level === "province" ? state.context.node.adcode : "",
      maxFeatures: state.context.level === "province" ? 54 : 32,
      maxLabels: state.context.level === "province" ? 10 : 6,
    });
  } else {
    clearDetailLayer(state, state.tributaryRiverLayer);
  }

  if (state.context.level === "province") {
    if (state.targetZoom < LOD_ZOOM.provinceDistricts) {
      clearDetailLayer(state, state.districtDetailLayer);
      clearDetailLayer(state, state.townshipDetailLayer);
      return;
    }

    const cityFeature = findFeatureNear(lonLat[0], lonLat[1], state.context.namedFeatures);
    if (!cityFeature) {
      clearDetailLayer(state, state.districtDetailLayer);
      clearDetailLayer(state, state.townshipDetailLayer);
      return;
    }

    await renderDetailLayer(state, {
      layer: state.districtDetailLayer,
      feature: cityFeature,
      variant: "districtDetail",
      labelLevel: "city",
    });

    clearDetailLayer(state, state.townshipDetailLayer);
    return;
  }

  clearDetailLayer(state, state.districtDetailLayer);
  if (state.context.level === "city") {
    clearDetailLayer(state, state.townshipDetailLayer);
    return;
  }

  clearDetailLayer(state, state.townshipDetailLayer);
}
