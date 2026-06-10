import * as THREE from "three";
import { unprojectMapPoint } from "./geo.js";

export function clientPointToMapLocal(state, clientX, clientY) {
  if (!state.context || !state.container) {
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

export function clientPointToLonLat(state, clientX, clientY) {
  const local = clientPointToMapLocal(state, clientX, clientY);
  return localPointToLonLat(state, local);
}

export function localPointToLonLat(state, local) {
  if (!local || !state.context) {
    return null;
  }

  return unprojectMapPoint(local.x, local.z, state.context.bounds, state.context.size);
}

export function visibleGeoBounds(state, { inset = 18, padRatio = 0.04 } = {}) {
  if (!state.context || !state.container) {
    return null;
  }

  const rect = state.container.getBoundingClientRect();
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
  const raw = {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
  const lonPad = Math.max(0.002, (raw.maxLon - raw.minLon) * padRatio);
  const latPad = Math.max(0.002, (raw.maxLat - raw.minLat) * padRatio);
  const bounds = state.context.bounds;

  return {
    minLon: Math.max(bounds.minLon, raw.minLon - lonPad),
    maxLon: Math.min(bounds.maxLon, raw.maxLon + lonPad),
    minLat: Math.max(bounds.minLat, raw.minLat - latPad),
    maxLat: Math.min(bounds.maxLat, raw.maxLat + latPad),
  };
}
