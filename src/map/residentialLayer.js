import * as THREE from "three";
import { hasAmapWebKey, polygonQueryParam, searchViewportPois } from "./amapSearch.js";
import { featureCenter, pointInFeature, projectLonLat } from "./geo.js";
import { buildLabels, createLabelElements, createLineGroup } from "./overlays.js";
import { clearDetailLayer } from "./sceneRuntime.js";
import { shouldRenderViewportPoiLayer, viewportPoiSuppressedNote } from "./viewportPoiPolicy.js";
import { visibleGeoBounds } from "./viewBounds.js";

const CATEGORY_STYLES = {
  scenic: { ring: "#d9a655", dot: "#fff1cf" },
  hotel: { ring: "#7da8e9", dot: "#e9f2ff" },
  station: { ring: "#84c8af", dot: "#e4fff5" },
  business: { ring: "#d98060", dot: "#ffe8dc" },
  fallback: { ring: "#bb8430", dot: "#fff1c4" },
};

function shouldLoadResidentialLayer(state, bounds) {
  if (!hasAmapWebKey() || !state.context || !bounds) {
    return false;
  }

  const span = Math.max(bounds.maxLon - bounds.minLon, bounds.maxLat - bounds.minLat);
  return shouldRenderViewportPoiLayer({
    hasAmapWebKey: true,
    span,
  });
}

function markerStyleForFeature(feature) {
  return CATEGORY_STYLES[feature?.properties?.categoryId] || CATEGORY_STYLES.fallback;
}

function createMarkerMaterials() {
  const cache = new Map();
  return (feature) => {
    const style = markerStyleForFeature(feature);
    const key = `${style.ring}:${style.dot}`;
    if (!cache.has(key)) {
      cache.set(key, {
        ringMaterial: new THREE.MeshBasicMaterial({
          color: style.ring,
          transparent: true,
          opacity: 0.76,
          side: THREE.DoubleSide,
          depthTest: false,
        }),
        dotMaterial: new THREE.MeshBasicMaterial({
          color: style.dot,
          transparent: true,
          opacity: 0.96,
          depthTest: false,
        }),
      });
    }
    return cache.get(key);
  };
}

function createResidentialMarkerGroup({ features, bounds, size, sampleHeight }) {
  const group = new THREE.Group();
  const ringGeometry = new THREE.RingGeometry(0.05, 0.082, 22);
  const dotGeometry = new THREE.CircleGeometry(0.025, 18);
  const materialsForFeature = createMarkerMaterials();

  features.forEach((feature) => {
    const [lon, lat] = feature.properties?.center || featureCenter(feature);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return;
    }

    const { ringMaterial, dotMaterial } = materialsForFeature(feature);
    const height = sampleHeight(lon, lat) + 0.16;
    const [x, y, z] = projectLonLat(lon, lat, bounds, size, height);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    ring.rotation.x = -Math.PI / 2;
    dot.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    dot.position.set(x, y + 0.002, z);
    ring.renderOrder = 10;
    dot.renderOrder = 11;
    group.add(ring);
    group.add(dot);
  });

  return group;
}

function resetResidentialLayerState(state, regionLabel = "中国") {
  state.callbacks.setResidentialLayerState((current) => ({
    ...current,
    status: hasAmapWebKey() ? "ready" : "failed",
    regionLabel,
    viewportLabel: "",
    resultCount: 0,
    error: hasAmapWebKey() ? "" : current.error,
    note: hasAmapWebKey() ? viewportPoiSuppressedNote() : current.note,
  }));
}

function residentialStateUpdate(state, payload) {
  state.callbacks.setResidentialLayerState((current) => ({
    ...current,
    ...payload,
  }));
}

function buildViewportPoiLabels(features, bounds) {
  return buildLabels({
    features: features.slice(0, 6),
    bounds,
    level: "poi",
  }).map((item) => ({
    ...item,
    offset: [0, -12],
    heightOffset: 0.22,
  }));
}

