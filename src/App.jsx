import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { HudPanels } from "./components/HudPanels.jsx";
import { TravelPlannerPanel } from "./components/TravelPlannerPanel.jsx";
import { findFeatureAt, unprojectMapPoint } from "./map/geo.js";
import { createSceneState, clearSceneLayers, setCameraForMode, setupSceneRuntime, resizeScene } from "./map/sceneRuntime.js";
import { renderRegion } from "./map/regionRenderer.js";
import { pickResidentialFeatureAt, updateResidentialLayer } from "./map/residentialLayer.js";
import { chooseFeature as submitChooseFeature, selectPoiOnMap, selectTravelFeatureOnMap, submitSearch } from "./map/searchController.js";
import { updateDetailLayers } from "./map/sceneDetails.js";
import { collectSceneLabelItems } from "./map/labelItems.js";
import { updateLabelPositions } from "./map/overlays.js";
import { syncTravelRouteLayer } from "./map/travelRouteLayer.js";
import { pickTravelNodeAt } from "./map/wuhanTravelNodes.js";
import {
  COUNTRY_NODE,
  initialResidentialLayerState,
  initialPoiSearchState,
  INITIAL_STATS,
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
  sourceUrlForNode,
} from "./map/viewState.js";
import { useTravelPlanner } from "./useTravelPlanner.js";

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
  const [poiSearchState, setPoiSearchState] = useState(initialPoiSearchState());
  const [residentialLayerState, setResidentialLayerState] = useState(initialResidentialLayerState());
  const travelPlanner = useTravelPlanner(setNotice);
  const trailRef = useRef(trail);
  const cameraModeRef = useRef(cameraMode);
  const residentialLayerStateRef = useRef(residentialLayerState);

  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    residentialLayerStateRef.current = residentialLayerState;
  }, [residentialLayerState]);

  useEffect(() => {
    const container = stageRef.current;
    const labelLayer = labelLayerRef.current;
    if (!container || !labelLayer) {
      return undefined;
    }

    const state = createSceneState({
      container,
      labelLayer,
      callbacks: {
        setLoading,
        setNotice,
        setStats,
        setTrail,
        setSelectedNode,
        setCurrentNode,
        setCurrentFeatures,
        setSearch,
        setPoiSearchState,
        setResidentialLayerState,
      },
      cameraModeRef,
      residentialLayerStateRef,
      trailRef,
    });
    setupSceneRuntime(state);
    state.scheduleResidentialRefresh = (delay = 560) => {
      if (state.residentialTimer) {
        window.clearTimeout(state.residentialTimer);
      }
      state.residentialTimer = window.setTimeout(() => {
        state.residentialTimer = 0;
        void updateResidentialLayer(state);
      }, delay);
    };

    const clientPointToMapLocal = (clientX, clientY) => {
      if (!state.context) {
        return null;
      }

      const rect = container.getBoundingClientRect();
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
    };

    const clientPointToLonLat = (clientX, clientY) => {
      const local = clientPointToMapLocal(clientX, clientY);
      if (!local || !state.context) {
        return null;
      }

      return unprojectMapPoint(local.x, local.z, state.context.bounds, state.context.size);
    };

    const handleClick = (event) => {
      const lonLat = clientPointToLonLat(event.clientX, event.clientY);
      if (!lonLat || !state.context) {
        return;
      }

      const travelFeature = pickTravelNodeAt(lonLat[0], lonLat[1], state.travelNodeLayer.features);
      const feature = findFeatureAt(lonLat[0], lonLat[1], state.context.namedFeatures);
      const poiFeature = pickResidentialFeatureAt(lonLat[0], lonLat[1], state.residentialLayer.features);
      if (travelFeature) {
        sceneApiRef.current?.selectTravelFeature(travelFeature);
        return;
      }
      if (poiFeature) {
        sceneApiRef.current?.selectPoiFeature(poiFeature);
        return;
      }
      if (feature) {
        sceneApiRef.current?.chooseByAdcode(String(feature.properties?.adcode || ""));
      }
    };

    const activePointerCenter = () => {
      const pointers = [...state.activePointers.values()];
      if (!pointers.length) {
        const rect = container.getBoundingClientRect();
        return {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        };
      }

      const total = pointers.reduce((sum, item) => ({ x: sum.x + item.x, y: sum.y + item.y }), { x: 0, y: 0 });
      return {
        clientX: total.x / pointers.length,
        clientY: total.y / pointers.length,
      };
    };

    const pointerDistance = () => {
      const pointers = [...state.activePointers.values()];
      if (pointers.length < 2) {
        return 0;
      }

      const [first, second] = pointers;
      return Math.hypot(second.x - first.x, second.y - first.y);
    };

    const zoomAtPoint = (clientX, clientY, nextZoom) => {
      const local = clientPointToMapLocal(clientX, clientY);
      if (!local || !state.context) {
        state.targetZoom = nextZoom;
        return null;
      }

      const lonLat = unprojectMapPoint(local.x, local.z, state.context.bounds, state.context.size);
      const rect = container.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
      const viewWidth = (state.camera.right - state.camera.left) / nextZoom;
      const viewHeight = (state.camera.top - state.camera.bottom) / nextZoom;
      state.targetZoom = nextZoom;
      state.targetPan.x = (ndcX * viewWidth) / 2 - local.x;
      state.targetPan.z = (-ndcY * viewHeight) / 2 - local.z;
      return lonLat;
    };

    const onPointerDown = (event) => {
      state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      state.pointerStart.set(event.pointerId, { x: event.clientX, y: event.clientY });
      state.lastPinchDistance = pointerDistance();
      state.isPointerDragging = false;
      container.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (!state.activePointers.has(event.pointerId)) {
        return;
      }

      const previous = state.activePointers.get(event.pointerId);
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const start = state.pointerStart.get(event.pointerId);
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
        state.isPointerDragging = true;
      }

      if (state.activePointers.size >= 2) {
        const nextDistance = pointerDistance();
        if (nextDistance > 0 && state.lastPinchDistance > 0) {
          const zoomRatio = nextDistance / state.lastPinchDistance;
          const nextZoom = Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, state.targetZoom * zoomRatio));
          const center = activePointerCenter();
          state.lodFocusLonLat = zoomAtPoint(center.clientX, center.clientY, nextZoom);
          void updateDetailLayers(state, state.lodFocusLonLat);
          state.scheduleResidentialRefresh?.();
        }
        state.lastPinchDistance = nextDistance;
        return;
      }

      const viewWidth = state.camera.right - state.camera.left;
      const viewHeight = state.camera.top - state.camera.bottom;
      state.targetPan.x += (dx / container.clientWidth) * (viewWidth / state.viewZoom);
      state.targetPan.z += (dy / container.clientHeight) * (viewHeight / state.viewZoom);
    };

    const onPointerUp = (event) => {
      const start = state.pointerStart.get(event.pointerId);
      state.activePointers.delete(event.pointerId);
      state.pointerStart.delete(event.pointerId);
      state.lastPinchDistance = pointerDistance();
      container.releasePointerCapture?.(event.pointerId);

      if (start && !state.isPointerDragging) {
        handleClick(event);
      } else if (state.isPointerDragging && state.activePointers.size === 0) {
        const center = activePointerCenter();
        state.lodFocusLonLat = clientPointToLonLat(center.clientX, center.clientY) || state.lodFocusLonLat;
        void updateDetailLayers(state, state.lodFocusLonLat);
        state.scheduleResidentialRefresh?.();
      }
    };

    const onWheel = (event) => {
      event.preventDefault();
      const nextZoom = Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, state.targetZoom * Math.exp(-event.deltaY * 0.0012)));
      state.lodFocusLonLat = zoomAtPoint(event.clientX, event.clientY, nextZoom);
      void updateDetailLayers(state, state.lodFocusLonLat);
      state.scheduleResidentialRefresh?.();
    };

    const resizeObserver = new ResizeObserver(() => resizeScene(state));
    resizeObserver.observe(container);
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("pointerleave", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    const animate = () => {
      if (state.disposed) {
        return;
      }

      state.viewZoom += (state.targetZoom - state.viewZoom) * 0.12;
      state.pan.lerp(state.targetPan, 0.16);
      state.terrainGroup.position.copy(state.pan);
      setCameraForMode(state);
      updateLabelPositions({
        labelItems: collectSceneLabelItems(state),
        camera: state.camera,
        terrainGroup: state.terrainGroup,
        container,
        context: state.context,
        zoom: state.viewZoom,
      });
      state.renderer.render(state.scene, state.camera);
      state.animationFrame = window.requestAnimationFrame(animate);
    };

    sceneApiRef.current = {
      reset: () => {
        renderRegion(state, COUNTRY_NODE, [COUNTRY_NODE]);
      },
      goToTrail: (index) => {
        const node = trailRef.current[index] || COUNTRY_NODE;
        const nextTrail = trailRef.current.slice(0, index + 1);
        renderRegion(state, node, nextTrail);
      },
      chooseByAdcode: (adcode) => {
        const feature = state.context?.namedFeatures.find((item) => String(item.properties?.adcode) === String(adcode));
        if (feature) {
          submitChooseFeature(state, feature);
        }
      },
      selectPoiFeature: (feature) => {
        selectPoiOnMap(state, feature);
      },
      selectTravelFeature: (feature) => {
        selectTravelFeatureOnMap(state, feature);
      },
      syncTravelRoutes: (routeDays) => {
        syncTravelRouteLayer(state, routeDays);
      },
    };

    resizeScene(state);
    renderRegion(state, COUNTRY_NODE, [COUNTRY_NODE]);
    animate();

    return () => {
      state.disposed = true;
      window.cancelAnimationFrame(state.animationFrame);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("pointerleave", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      clearSceneLayers(state);
      state.renderer.dispose();
      state.renderer.domElement.remove();
      sceneApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneApiRef.current?.syncTravelRoutes(travelPlanner.planState.mapRouteDays);
  }, [travelPlanner.planState.mapRouteDays]);

  const handleSubmitSearch = async (event) => {
    event.preventDefault();
    const query = search.trim();
    if (!query) {
      return;
    }

    await submitSearch({
      query,
      currentFeatures,
      currentNode,
      sceneApi: sceneApiRef.current,
      setSelectedNode,
      setNotice,
      setPoiSearchState,
    });
  };

  const handleCopyApi = async () => {
    const url = selectedNode.level === currentNode.level ? sourceUrlForNode(currentNode, true) : sourceUrlForNode(selectedNode, true);
    try {
      await navigator.clipboard.writeText(url);
      setNotice("GeoJSON API 已复制");
    } catch {
      setNotice("复制失败，请手动复制链接");
    }
  };

  const panelNode = selectedNode || currentNode;
  const currentTravelCandidate = panelNode?.level && panelNode.level !== "country" ? panelNode : null;

  return (
    <div className="app-shell">
      <main className="scene-stage">
        <div className="scene-vignette" aria-hidden="true"></div>
        <div ref={stageRef} className="map-surface" aria-label="真实高程中国三维地势地图"></div>
        <div ref={labelLayerRef} className="label-layer" aria-hidden="true"></div>
      </main>

      <HudPanels
        trail={trail}
        cameraMode={cameraMode}
        setCameraMode={setCameraMode}
        currentFeatures={currentFeatures}
        search={search}
        setSearch={setSearch}
        handleSubmitSearch={handleSubmitSearch}
        panelNode={panelNode}
        currentNode={currentNode}
        stats={stats}
        poiSearchState={poiSearchState}
        residentialLayerState={residentialLayerState}
        handleCopyApi={handleCopyApi}
        reset={() => sceneApiRef.current?.reset()}
        goToTrail={(index) => sceneApiRef.current?.goToTrail(index)}
      />

      <TravelPlannerPanel
        currentCandidate={currentTravelCandidate}
        selectedNodes={travelPlanner.selectedNodes}
        tripDays={travelPlanner.tripDays}
        setTripDays={travelPlanner.setTripDays}
        dayOrNightPreference={travelPlanner.dayOrNightPreference}
        setDayOrNightPreference={travelPlanner.setDayOrNightPreference}
        interestTags={travelPlanner.interestTags}
        setInterestTags={travelPlanner.setInterestTags}
        clarifyState={travelPlanner.clarifyState}
        planState={travelPlanner.planState}
        addCurrentSelection={() => travelPlanner.addCurrentSelection(currentTravelCandidate)}
        removeSelection={travelPlanner.removeSelection}
        clearSelection={travelPlanner.clearSelection}
        handleClarify={travelPlanner.handleClarify}
        handlePlan={travelPlanner.handlePlan}
      />

      {notice && <div className="toast">{notice}</div>}

      {loading && (
        <div id="loading-mask">
          <div className="loading-card">
            <span className="loading-tag">LOADING REAL TERRAIN</span>
            <h2>加载真实高程地势</h2>
            <p>正在请求 DataV 行政边界、Terrarium DEM、ArcGIS 免费影像和山体阴影瓦片。</p>
          </div>
        </div>
      )}
    </div>
  );
}
