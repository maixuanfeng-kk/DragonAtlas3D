import * as THREE from "three";
import { CHINA_BOUNDS, computeWorldSize } from "./geo.js";
import { disposeObject3D, fitRenderer } from "./overlays.js";
import { clearSceneArrival } from "./sceneTransitions.js";
import { FIT_MARGIN, TERRAIN_BASE_Y, TOP_CAMERA, TILT_CAMERA, DEFAULT_VIEW_ZOOM } from "./viewState.js";

function createDetailLayerState() {
  return { key: "", loadingKey: "", group: null, labels: [], features: [] };
}

export function createSceneState({ container, labelLayer, callbacks, cameraModeRef, residentialLayerStateRef, trailRef }) {
  return {
    container,
    labelLayer,
    callbacks,
    cameraModeRef,
    residentialLayerStateRef,
    trailRef,
    disposed: false,
    animationFrame: 0,
    context: null,
    terrainMesh: null,
    lineGroup: null,
    markerGroup: null,
    majorRiverGroup: null,
    travelRouteGroup: null,
    travelNodeLayer: { group: null, labels: [], features: [] },
    labelItems: [],
    poiLayer: { group: null, marker: null, labels: [], feature: null },
    cityDetailLayer: createDetailLayerState(),
    districtDetailLayer: createDetailLayerState(),
    townshipDetailLayer: createDetailLayerState(),
    residentialLayer: createDetailLayerState(),
    tributaryRiverLayer: createDetailLayerState(),
    residentialTimer: 0,
    arrivalTimer: 0,
    hasArrivedOnce: false,
    transitionPreset: null,
    viewZoom: DEFAULT_VIEW_ZOOM,
    targetZoom: DEFAULT_VIEW_ZOOM,
    pan: new THREE.Vector3(0, TERRAIN_BASE_Y, 0),
    targetPan: new THREE.Vector3(0, TERRAIN_BASE_Y, 0),
    activePointers: new Map(),
    pointerStart: new Map(),
    lastPinchDistance: 0,
    isPointerDragging: false,
    isRenderingRegion: false,
    lodFocusLonLat: null,
    scene: null,
    camera: null,
    renderer: null,
    terrainGroup: null,
    raycaster: null,
    pointer: null,
    groundPlane: null,
    resizeObserver: null,
    removeInteractionListeners: () => {},
    scheduleResidentialRefresh: null,
    api: null,
  };
}

export function setupSceneRuntime(state) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#06111d");
  scene.fog = new THREE.Fog("#0b1622", 34, 76);

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
  state.container.appendChild(renderer.domElement);

  const terrainGroup = new THREE.Group();
  terrainGroup.position.copy(state.pan);
  scene.add(terrainGroup);

  const basePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 54),
    new THREE.MeshBasicMaterial({ color: "#07121d" }),
  );
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.y = TERRAIN_BASE_Y - 0.08;
  scene.add(basePlane);

  scene.add(new THREE.HemisphereLight("#d6e8ff", "#102235", 1.04));
  const keyLight = new THREE.DirectionalLight("#f7e6b6", 1.1);
  keyLight.position.set(-11, 18, 11);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.left = -22;
  keyLight.shadow.camera.right = 22;
  keyLight.shadow.camera.top = 18;
  keyLight.shadow.camera.bottom = -18;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight("#85b8ff", 0.52);
  rimLight.position.set(10, 10, -10);
  scene.add(rimLight);

  state.scene = scene;
  state.camera = camera;
  state.renderer = renderer;
  state.terrainGroup = terrainGroup;
  state.raycaster = new THREE.Raycaster();
  state.pointer = new THREE.Vector2();
  state.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TERRAIN_BASE_Y);
}

export function setCameraForMode(state) {
  const target = state.cameraModeRef.current === "tilt" ? TILT_CAMERA : TOP_CAMERA;
  state.camera.position.lerp(target, 0.12);
  state.camera.up.set(0, 0, -1);
  state.camera.lookAt(0, TERRAIN_BASE_Y, 0);
  state.camera.zoom = state.viewZoom;
  state.camera.updateProjectionMatrix();
}

export function resizeScene(state) {
  fitRenderer(state.renderer, state.camera, state.container, state.context?.size || computeWorldSize(CHINA_BOUNDS), FIT_MARGIN);
}

export function clearDetailLayer(state, layer) {
  if (layer.group) {
    state.terrainGroup.remove(layer.group);
    disposeObject3D(layer.group);
    layer.group = null;
  }

  layer.labels.forEach((item) => item.element.remove());
  layer.labels = [];
  layer.features = [];
  layer.key = "";
  layer.loadingKey = "";
}

export function clearPoiLayer(state) {
  const { poiLayer } = state;
  if (poiLayer.group) {
    state.terrainGroup.remove(poiLayer.group);
    disposeObject3D(poiLayer.group);
    poiLayer.group = null;
  }
  if (poiLayer.marker) {
    state.terrainGroup.remove(poiLayer.marker);
    disposeObject3D(poiLayer.marker);
    poiLayer.marker = null;
  }
  poiLayer.labels.forEach((item) => item.element.remove());
  poiLayer.labels = [];
  poiLayer.feature = null;
}

export function clearSceneLayers(state) {
  clearDetailLayer(state, state.cityDetailLayer);
  clearDetailLayer(state, state.districtDetailLayer);
  clearDetailLayer(state, state.townshipDetailLayer);
  clearDetailLayer(state, state.residentialLayer);
  clearDetailLayer(state, state.tributaryRiverLayer);
  clearPoiLayer(state);

  if (state.residentialTimer) {
    window.clearTimeout(state.residentialTimer);
    state.residentialTimer = 0;
  }

  clearSceneArrival(state);

  if (state.terrainMesh) {
    state.terrainGroup.remove(state.terrainMesh);
    state.terrainMesh.material.map?.dispose();
    state.terrainMesh.geometry.dispose();
    state.terrainMesh.material.dispose();
    state.terrainMesh = null;
  }

  if (state.lineGroup) {
    state.terrainGroup.remove(state.lineGroup);
    disposeObject3D(state.lineGroup);
    state.lineGroup = null;
  }

  if (state.markerGroup) {
    state.terrainGroup.remove(state.markerGroup);
    disposeObject3D(state.markerGroup);
    state.markerGroup = null;
  }

  if (state.majorRiverGroup) {
    state.terrainGroup.remove(state.majorRiverGroup);
    disposeObject3D(state.majorRiverGroup);
    state.majorRiverGroup = null;
  }

  if (state.travelRouteGroup) {
    state.terrainGroup.remove(state.travelRouteGroup);
    disposeObject3D(state.travelRouteGroup);
    state.travelRouteGroup = null;
  }

  if (state.travelNodeLayer.group) {
    state.terrainGroup.remove(state.travelNodeLayer.group);
    disposeObject3D(state.travelNodeLayer.group);
    state.travelNodeLayer.group = null;
  }
  state.travelNodeLayer.labels.forEach((item) => item.element.remove());
  state.travelNodeLayer.labels = [];
  state.travelNodeLayer.features = [];

  state.labelItems = [];
  state.labelLayer.replaceChildren();
}