export function prepareResidentialLayerForNode(state, node) {
  clearDetailLayer(state, state.residentialLayer);
  resetResidentialLayerState(state, node?.fullName || node?.name || "中国");
}

export async function updateResidentialLayer(state) {
  if (!state.context) {
    return;
  }

  const bounds = visibleGeoBounds(state);
  const regionLabel = state.context.node.fullName || state.context.node.name || "中国";
  if (!shouldLoadResidentialLayer(state, bounds)) {
    clearDetailLayer(state, state.residentialLayer);
    resetResidentialLayerState(state, regionLabel);
    return;
  }

  const key = `${state.context.node.adcode}:${polygonQueryParam(bounds)}`;
  if (state.residentialLayer.key === key || state.residentialLayer.loadingKey === key) {
    return;
  }

  state.residentialLayer.loadingKey = key;
  residentialStateUpdate(state, {
    status: "pending",
    regionLabel,
    viewportLabel: polygonQueryParam(bounds),
    requested: state.residentialLayerStateRef.current.requested + 1,
    error: "",
  });

  const requestContext = state.context;
  try {
    const result = await searchViewportPois(bounds);
    if (state.disposed || state.context !== requestContext || state.residentialLayer.loadingKey !== key) {
      return;
    }

    const features = result.features;
    clearDetailLayer(state, state.residentialLayer);
    state.residentialLayer.key = key;
    state.residentialLayer.features = features;

    if (features.length) {
      const polygonFeatures = features.filter((feature) => feature.geometry);
      const group = new THREE.Group();
      if (polygonFeatures.length) {
        group.add(
          createLineGroup({
            features: polygonFeatures,
            bounds: requestContext.bounds,
            size: requestContext.size,
            sampleHeight: requestContext.terrain.sampleHeight,
            selectedAdcode: null,
            variant: "poiOutline",
          }),
        );
      }

      group.add(
        createResidentialMarkerGroup({
          features,
          bounds: requestContext.bounds,
          size: requestContext.size,
          sampleHeight: requestContext.terrain.sampleHeight,
        }),
      );

      state.residentialLayer.group = group;
      state.terrainGroup.add(group);
      state.residentialLayer.labels = createLabelElements({
        labels: buildViewportPoiLabels(features, requestContext.bounds),
        labelLayer: state.labelLayer,
        replace: false,
      });
    }

    residentialStateUpdate(state, {
      status: result.status,
      loaded: state.residentialLayerStateRef.current.loaded + 1,
      failed: state.residentialLayerStateRef.current.failed,
      resultCount: features.length,
      regionLabel,
      viewportLabel: result.viewport,
      error: result.error || "",
      note: result.note,
    });
  } catch (error) {
    if (state.residentialLayer.loadingKey === key) {
      state.residentialLayer.loadingKey = "";
    }
    clearDetailLayer(state, state.residentialLayer);
    residentialStateUpdate(state, {
      status: "failed",
      loaded: state.residentialLayerStateRef.current.loaded,
      failed: state.residentialLayerStateRef.current.failed + 1,
      resultCount: 0,
      regionLabel,
      viewportLabel: polygonQueryParam(bounds),
      error: error instanceof Error ? error.message : "高德精细地点层加载失败",
    });
  }
}

export function pickResidentialFeatureAt(lon, lat, features) {
  const polygonMatch = features.find((feature) => feature.geometry && pointInFeature(lon, lat, feature));
  if (polygonMatch) {
    return polygonMatch;
  }

  let nearest = null;
  let nearestDistance = 0.000036;
  features.forEach((feature) => {
    const [centerLon, centerLat] = feature.properties?.center || featureCenter(feature);
    const distance = (centerLon - lon) ** 2 + (centerLat - lat) ** 2;
    if (distance < nearestDistance) {
      nearest = feature;
      nearestDistance = distance;
    }
  });
  return nearest;
}
