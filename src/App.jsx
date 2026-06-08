import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { datavBoundaryUrl, datavSingleBoundaryUrl, loadAdminGeoJson, loadRiverGeoJson, loadTownshipGeoJson } from "./map/dataSources.js";
import {
  CHINA_BOUNDS,
  clamp,
  computeWorldSize,
  featureBounds,
  featureCenter,
  findFeatureAt,
  geometryToPolygons,
  mergeBounds,
  padBounds,
  projectLonLat,
  thinRing,
  unprojectMapPoint,
} from "./map/geo.js";
import { buildTerrainSurface } from "./map/terrain.js";
import { buildRiverLabels, createRiverGroup, filterRiverFeatures } from "./map/rivers.js";

const DEFAULT_VIEW_ZOOM = 1;
const MIN_VIEW_ZOOM = 0.75;
const MAX_VIEW_ZOOM = 42;
const LOD_ZOOM = {
  countryCities: 2.15,
  countryDistricts: 10,
  countryTownships: 18,
  provinceDistricts: 2.55,
  provinceTownships: 7.5,
  cityTownships: 3.2,
  tributaryRivers: 2.35,
};
const FIT_MARGIN = 1.18;
const TERRAIN_BASE_Y = -0.72;
const TOP_CAMERA = new THREE.Vector3(0, 28, 0);
const TILT_CAMERA = new THREE.Vector3(0, 26, 11);
const COUNTRY_NODE = {
  name: "全国",
  fullName: "中华人民共和国",
  adcode: "100000",
  level: "country",
};

const NANSHA_MARKERS = [
  { name: "永暑礁", center: [112.88, 9.55], detail: true },
  { name: "美济礁", center: [115.53, 9.91], detail: true },
  { name: "渚碧礁", center: [114.07, 10.91], detail: true },
  { name: "南沙群岛", center: [113.7, 9.8], label: true },
];

const INITIAL_STATS = {
  cells: 0,
  maxElevation: 0,
  demZoom: 0,
  tiles: 0,
  rasterZoom: 0,
  rasterTiles: 0,
  hillshadeTiles: 0,
  featureCount: 0,
};

function levelName(level) {
  return {
    country: "全国",
    province: "省级",
    city: "地级市",
    district: "区县",
    township: "乡镇/街道",
  }[level] || level;
}

function childLevelName(features) {
  const first = features.find((feature) => feature.properties?.name);
  return levelName(first?.properties?.level || "province");
}

function shortName(name = "") {
  return name
    .replace(/特别行政区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/藏族羌族自治州$/, "")
    .replace(/藏族自治州$/, "")
    .replace(/彝族自治州$/, "")
    .replace(/蒙古自治州$/, "")
    .replace(/自治州$/, "")
    .replace(/自治区$/, "")
    .replace(/地区$/, "")
    .replace(/自治县$/, "")
    .replace(/街道办事处$/, "街道")
    .replace(/[省市县区盟]$/, "");
}

function normalizeFeature(feature) {
  const properties = feature.properties || {};
  const adcode = String(properties.adcode);
  return {
    name: shortName(properties.name),
    fullName: properties.name,
    adcode,
    level: properties.level,
    feature,
  };
}

function sourceUrlForNode(node, collection = false) {
  if (!node?.adcode) {
    return datavBoundaryUrl("100000");
  }

  return collection ? datavBoundaryUrl(node.adcode) : datavSingleBoundaryUrl(node.adcode);
}

