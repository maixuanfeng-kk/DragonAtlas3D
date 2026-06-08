import * as THREE from "three";
import { hasAmapWebKey, polygonQueryParam, searchResidentialViewport } from "./amapSearch.js";
import { buildLabels, createLabelElements, createLineGroup } from "./overlays.js";
import { clearDetailLayer } from "./sceneRuntime.js";
import { featureCenter, pointInFeature, projectLonLat, unprojectMapPoint } from "./geo.js";

function visibleGeoBounds(state) {
  if (!state.context || !state.container) {
    return null;
  }

  const rect = state.container.getBoundingClientRect();
  const inset = 18;
  const corners = [
    [rect.left + inset, rect.top + inset],
    [rect.right - inset, rect.top + inset],
    [rect.right - inset, rect.bottom - inset],
    [rect.left + inset, rect.bottom - inset],
  ]
    .map(([clientX, clientY]) => clientPointToLonLat(state, clientX, clientY))
    .filter(Boolean);

  if (corners.length < 4) {
    return null;
  }

  const lons = corners.map((item) => item[0]);
  const lats = corners.map((item) => item[1]);
  return {
    minLon: Math.max(state.context.bounds.minLon, Math.min(...lons)),
    maxLon: Math.min(state.context.bounds.maxLon, Math.max(...lons)),
    minLat: Math.max(state.context.bounds.minLat, Math.min(...lats)),
    maxLat: Math.min(state.context.bounds.maxLat, Math.max(...lats)),
  };
}

function clientPointToMapLocal(state, clientX, clientY) {
  if (!state.context) {
    return null;
  }

  const rect = state.container.getBoundingClientRect();
  state.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const terrainHit = state.terrainMesh ? state.raycaster.intersectObject(state.terrainMesh, false)[0] : null;
  let point = terrainHit?.point;
  if (!point) {
    point = new THREE.Vector3();
    state.raycaster.ray.intersectPlane(state.groundPlane, point);
  }
  if (!point) {
    return null;
  }

  return state.terrainGroup.worldToLocal(point.clone());
}

function clientPointToLonLat(state, clientX, clientY) {
  const local = clientPointToMapLocal(state, clientX, clientY);
  if (!local || !state.context) {
    return null;
  }

  return unprojectMapPoint(local.x, local.z, state.context.bounds, state.context.size);
}

function shouldLoadResidentialLayer(state, bounds) {
  if (!hasAmapWebKey() || !state.context || !bounds) {
    return false;
  }

  const span = Math.max(bounds.maxLon - bounds.minLon, bounds.maxLat - bounds.minLat);
  if (state.context.level === "country") {
    return span <= 0.04;
  }
  if (state.context.level === "district") {
    return span <= 0.22;
  }
  if (state.context.level === "city") {
    return span <= 0.09;
  }
  if (state.context.level === "province") {
    return span <= 0.05;
  }

  return false;
}

function createResidentialMarkerGroup({ features, bounds, size, sampleHeight }) {
  const group = new THREE.Group();
  const ringGeometry = new THREE.RingGeometry(0.045, 0.07, 20);
  const dotGeometry = new THREE.CircleGeometry(0.022, 16);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#bb8430",
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: "#fff1c4",
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });

  features.forEach((feature) => {
    const [lon, lat] = feature.properties?.center || featureCenter(feature);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return;
    }

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

function resetResidentialLayerState(state, regionLabel = "全国") {
  state.callbacks.setResidentialLayerState((current) => ({
    ...current,
    status: hasAmapWebKey() ? "pending" : "failed",
    regionLabel,
    viewportLabel: "",
    resultCount: 0,
    error: hasAmapWebKey() ? "" : current.error,
  }));
}

function residentialStateUpdate(state, payload) {
  state.callbacks.setResidentialLayerState((current) => ({
    ...current,
    ...payload,
  }));
}

export function prepareResidentialLayerForNode(state, node) {
  clearDetailLayer(state, state.residentialLayer);
  resetResidentialLayerState(state, node?.fullName || node?.name || "全国");
}

export async function updateResidentialLayer(state) {
  if (!state.context) {
    return;
  }

  const bounds = visibleGeoBounds(state);
  const regionLabel = state.context.node.fullName || state.context.node.name || "全国";
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
    const result = await searchResidentialViewport(bounds, 25, 40);
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
        labels: buildLabels({ features: features.slice(0, 12), bounds: requestContext.bounds, level: "poi" }).map((item) => ({
          ...item,
          offset: [0, -12],
          heightOffset: 0.22,
        })),
        labelLayer: state.labelLayer,
        replace: false,
      });
    }

    const pageLimitReached = result.totalCount > result.pageCount;
    const pointOnly = features.length > 0 && features.every((feature) => feature.properties?.geometryStatus !== "ready");
    residentialStateUpdate(state, {
      status: pageLimitReached || pointOnly ? "partial" : "ready",
      loaded: state.residentialLayerStateRef.current.loaded + 1,
      failed: state.residentialLayerStateRef.current.failed,
      resultCount: features.length,
      regionLabel,
      viewportLabel: result.viewport,
      error: pageLimitReached
        ? `当前视野结果过多，已截取前 ${result.pageCount} 条住宅 POI。`
        : pointOnly
          ? "当前视野结果以点位为主，高德未返回真实小区边界面。"
          : "",
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
      error: error instanceof Error ? error.message : "高德视野内小区层加载失败",
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
