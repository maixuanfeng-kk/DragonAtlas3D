import { loadTownshipGeoJson } from "./dataSources.js";
import { featureBounds } from "./geo.js";
import { buildLabels, createLabelElements, createLineGroup } from "./overlays.js";
import { clearDetailLayer } from "./sceneRuntime.js";
import { visibleGeoBounds } from "./viewBounds.js";

const MAX_VISIBLE_DISTRICTS = 32;

function boundsIntersect(a, b) {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

function boundsArea(bounds) {
  return Math.max(0, bounds.maxLon - bounds.minLon) * Math.max(0, bounds.maxLat - bounds.minLat);
}

function intersectionArea(a, b) {
  return boundsArea({
    minLon: Math.max(a.minLon, b.minLon),
    maxLon: Math.min(a.maxLon, b.maxLon),
    minLat: Math.max(a.minLat, b.minLat),
    maxLat: Math.min(a.maxLat, b.maxLat),
  });
}

function featureBox(feature) {
  const bounds = feature.__bounds || featureBounds(feature);
  feature.__bounds = bounds;
  return bounds;
}

function districtName(feature) {
  return String(feature?.properties?.name || "").trim();
}

function visibleDistricts(districtFeatures, viewBounds) {
  return (districtFeatures || [])
    .filter((feature) => feature?.geometry && districtName(feature))
    .map((feature) => ({
      feature,
      bounds: featureBox(feature),
    }))
    .filter((item) => boundsIntersect(item.bounds, viewBounds))
    .sort((a, b) => intersectionArea(b.bounds, viewBounds) - intersectionArea(a.bounds, viewBounds))
    .map((item) => item.feature);
}

function layerKey({ provinceName, cityName, districts, clipped }) {
  const adcodes = districts.map((feature) => String(feature.properties?.adcode || districtName(feature))).join(",");
  return `township-view:${provinceName}/${cityName}:${adcodes}${clipped ? ":clipped" : ""}`;
}

function enrichTownshipFeatures(features, districtFeature, provinceName, cityName) {
  return features.map((feature) => ({
    ...feature,
    properties: {
      ...(feature.properties || {}),
      provinceName,
      cityName,
      districtName: districtName(districtFeature),
      districtAdcode: String(districtFeature.properties?.adcode || ""),
    },
  }));
}

function summarizePartial({ loadedDistricts, emptyDistricts, failedDistricts, clipped }) {
  const parts = [];
  if (clipped) {
    parts.push(`当前视野区县过多，已加载前 ${MAX_VISIBLE_DISTRICTS} 个可见区县`);
  }
  if (failedDistricts.length) {
    parts.push(`失败 ${failedDistricts.length} 个区县：${failedDistricts.slice(0, 4).join("、")}`);
  }
  if (emptyDistricts.length) {
    parts.push(`无街道数据 ${emptyDistricts.length} 个区县：${emptyDistricts.slice(0, 4).join("、")}`);
  }
  if (!parts.length) {
    return "";
  }
  return `街道/乡镇边界部分加载：${loadedDistricts.length}/${loadedDistricts.length + emptyDistricts.length + failedDistricts.length} 个区县成功。${parts.join("；")}`;
}

function reportAllFailed(state, failedDistricts) {
  clearDetailLayer(state, state.townshipDetailLayer);
  state.callbacks.setNotice(`街道/乡镇边界加载失败：${failedDistricts.slice(0, 6).join("、")}`);
}

export async function renderViewportTownshipLayer(state, { provinceName = "", cityName = "", districtFeatures = [] }) {
  if (!state.context || !provinceName || !cityName || !districtFeatures.length) {
    clearDetailLayer(state, state.townshipDetailLayer);
    return;
  }

  const viewBounds = visibleGeoBounds(state);
  const candidates = viewBounds ? visibleDistricts(districtFeatures, viewBounds) : [];
  const clipped = candidates.length > MAX_VISIBLE_DISTRICTS;
  const districts = candidates.slice(0, MAX_VISIBLE_DISTRICTS);
  if (!districts.length) {
    clearDetailLayer(state, state.townshipDetailLayer);
    return;
  }

  const key = layerKey({ provinceName, cityName, districts, clipped });
  if (state.townshipDetailLayer.key === key || state.townshipDetailLayer.loadingKey === key) {
    return;
  }

  const requestContext = state.context;
  state.townshipDetailLayer.loadingKey = key;

  const results = await Promise.allSettled(
    districts.map(async (districtFeature) => {
      const geojson = await loadTownshipGeoJson({
        provinceName,
        cityName,
        districtName: districtName(districtFeature),
        maxFiles: 120,
      });
      const features = (geojson.features || []).filter((item) => item.properties?.name && item.geometry);
      return {
        districtName: districtName(districtFeature),
        features: enrichTownshipFeatures(features, districtFeature, provinceName, cityName),
        status: geojson.__status || "ready",
        error: geojson.__error || "",
      };
    }),
  );

  if (state.disposed || state.context !== requestContext || state.townshipDetailLayer.loadingKey !== key) {
    return;
  }

  const loadedDistricts = [];
  const emptyDistricts = [];
  const failedDistricts = [];
  const featureGroups = [];

  results.forEach((result, index) => {
    const name = districtName(districts[index]);
    if (result.status === "rejected") {
      failedDistricts.push(name);
      return;
    }

    if (result.value.features.length) {
      loadedDistricts.push(name);
      featureGroups.push(result.value.features);
      return;
    }

    emptyDistricts.push(name);
  });

  if (!loadedDistricts.length && failedDistricts.length) {
    reportAllFailed(state, failedDistricts);
    return;
  }

  const features = featureGroups.flat();
  clearDetailLayer(state, state.townshipDetailLayer);
  state.townshipDetailLayer.key = key;
  state.townshipDetailLayer.features = features;
  if (!features.length) {
    state.callbacks.setNotice(`当前视野没有可用街道/乡镇边界数据：${emptyDistricts.slice(0, 6).join("、")}`);
    return;
  }

  state.townshipDetailLayer.group = createLineGroup({
    features,
    bounds: requestContext.bounds,
    size: requestContext.size,
    sampleHeight: requestContext.terrain.sampleHeight,
    selectedAdcode: null,
    variant: "townshipDetail",
  });
  state.terrainGroup.add(state.townshipDetailLayer.group);
  state.townshipDetailLayer.labels = createLabelElements({
    labels: buildLabels({ features, bounds: requestContext.bounds, level: "township" }),
    labelLayer: state.labelLayer,
    replace: false,
  });

  const partial = summarizePartial({ loadedDistricts, emptyDistricts, failedDistricts, clipped });
  if (partial) {
    state.callbacks.setNotice(partial);
  }
}