function createLineGroup({ features, bounds, size, sampleHeight, selectedAdcode, variant = "base" }) {
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

function createMarkerGroup({ bounds, size, sampleHeight }) {
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

function disposeObject3D(object) {
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

function createLabelElements({ labels, labelLayer, replace = true }) {
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

function buildLabels({ features, bounds, level }) {
  const labels = features
    .filter((feature) => feature.properties?.name)
    .map((feature) => {
      const center = featureCenter(feature);
      const type =
        level === "country" ? "province" : level === "province" ? "city" : level === "township" ? "township" : "district";
      return {
        key: String(feature.properties.adcode),
        type,
        text: shortName(feature.properties.name),
        center,
        minZoom: level === "township" ? 0.2 : 0,
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

function updateLabelPositions({ labelItems, camera, terrainGroup, container, context, zoom }) {
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
    const height = context.terrain.sampleHeight(lon, lat) + 0.18;
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

function fitRenderer(renderer, camera, container, size) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const aspect = container.clientWidth / container.clientHeight;
  const fitWidth = size.width * FIT_MARGIN;
  const fitHeight = size.depth * FIT_MARGIN;
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

function featureListForSearch(features) {
  return features
    .filter((feature) => feature.properties?.name)
    .map((feature) => normalizeFeature(feature))
    .sort((a, b) => a.adcode.localeCompare(b.adcode));
}

function findFeatureNear(lon, lat, features, maxDistance = 2.8) {
  const exact = findFeatureAt(lon, lat, features);
  if (exact) {
    return exact;
  }

  let nearest = null;
  let nearestDistance = maxDistance * maxDistance;
  features.forEach((feature) => {
    const [centerLon, centerLat] = featureCenter(feature);
    const distance = (centerLon - lon) ** 2 + (centerLat - lat) ** 2;
    if (distance < nearestDistance) {
      nearest = feature;
      nearestDistance = distance;
    }
  });

  return nearest;
}

export default function App() {
  const stageRef = useRef(null);
  const labelLayerRef = useRef(null);
  const sceneApiRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState(INITIAL_STATS);
  const [trail, setTrail] = useState([COUNTRY_NODE]);
  const [selectedNode, setSelectedNode] = useState(COUNTRY_NODE);
  const [currentNode, setCurrentNode] = useState(COUNTRY_NODE);
  const [currentFeatures, setCurrentFeatures] = useState([]);
  const [cameraMode, setCameraMode] = useState("top");
  const [search, setSearch] = useState("");
  const trailRef = useRef(trail);
  const cameraModeRef = useRef(cameraMode);

  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    const container = stageRef.current;
    const labelLayer = labelLayerRef.current;
    if (!container || !labelLayer) {
      return undefined;
    }

    let disposed = false;
    let animationFrame = 0;
    let context = null;
    let terrainMesh = null;
    let lineGroup = null;
    let markerGroup = null;
    let majorRiverGroup = null;
    let labelItems = [];
    const cityDetailLayer = { key: "", loadingKey: "", group: null, labels: [], features: [] };
    const districtDetailLayer = { key: "", loadingKey: "", group: null, labels: [], features: [] };
    const townshipDetailLayer = { key: "", loadingKey: "", group: null, labels: [], features: [] };
    const tributaryRiverLayer = { key: "", loadingKey: "", group: null, labels: [], features: [] };
    let viewZoom = DEFAULT_VIEW_ZOOM;
    let targetZoom = DEFAULT_VIEW_ZOOM;
    const pan = new THREE.Vector3(0, TERRAIN_BASE_Y, 0);
    const targetPan = new THREE.Vector3(0, TERRAIN_BASE_Y, 0);
    const activePointers = new Map();
    const pointerStart = new Map();
    let lastPinchDistance = 0;
    let isPointerDragging = false;
    let isRenderingRegion = false;
    let lodFocusLonLat = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d6d8c3");
    scene.fog = new THREE.Fog("#d6d8c3", 28, 58);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 90);
    camera.up.set(0, 0, -1);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    const terrainGroup = new THREE.Group();
    terrainGroup.position.copy(pan);
    scene.add(terrainGroup);

    const basePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 54),
      new THREE.MeshBasicMaterial({ color: "#d6d8c3" }),
    );
    basePlane.rotation.x = -Math.PI / 2;
    basePlane.position.y = TERRAIN_BASE_Y - 0.08;
    scene.add(basePlane);

    const ambient = new THREE.HemisphereLight("#fff4cf", "#30443d", 0.9);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight("#fff0c4", 0.85);
    keyLight.position.set(-9, 15, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.left = -22;
    keyLight.shadow.camera.right = 22;
    keyLight.shadow.camera.top = 18;
    keyLight.shadow.camera.bottom = -18;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight("#b7d4c6", 0.35);
    rimLight.position.set(8, 9, -9);
    scene.add(rimLight);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TERRAIN_BASE_Y);

    const setCameraForMode = () => {
      const target = cameraModeRef.current === "tilt" ? TILT_CAMERA : TOP_CAMERA;
      camera.position.lerp(target, 0.12);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, TERRAIN_BASE_Y, 0);
      camera.zoom = viewZoom;
      camera.updateProjectionMatrix();
    };

    const resize = () => {
      fitRenderer(renderer, camera, container, context?.size || computeWorldSize(CHINA_BOUNDS));
    };

    const clearDetailLayer = (layer) => {
      if (layer.group) {
        terrainGroup.remove(layer.group);
        disposeObject3D(layer.group);
        layer.group = null;
      }

      layer.labels.forEach((item) => item.element.remove());
      layer.labels = [];
      layer.features = [];
      layer.key = "";
      layer.loadingKey = "";
    };

    const clearSceneLayers = () => {
      clearDetailLayer(cityDetailLayer);
      clearDetailLayer(districtDetailLayer);
      clearDetailLayer(townshipDetailLayer);
      clearDetailLayer(tributaryRiverLayer);

      if (terrainMesh) {
        terrainGroup.remove(terrainMesh);
        terrainMesh.material.map?.dispose();
        terrainMesh.geometry.dispose();
        terrainMesh.material.dispose();
        terrainMesh = null;
      }

      if (lineGroup) {
        terrainGroup.remove(lineGroup);
        disposeObject3D(lineGroup);
        lineGroup = null;
      }

      if (markerGroup) {
        terrainGroup.remove(markerGroup);
        disposeObject3D(markerGroup);
        markerGroup = null;
      }

      if (majorRiverGroup) {
        terrainGroup.remove(majorRiverGroup);
        disposeObject3D(majorRiverGroup);
        majorRiverGroup = null;
      }

      labelItems = [];
      labelLayer.replaceChildren();
    };

    const updateSelectedHighlight = (adcode) => {
      if (!context || !lineGroup) {
        return;
      }

      terrainGroup.remove(lineGroup);
      disposeObject3D(lineGroup);
      lineGroup = createLineGroup({
        features: context.features,
        bounds: context.bounds,
        size: context.size,
        sampleHeight: context.terrain.sampleHeight,
        selectedAdcode: adcode,
      });
      terrainGroup.add(lineGroup);
    };

    const renderRegion = async ({ node, nextTrail }) => {
      isRenderingRegion = true;
      setLoading(true);
      setNotice("");

      try {
        const geojson = await loadAdminGeoJson(node.adcode);
        if (disposed) {
          return;
        }

        const features = geojson.features || [];
        const namedFeatures = features.filter((feature) => feature.properties?.name);
        const level = node.level;
        const bounds =
          level === "country"
            ? CHINA_BOUNDS
            : padBounds(node.feature ? featureBounds(node.feature) : mergeBounds(features.map(featureBounds)), 0.16);
        const size = computeWorldSize(bounds);
        const terrain = await buildTerrainSurface({ bounds, size, features, level });

        if (disposed) {
          terrain.geometry.dispose();
          terrain.texture?.dispose();
          return;
        }

        clearSceneLayers();
        context = {
          node,
          level,
          bounds,
          size,
          features,
          namedFeatures,
          sourceUrl: geojson.__sourceUrl || datavBoundaryUrl(node.adcode),
          terrain,
        };

        terrainMesh = new THREE.Mesh(
          terrain.geometry,
          new THREE.MeshBasicMaterial({
            map: terrain.texture || null,
            vertexColors: !terrain.texture,
            side: THREE.DoubleSide,
          }),
        );
        terrainGroup.add(terrainMesh);

        let majorRiverFeatures = [];
        try {
          const majorRiverGeojson = await loadRiverGeoJson("major");
          if (disposed) {
            return;
          }

          majorRiverFeatures = filterRiverFeatures({
            geojson: majorRiverGeojson,
            bounds,
            kind: "major",
            maxFeatures: level === "country" ? 34 : 24,
          });
          majorRiverGroup = createRiverGroup({
            features: majorRiverFeatures,
            bounds,
            size,
            sampleHeight: terrain.sampleHeight,
            kind: "major",
          });
          terrainGroup.add(majorRiverGroup);
        } catch (error) {
          console.warn(error);
          if (!disposed) {
            setNotice(error instanceof Error ? error.message : "主干河流加载失败");
          }
        }

        lineGroup = createLineGroup({
          features,
          bounds,
          size,
          sampleHeight: terrain.sampleHeight,
          selectedAdcode: null,
        });
        terrainGroup.add(lineGroup);

        markerGroup = createMarkerGroup({ bounds, size, sampleHeight: terrain.sampleHeight });
        terrainGroup.add(markerGroup);

        labelItems = createLabelElements({
          labels: [
            ...buildLabels({ features: namedFeatures, bounds, level }),
            ...buildRiverLabels({
              features: majorRiverFeatures,
              bounds,
              kind: "major",
              maxLabels: level === "country" ? 7 : 5,
            }),
          ],
          labelLayer,
        });

        targetZoom = DEFAULT_VIEW_ZOOM;
        viewZoom = DEFAULT_VIEW_ZOOM;
        lodFocusLonLat = null;
        targetPan.set(0, TERRAIN_BASE_Y, 0);
        pan.copy(targetPan);
        terrainGroup.position.copy(pan);
        resize();

        setCurrentNode(node);
        setSelectedNode(node);
        setTrail(nextTrail);
        setCurrentFeatures(featureListForSearch(namedFeatures));
        setStats({
          cells: terrain.stats.cells,
          maxElevation: terrain.stats.maxElevation,
          demZoom: terrain.demZoom,
          tiles: terrain.tiles,
          rasterZoom: terrain.rasterZoom,
          rasterTiles: terrain.rasterTiles,
          hillshadeTiles: terrain.hillshadeTiles,
          featureCount: namedFeatures.length,
        });
        setSearch("");
      } catch (error) {
        console.error(error);
        if (!disposed) {
          setNotice(error instanceof Error ? error.message : "地图数据加载失败");
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
        isRenderingRegion = false;
      }
    };

    const drillIntoFeature = async (feature) => {
      const nextNode = normalizeFeature(feature);
      const baseTrail = context?.node?.level === "country" ? [COUNTRY_NODE] : trailRef.current;
      const nextTrail = [...baseTrail.filter((node) => node.level !== "district"), nextNode];
      await renderRegion({ node: nextNode, nextTrail });
    };

    const selectFeature = (feature) => {
      const node = normalizeFeature(feature);
      const baseTrail = trailRef.current.filter((item) => item.level !== "district");
      setSelectedNode(node);
      setTrail([...baseTrail, node]);
      updateSelectedHighlight(node.adcode);
    };

    const chooseFeature = (feature) => {
      if (!feature?.properties?.name) {
        return;
      }

      if (feature.properties.level === "province" || feature.properties.level === "city") {
        drillIntoFeature(feature);
        return;
      }

      selectFeature(feature);
    };

    const clientPointToMapLocal = (clientX, clientY) => {
      if (!context) {
        return null;
      }

      const rect = container.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);

      const terrainHit = terrainMesh ? raycaster.intersectObject(terrainMesh, false)[0] : null;
      let point = terrainHit?.point;

      if (!point) {
        point = new THREE.Vector3();
        raycaster.ray.intersectPlane(groundPlane, point);
      }

      if (!point) {
        return null;
      }

      const local = terrainGroup.worldToLocal(point.clone());
      return local;
    };

    const clientPointToLonLat = (clientX, clientY) => {
      const local = clientPointToMapLocal(clientX, clientY);
      if (!local || !context) {
        return null;
      }

      return unprojectMapPoint(local.x, local.z, context.bounds, context.size);
    };

    const clientToLonLat = (event) => clientPointToLonLat(event.clientX, event.clientY);

    const activePointerCenter = () => {
      const pointers = [...activePointers.values()];
      if (!pointers.length) {
        const rect = container.getBoundingClientRect();
        return {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        };
      }

      const total = pointers.reduce(
        (sum, item) => ({
          x: sum.x + item.x,
          y: sum.y + item.y,
        }),
        { x: 0, y: 0 },
      );

      return {
        clientX: total.x / pointers.length,
        clientY: total.y / pointers.length,
      };
    };

    const zoomAtPoint = (clientX, clientY, nextZoom) => {
      const local = clientPointToMapLocal(clientX, clientY);
      if (!local) {
        targetZoom = nextZoom;
        return null;
      }

      const lonLat = context ? unprojectMapPoint(local.x, local.z, context.bounds, context.size) : null;
      const rect = container.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
      const viewWidth = (camera.right - camera.left) / nextZoom;
      const viewHeight = (camera.top - camera.bottom) / nextZoom;

      targetZoom = nextZoom;
      targetPan.x = (ndcX * viewWidth) / 2 - local.x;
      targetPan.z = (-ndcY * viewHeight) / 2 - local.z;
      return lonLat;
    };

    const renderDetailLayer = async ({ layer, feature, variant, labelLevel }) => {
      if (!feature?.properties?.adcode || !context) {
        clearDetailLayer(layer);
        return;
      }

      const key = `${labelLevel}:${feature.properties.adcode}`;
      if (layer.key === key || layer.loadingKey === key) {
        return;
      }

      const requestContext = context;
      layer.loadingKey = key;

      try {
        const geojson = await loadAdminGeoJson(feature.properties.adcode);
        if (disposed || context !== requestContext || layer.loadingKey !== key) {
          return;
        }

        const features = (geojson.features || []).filter((item) => item.properties?.name);
        clearDetailLayer(layer);
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
        terrainGroup.add(layer.group);
        layer.labels = createLabelElements({
          labels: buildLabels({ features, bounds: requestContext.bounds, level: labelLevel }),
          labelLayer,
          replace: false,
        });
      } catch (error) {
        console.warn(error);
        if (layer.loadingKey === key) {
          layer.loadingKey = "";
        }
        if (!disposed) {
          setNotice(error instanceof Error ? error.message : "细节边界加载失败");
        }
      }
    };

    const renderTownshipLayer = async ({ provinceFeature, cityFeature, districtFeature, provinceName = "", cityName = "" }) => {
      if (!context || !districtFeature?.properties?.name) {
        clearDetailLayer(townshipDetailLayer);
        return;
      }

      const nextProvinceName = provinceName || provinceFeature?.properties?.name || "";
      const nextCityName = cityName || cityFeature?.properties?.name || "";
      const districtName = districtFeature.properties.name;
      if (!nextProvinceName || !nextCityName || !districtName) {
        clearDetailLayer(townshipDetailLayer);
        return;
      }

      const key = `township:${nextProvinceName}/${nextCityName}/${districtName}`;
      if (townshipDetailLayer.key === key || townshipDetailLayer.loadingKey === key) {
        return;
      }

      const requestContext = context;
      townshipDetailLayer.loadingKey = key;

      try {
        const geojson = await loadTownshipGeoJson({
          provinceName: nextProvinceName,
          cityName: nextCityName,
          districtName,
          maxFiles: 120,
        });
        if (disposed || context !== requestContext || townshipDetailLayer.loadingKey !== key) {
          return;
        }

        const features = (geojson.features || []).filter((item) => item.properties?.name && item.geometry);
        clearDetailLayer(townshipDetailLayer);
        townshipDetailLayer.key = key;
        townshipDetailLayer.features = features;

        if (!features.length) {
          return;
        }

        townshipDetailLayer.group = createLineGroup({
          features,
          bounds: requestContext.bounds,
          size: requestContext.size,
          sampleHeight: requestContext.terrain.sampleHeight,
          selectedAdcode: null,
          variant: "townshipDetail",
        });
        terrainGroup.add(townshipDetailLayer.group);
        townshipDetailLayer.labels = createLabelElements({
          labels: buildLabels({ features, bounds: requestContext.bounds, level: "township" }),
          labelLayer,
          replace: false,
        });
      } catch (error) {
        console.warn(error);
        if (townshipDetailLayer.loadingKey === key) {
          townshipDetailLayer.loadingKey = "";
        }
        if (!disposed) {
          setNotice(error instanceof Error ? error.message : "乡镇街道边界加载失败");
        }
      }
    };

    const renderTributaryRivers = async ({ provinceAdcode = "", maxFeatures = 90, maxLabels = 16 } = {}) => {
      if (!context) {
        clearDetailLayer(tributaryRiverLayer);
        return;
      }

      const zoomBucket = Math.min(9, Math.floor(targetZoom));
      const key = `tributary:${context.node.adcode}:${provinceAdcode || "view"}:${maxFeatures}:z${zoomBucket}`;
      if (tributaryRiverLayer.key === key || tributaryRiverLayer.loadingKey === key) {
        return;
      }

      const requestContext = context;
      tributaryRiverLayer.loadingKey = key;

      try {
        const geojson = await loadRiverGeoJson("tributary");
        if (disposed || context !== requestContext || tributaryRiverLayer.loadingKey !== key) {
          return;
        }

        const features = filterRiverFeatures({
          geojson,
          bounds: requestContext.bounds,
          provinceAdcode,
          kind: "tributary",
          maxFeatures,
          targetZoom,
        });

        clearDetailLayer(tributaryRiverLayer);
        tributaryRiverLayer.key = key;
        tributaryRiverLayer.features = features;
        tributaryRiverLayer.group = createRiverGroup({
          features,
          bounds: requestContext.bounds,
          size: requestContext.size,
          sampleHeight: requestContext.terrain.sampleHeight,
          kind: "tributary",
        });
        terrainGroup.add(tributaryRiverLayer.group);
        tributaryRiverLayer.labels = createLabelElements({
          labels: buildRiverLabels({
            features,
            bounds: requestContext.bounds,
            kind: "tributary",
            maxLabels,
          }),
          labelLayer,
          replace: false,
        });
      } catch (error) {
        console.warn(error);
        if (tributaryRiverLayer.loadingKey === key) {
          tributaryRiverLayer.loadingKey = "";
        }
        if (!disposed) {
          setNotice(error instanceof Error ? error.message : "支流数据加载失败");
        }
      }
    };

    const provinceNameFromTrail = () => {
      const provinceNode = trailRef.current.find((item) => item.level === "province");
      return provinceNode?.fullName || provinceNode?.name || "";
    };

    const updateDetailLayers = async (lonLat = lodFocusLonLat) => {
      if (!lonLat || !context || isRenderingRegion) {
        return;
      }

      if (context.level === "country") {
        if (targetZoom < LOD_ZOOM.countryCities) {
          clearDetailLayer(cityDetailLayer);
          clearDetailLayer(districtDetailLayer);
          clearDetailLayer(townshipDetailLayer);
          clearDetailLayer(tributaryRiverLayer);
          return;
        }

        const provinceFeature = findFeatureAt(lonLat[0], lonLat[1], context.namedFeatures);
        if (!provinceFeature) {
          clearDetailLayer(cityDetailLayer);
          clearDetailLayer(districtDetailLayer);
          clearDetailLayer(townshipDetailLayer);
          clearDetailLayer(tributaryRiverLayer);
          return;
        }

        if (targetZoom >= LOD_ZOOM.tributaryRivers) {
          await renderTributaryRivers({
            provinceAdcode: provinceFeature.properties.adcode,
            maxFeatures: 42,
            maxLabels: 8,
          });
        } else {
          clearDetailLayer(tributaryRiverLayer);
        }

        await renderDetailLayer({
          layer: cityDetailLayer,
          feature: provinceFeature,
          variant: "cityDetail",
          labelLevel: "province",
        });

        if (targetZoom < LOD_ZOOM.countryDistricts) {
          clearDetailLayer(districtDetailLayer);
          clearDetailLayer(townshipDetailLayer);
          return;
        }

        const cityFeature = findFeatureNear(lonLat[0], lonLat[1], cityDetailLayer.features);
        if (!cityFeature) {
          clearDetailLayer(districtDetailLayer);
          clearDetailLayer(townshipDetailLayer);
          return;
        }

        await renderDetailLayer({
          layer: districtDetailLayer,
          feature: cityFeature,
          variant: "districtDetail",
          labelLevel: "city",
        });

        if (targetZoom >= LOD_ZOOM.countryTownships) {
          const districtFeature = findFeatureNear(lonLat[0], lonLat[1], districtDetailLayer.features, 0.8);
          if (districtFeature) {
            await renderTownshipLayer({ provinceFeature, cityFeature, districtFeature });
          } else {
            clearDetailLayer(townshipDetailLayer);
          }
        } else {
          clearDetailLayer(townshipDetailLayer);
        }
        return;
      }

      clearDetailLayer(cityDetailLayer);
      if (targetZoom >= LOD_ZOOM.tributaryRivers) {
        await renderTributaryRivers({
          provinceAdcode: context.level === "province" ? context.node.adcode : "",
          maxFeatures: context.level === "province" ? 54 : 32,
          maxLabels: context.level === "province" ? 10 : 6,
        });
      } else {
        clearDetailLayer(tributaryRiverLayer);
      }

      if (context.level === "province") {
        if (targetZoom < LOD_ZOOM.provinceDistricts) {
          clearDetailLayer(districtDetailLayer);
          clearDetailLayer(townshipDetailLayer);
          return;
        }

        const cityFeature = findFeatureNear(lonLat[0], lonLat[1], context.namedFeatures);
        if (!cityFeature) {
          clearDetailLayer(districtDetailLayer);
          clearDetailLayer(townshipDetailLayer);
          return;
        }

        await renderDetailLayer({
          layer: districtDetailLayer,
          feature: cityFeature,
          variant: "districtDetail",
          labelLevel: "city",
        });

        if (targetZoom >= LOD_ZOOM.provinceTownships) {
          const districtFeature = findFeatureNear(lonLat[0], lonLat[1], districtDetailLayer.features, 0.8);
          if (districtFeature) {
            await renderTownshipLayer({
              provinceName: context.node.fullName || context.node.name,
              cityFeature,
              districtFeature,
            });
          } else {
            clearDetailLayer(townshipDetailLayer);
          }
        } else {
          clearDetailLayer(townshipDetailLayer);
        }
        return;
      }

      clearDetailLayer(districtDetailLayer);
      if (context.level === "city") {
        if (targetZoom < LOD_ZOOM.cityTownships) {
          clearDetailLayer(townshipDetailLayer);
          return;
        }

        const provinceName = provinceNameFromTrail();
        const districtFeature = findFeatureNear(lonLat[0], lonLat[1], context.namedFeatures, 0.8);
        if (!provinceName || !districtFeature) {
          clearDetailLayer(townshipDetailLayer);
          return;
        }

        await renderTownshipLayer({
          provinceName,
          cityName: context.node.fullName || context.node.name,
          districtFeature,
        });
        return;
      }

      clearDetailLayer(townshipDetailLayer);
    };

    const handleClick = (event) => {
      const lonLat = clientToLonLat(event);
      if (!lonLat || !context) {
        return;
      }

      const feature = findFeatureAt(lonLat[0], lonLat[1], context.namedFeatures);
      if (feature) {
        chooseFeature(feature);
      }
    };

    const pointerDistance = () => {
      const pointers = [...activePointers.values()];
      if (pointers.length < 2) {
        return 0;
      }

      const [first, second] = pointers;
      return Math.hypot(second.x - first.x, second.y - first.y);
    };

    const onPointerDown = (event) => {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      pointerStart.set(event.pointerId, { x: event.clientX, y: event.clientY });
      lastPinchDistance = pointerDistance();
      isPointerDragging = false;
      container.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (!activePointers.has(event.pointerId)) {
        return;
      }

      const previous = activePointers.get(event.pointerId);
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const start = pointerStart.get(event.pointerId);
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
        isPointerDragging = true;
      }

      if (activePointers.size >= 2) {
        const nextDistance = pointerDistance();
        if (nextDistance > 0 && lastPinchDistance > 0) {
          const zoomRatio = nextDistance / lastPinchDistance;
          const nextZoom = clamp(targetZoom * zoomRatio, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
          const center = activePointerCenter();
          lodFocusLonLat = zoomAtPoint(center.clientX, center.clientY, nextZoom);
          void updateDetailLayers(lodFocusLonLat);
        }
        lastPinchDistance = nextDistance;
        return;
      }

      const viewWidth = camera.right - camera.left;
      const viewHeight = camera.top - camera.bottom;
      targetPan.x += (dx / container.clientWidth) * (viewWidth / viewZoom);
      targetPan.z += (dy / container.clientHeight) * (viewHeight / viewZoom);
    };

    const onPointerUp = (event) => {
      const start = pointerStart.get(event.pointerId);
      activePointers.delete(event.pointerId);
      pointerStart.delete(event.pointerId);
      lastPinchDistance = pointerDistance();
      container.releasePointerCapture?.(event.pointerId);

      if (start && !isPointerDragging) {
        handleClick(event);
      } else if (isPointerDragging && activePointers.size === 0) {
        const center = activePointerCenter();
        lodFocusLonLat = clientPointToLonLat(center.clientX, center.clientY) || lodFocusLonLat;
        void updateDetailLayers(lodFocusLonLat);
      }
    };

    const onWheel = (event) => {
      event.preventDefault();
      const nextZoom = clamp(targetZoom * Math.exp(-event.deltaY * 0.0012), MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
      lodFocusLonLat = zoomAtPoint(event.clientX, event.clientY, nextZoom);
      void updateDetailLayers(lodFocusLonLat);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("pointerleave", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    const animate = () => {
      if (disposed) {
        return;
      }

      viewZoom += (targetZoom - viewZoom) * 0.12;
      pan.lerp(targetPan, 0.16);
      terrainGroup.position.copy(pan);
      setCameraForMode();
      updateLabelPositions({
        labelItems: [
          ...labelItems,
          ...tributaryRiverLayer.labels,
          ...cityDetailLayer.labels,
          ...districtDetailLayer.labels,
          ...townshipDetailLayer.labels,
        ],
        camera,
        terrainGroup,
        container,
        context,
        zoom: viewZoom,
      });
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    sceneApiRef.current = {
      reset: () => {
        renderRegion({ node: COUNTRY_NODE, nextTrail: [COUNTRY_NODE] });
      },
      goToTrail: (index) => {
        const node = trailRef.current[index] || COUNTRY_NODE;
        const nextTrail = trailRef.current.slice(0, index + 1);
        if (node.level === "district") {
          setSelectedNode(node);
          setTrail(nextTrail);
          updateSelectedHighlight(node.adcode);
          return;
        }
        renderRegion({ node, nextTrail });
      },
      chooseByAdcode: (adcode) => {
        const feature = context?.namedFeatures.find((item) => String(item.properties?.adcode) === String(adcode));
        if (feature) {
          chooseFeature(feature);
        }
      },
      setMode: (mode) => {
        setCameraMode(mode);
      },
    };

    renderRegion({ node: COUNTRY_NODE, nextTrail: [COUNTRY_NODE] });
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("pointerleave", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      clearSceneLayers();
      renderer.dispose();
      renderer.domElement.remove();
      sceneApiRef.current = null;
    };
  }, []);

  const handleSubmitSearch = (event) => {
    event.preventDefault();
    const query = search.trim();
    if (!query) {
      return;
    }

    const match = currentFeatures.find(
      (item) => item.fullName.includes(query) || item.name.includes(query) || item.adcode === query,
    );

    if (match) {
      sceneApiRef.current?.chooseByAdcode(match.adcode);
      return;
    }

    setNotice(`当前层级没有找到“${query}”`);
  };

  const handleCopyApi = async () => {
    const url = selectedNode.level === currentNode.level ? datavBoundaryUrl(currentNode.adcode) : sourceUrlForNode(selectedNode);
    try {
      await navigator.clipboard.writeText(url);
      setNotice("GeoJSON API 已复制");
    } catch {
      setNotice("复制失败，请手动复制链接");
    }
  };

  const panelNode = selectedNode || currentNode;
  const panelApi =
    panelNode.level === currentNode.level ? datavBoundaryUrl(currentNode.adcode) : sourceUrlForNode(panelNode);

  return (
    <div className="app-shell">
      <main className="scene-stage">
        <div className="scene-vignette" aria-hidden="true"></div>
        <div ref={stageRef} className="map-surface" aria-label="真实高程中国三维地势地图"></div>
        <div ref={labelLayerRef} className="label-layer" aria-hidden="true"></div>
      </main>

      <section className="hud atlas-panel">
        <div className="brand-row">
          <div>
            <p className="eyebrow">DATAV GEOATLAS + REAL DEM</p>
            <h1>中国真实高程地图</h1>
          </div>
          <button type="button" className="icon-button" onClick={() => sceneApiRef.current?.reset()} title="返回全国">
            全国
          </button>
        </div>

        <nav className="crumbs" aria-label="行政区划层级">
          {trail.map((item, index) => (
            <button key={`${item.level}-${item.adcode}`} type="button" onClick={() => sceneApiRef.current?.goToTrail(index)}>
              {item.name}
            </button>
          ))}
        </nav>

        <form className="search-row" onSubmit={handleSubmitSearch}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`搜索${childLevelName(currentFeatures.map((item) => item.feature))}名称或 adcode`}
          />
          <button type="submit">定位</button>
        </form>

        <div className="mode-row">
          <button
            type="button"
            className={cameraMode === "top" ? "is-active" : ""}
            onClick={() => setCameraMode("top")}
          >
            俯视
          </button>
          <button
            type="button"
            className={cameraMode === "tilt" ? "is-active" : ""}
            onClick={() => setCameraMode("tilt")}
          >
            轻微倾斜
          </button>
        </div>
      </section>

      <section className="hud data-panel">
        <p className="panel-title">当前选择</p>
        <div className="selected-name">{panelNode.fullName || panelNode.name}</div>
        <dl>
          <div>
            <dt>adcode</dt>
            <dd>{panelNode.adcode}</dd>
          </div>
          <div>
            <dt>层级</dt>
            <dd>{levelName(panelNode.level)}</dd>
          </div>
          <div>
            <dt>数据粒度</dt>
            <dd>{childLevelName(currentFeatures.map((item) => item.feature))}</dd>
          </div>
          <div>
            <dt>最高海拔</dt>
            <dd>{stats.maxElevation.toLocaleString()} m</dd>
          </div>
          <div>
            <dt>DEM</dt>
            <dd>z{stats.demZoom} / {stats.tiles} tiles</dd>
          </div>
          <div>
            <dt>真实贴图</dt>
            <dd>z{stats.rasterZoom} / {stats.rasterTiles}+{stats.hillshadeTiles}</dd>
          </div>
        </dl>
        <label className="api-box">
          GeoJSON API
          <textarea readOnly value={panelApi} />
        </label>
        <button type="button" className="copy-button" onClick={handleCopyApi}>
          复制 API
        </button>
      </section>

      <section className="hud stats-panel">
        <div>
          <span>地形网格</span>
          <strong>{stats.cells.toLocaleString()}</strong>
        </div>
        <div>
          <span>行政区</span>
          <strong>{stats.featureCount}</strong>
        </div>
      </section>

      {notice && <div className="toast">{notice}</div>}

      {loading && (
        <div id="loading-mask">
          <div className="loading-card">
            <span className="loading-tag">LOADING REAL TERRAIN</span>
            <h2>加载真实高程地势</h2>
            <p>正在请求 DataV 行政边界、Terrarium DEM、真实影像和山体阴影瓦片。</p>
          </div>
        </div>
      )}
    </div>
  );
}
