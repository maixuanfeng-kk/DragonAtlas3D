import * as THREE from "three";
import { featureCenter, geometryToPolygons, projectLonLat, thinRing } from "./geo.js";
import { NANSHA_MARKERS } from "./viewState.js";

export function createLineGroup({ features, bounds, size, sampleHeight, selectedAdcode, variant = "base" }) {
  const group = new THREE.Group();
  const lineStyle =
    {
      base: {
        color: "#243e34",
        defaultOpacity: 0.45,
        subtleOpacity: 0.28,
        heightOffset: 0.045,
        maxPoints: 520,
      },
      cityDetail: {
        color: "#183f35",
        defaultOpacity: 0.38,
        subtleOpacity: 0.2,
        heightOffset: 0.075,
        maxPoints: 460,
      },
      districtDetail: {
        color: "#385445",
        defaultOpacity: 0.28,
        subtleOpacity: 0.14,
        heightOffset: 0.105,
        maxPoints: 360,
      },
      townshipDetail: {
        color: "#4c6a5b",
        defaultOpacity: 0.18,
        subtleOpacity: 0.08,
        heightOffset: 0.125,
        maxPoints: 180,
      },
      poiOutline: {
        color: "#c49033",
        defaultOpacity: 0.92,
        subtleOpacity: 0.5,
        heightOffset: 0.16,
        maxPoints: 160,
      },
    }[variant] || {};
  const defaultMaterial = new THREE.LineBasicMaterial({
    color: lineStyle.color || "#243e34",
    transparent: true,
    opacity: lineStyle.defaultOpacity ?? 0.45,
    depthTest: false,
  });
  const subtleMaterial = new THREE.LineBasicMaterial({
    color: lineStyle.color || "#243e34",
    transparent: true,
    opacity: lineStyle.subtleOpacity ?? 0.28,
    depthTest: false,
  });
  const selectedMaterial = new THREE.LineBasicMaterial({
    color: "#f9e7a2",
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });

  features.forEach((feature) => {
    const name = feature.properties?.name || "";
    const adcode = String(feature.properties?.adcode || "");
    const material = adcode === selectedAdcode ? selectedMaterial : name ? defaultMaterial : subtleMaterial;

    geometryToPolygons(feature.geometry).forEach((polygon) => {
      const outer = thinRing(polygon[0], lineStyle.maxPoints || 520);
      if (outer.length < 3) {
        return;
      }

      const points = outer.map(([lon, lat]) => {
        const height = sampleHeight(lon, lat) + (lineStyle.heightOffset ?? 0.045);
        return new THREE.Vector3(...projectLonLat(lon, lat, bounds, size, height));
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.LineLoop(geometry, material);
      line.renderOrder = variant === "base" ? 9 : variant === "cityDetail" ? 8 : variant === "districtDetail" ? 7 : 6;
      group.add(line);
    });
  });

  return group;
}

export function createMarkerGroup({ bounds, size, sampleHeight }) {
  const group = new THREE.Group();
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: "#fff0ad",
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#24483d",
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthTest: false,
  });

  NANSHA_MARKERS.forEach((marker) => {
    const [lon, lat] = marker.center;
    if (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat) {
      return;
    }

    const height = sampleHeight(lon, lat) + 0.09;
    const [x, y, z] = projectLonLat(lon, lat, bounds, size, height);
    const geometry = marker.label ? new THREE.RingGeometry(0.2, 0.28, 36) : new THREE.CircleGeometry(0.055, 24);
    const mesh = new THREE.Mesh(geometry, marker.label ? ringMaterial : dotMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    group.add(mesh);
  });

  return group;
}

export function createPoiMarker({ lon, lat, bounds, size, sampleHeight }) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.11, 0.17, 32),
    new THREE.MeshBasicMaterial({
      color: "#c78f2c",
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.05, 24),
    new THREE.MeshBasicMaterial({
      color: "#fff3c4",
      transparent: true,
      opacity: 1,
      depthTest: false,
    }),
  );
  const height = sampleHeight(lon, lat) + 0.2;
  const [x, y, z] = projectLonLat(lon, lat, bounds, size, height);

  ring.rotation.x = -Math.PI / 2;
  core.rotation.x = -Math.PI / 2;
  ring.position.set(x, y, z);
  core.position.set(x, y + 0.002, z);
  ring.renderOrder = 10;
  core.renderOrder = 11;
  group.add(ring);
  group.add(core);
  return group;
}

