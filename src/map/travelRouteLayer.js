import * as THREE from "three";
import { projectLonLat } from "./geo.js";
import { disposeObject3D } from "./overlays.js";

const DAY_COLORS = ["#d4a24a", "#5f8f78", "#2a5564", "#a56d52", "#6e5d8f"];

export function clearTravelRouteLayer(state) {
  if (!state.travelRouteGroup) {
    return;
  }

  state.terrainGroup.remove(state.travelRouteGroup);
  disposeObject3D(state.travelRouteGroup);
  state.travelRouteGroup = null;
}

export function syncTravelRouteLayer(state, routeDays = []) {
  clearTravelRouteLayer(state);
  if (!state.context || !routeDays.length) {
    return;
  }

  const group = new THREE.Group();
  routeDays.forEach((routeDay, index) => {
    if (!routeDay.coordinates || routeDay.coordinates.length < 2) {
      return;
    }

    const points = routeDay.coordinates.map(([lon, lat]) => {
      const height = state.context.terrain.sampleHeight(lon, lat) + 0.22 + index * 0.02;
      return new THREE.Vector3(...projectLonLat(lon, lat, state.context.bounds, state.context.size, height));
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: DAY_COLORS[index % DAY_COLORS.length],
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 12;
    group.add(line);
  });

  if (!group.children.length) {
    disposeObject3D(group);
    return;
  }

  state.travelRouteGroup = group;
  state.terrainGroup.add(group);
}
