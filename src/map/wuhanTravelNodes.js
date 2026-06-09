import * as THREE from "three";
import { createLabelElements, createPoiMarker, disposeObject3D } from "./overlays.js";

const WUHAN_TRAVEL_NODES = [
  {
    id: "donghu",
    name: "东湖",
    nodeType: "area",
    category: "lake",
    district: "武昌区",
    center: [114.419, 30.56],
    tags: ["湖景", "散步", "骑行"],
  },
  {
    id: "yellow-crane-tower",
    name: "黄鹤楼",
    nodeType: "poi",
    category: "landmark",
    district: "武昌区",
    center: [114.306, 30.547],
    tags: ["地标", "城市视野"],
  },
  {
    id: "jianghan-road",
    name: "江汉路",
    nodeType: "area",
    category: "street",
    district: "江汉区",
    center: [114.291, 30.581],
    tags: ["夜游", "商业街", "美食"],
  },
];

function trailSupportsWuhan(trail = []) {
  return trail.some((node) => {
    const name = `${node?.name || ""}${node?.fullName || ""}`;
    return name.includes("湖北") || name.includes("武汉");
  });
}

function toTravelFeature(node) {
  return {
    type: "Feature",
    properties: {
      adcode: `travel-${node.id}`,
      travelId: node.id,
      level: "poi",
      nodeType: node.nodeType,
      name: node.name,
      shortName: node.name,
      fullName: node.name,
      center: node.center,
      district: node.district,
      category: node.category,
      tags: node.tags,
      geometryStatus: "point-only",
      provider: "Wuhan Seed Nodes",
    },
    geometry: null,
  };
}

function visibleTravelFeatures(state, nextTrail = state.trailRef.current) {
  if (!state.context || !trailSupportsWuhan(nextTrail)) {
    return [];
  }

  const { bounds } = state.context;
  return WUHAN_TRAVEL_NODES.filter((node) => {
    const [lon, lat] = node.center;
    return lon >= bounds.minLon && lon <= bounds.maxLon && lat >= bounds.minLat && lat <= bounds.maxLat;
  }).map(toTravelFeature);
}

export function clearTravelNodeLayer(state) {
  state.travelNodeLayer.labels.forEach((item) => item.element.remove());
  state.travelNodeLayer.labels = [];
  state.travelNodeLayer.features = [];
  if (state.travelNodeLayer.group) {
    state.terrainGroup.remove(state.travelNodeLayer.group);
    disposeObject3D(state.travelNodeLayer.group);
    state.travelNodeLayer.group = null;
  }
}

export function renderTravelNodeLayer(state, nextTrail = state.trailRef.current) {
  const features = visibleTravelFeatures(state, nextTrail);
  if (!features.length || !state.context) {
    clearTravelNodeLayer(state);
    return;
  }

  clearTravelNodeLayer(state);
  const group = new THREE.Group();
  features.forEach((feature) => {
    const [lon, lat] = feature.properties.center;
    const marker = createPoiMarker({
      lon,
      lat,
      bounds: state.context.bounds,
      size: state.context.size,
      sampleHeight: state.context.terrain.sampleHeight,
    });
    group.add(marker);
  });

  state.travelNodeLayer.group = group;
  state.travelNodeLayer.features = features;
  state.terrainGroup.add(group);
  state.travelNodeLayer.labels = createLabelElements({
    labels: features.map((feature) => ({
      key: feature.properties.travelId,
      type: "poi",
      text: feature.properties.shortName,
      center: feature.properties.center,
      minZoom: 0.2,
      offset: [0, -16],
      heightOffset: 0.28,
    })),
    labelLayer: state.labelLayer,
    replace: false,
  });
}

export function pickTravelNodeAt(lon, lat, features = [], maxDistance = 0.18) {
  let nearest = null;
  let nearestDistance = maxDistance * maxDistance;
  features.forEach((feature) => {
    const [centerLon, centerLat] = feature.properties?.center || [];
    if (!Number.isFinite(centerLon) || !Number.isFinite(centerLat)) {
      return;
    }
    const distance = (centerLon - lon) ** 2 + (centerLat - lat) ** 2;
    if (distance < nearestDistance) {
      nearest = feature;
      nearestDistance = distance;
    }
  });
  return nearest;
}