export function disposeObject3D(object) {
  const materials = new Set();
  object.traverse((child) => {
    child.geometry?.dispose();

    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    childMaterials.forEach((material) => {
      if (material) {
        materials.add(material);
      }
    });
  });

  materials.forEach((material) => material.dispose());
}

export function createLabelElements({ labels, labelLayer, replace = true }) {
  if (replace) {
    labelLayer.replaceChildren();
  }

  return labels.map((label) => {
    const element = document.createElement("span");
    element.className = `map-label ${label.type}-label is-hidden`;
    element.textContent = label.text;
    labelLayer.appendChild(element);

    return {
      ...label,
      element,
      vector: new THREE.Vector3(),
    };
  });
}

export function buildLabels({ features, bounds, level }) {
  const labels = features
    .filter((feature) => feature.properties?.name)
    .map((feature) => {
      const center = featureCenter(feature);
      const type =
        level === "country" ? "province" : level === "province" ? "city" : level === "township" ? "township" : level === "poi" ? "poi" : "district";
      return {
        key: String(feature.properties.adcode),
        type,
        text: feature.properties.shortName || feature.properties.name,
        center,
        minZoom: level === "township" || level === "poi" ? 0.2 : 0,
        offset: [0, 0],
      };
    });

  if (level === "country") {
    NANSHA_MARKERS.forEach((marker) => {
      labels.push({
        key: `nansha-${marker.name}`,
        type: marker.label ? "nansha" : "reef",
        text: marker.name,
        center: marker.center,
        minZoom: marker.detail ? 1.6 : 0,
        offset: marker.label ? [-42, -10] : [0, 12],
      });
    });
  }

  return labels.filter((label) => {
    const [lon, lat] = label.center;
    return lon >= bounds.minLon && lon <= bounds.maxLon && lat >= bounds.minLat && lat <= bounds.maxLat;
  });
}

export function updateLabelPositions({ labelItems, camera, terrainGroup, container, context, zoom }) {
  if (!context || !container.clientWidth || !container.clientHeight) {
    return;
  }

  terrainGroup.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  labelItems.forEach((item) => {
    if (zoom < item.minZoom) {
      item.element.classList.add("is-hidden");
      return;
    }

    const [lon, lat] = item.center;
    const height = context.terrain.sampleHeight(lon, lat) + (item.heightOffset ?? 0.18);
    item.vector.set(...projectLonLat(lon, lat, context.bounds, context.size, height));
    terrainGroup.localToWorld(item.vector);
    item.vector.project(camera);

    const x = (item.vector.x * 0.5 + 0.5) * container.clientWidth;
    const y = (-item.vector.y * 0.5 + 0.5) * container.clientHeight;
    const visible =
      item.vector.z >= -1 &&
      item.vector.z <= 1 &&
      x > -130 &&
      x < container.clientWidth + 130 &&
      y > -90 &&
      y < container.clientHeight + 90;

    if (!visible) {
      item.element.classList.add("is-hidden");
      return;
    }

    const [offsetX, offsetY] = item.offset || [0, 0];
    item.element.style.left = `${x}px`;
    item.element.style.top = `${y}px`;
    item.element.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
    item.element.classList.remove("is-hidden");
  });
}

export function fitRenderer(renderer, camera, container, size, fitMargin) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const aspect = container.clientWidth / container.clientHeight;
  const fitWidth = size.width * fitMargin;
  const fitHeight = size.depth * fitMargin;
  const viewHeight = Math.max(fitHeight, fitWidth / aspect);
  const viewWidth = viewHeight * aspect;

  renderer.setPixelRatio(ratio);
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
}
