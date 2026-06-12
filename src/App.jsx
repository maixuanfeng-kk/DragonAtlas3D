import { useEffect, useRef, useState } from "react";
import { DetailMapPrompt } from "./components/DetailMapPrompt.jsx";
import { HeroOverlay } from "./components/HeroOverlay.jsx";
import { SettingsPanel } from "./components/SettingsPanel.jsx";
import { TravelPlanningWorkspace } from "./components/TravelPlanningWorkspace.jsx";
import { buildLocationReveal } from "./components/heroCopy.js";
import { normalizeDestinationQuery } from "./components/searchQuery.js";
import { searchAdminDistrict } from "./map/adminSearch.js";
import { collectSceneLabelItems } from "./map/labelItems.js";
import { updateLabelPositions } from "./map/overlays.js";
import { updateResidentialLayer } from "./map/residentialLayer.js";
import { renderRegion } from "./map/regionRenderer.js";
import { setupSceneInteractions } from "./map/sceneInteractions.js";
import { clearSceneLayers, createSceneState, resizeScene, setCameraForMode, setupSceneRuntime } from "./map/sceneRuntime.js";
import { COUNTRY_NODE, INITIAL_STATS, initialPoiSearchState, initialResidentialLayerState } from "./map/viewState.js";
import { useDetailMapEntry } from "./useDetailMapEntry.js";
import { useTravelPlanner } from "./useTravelPlanner.js";

const SEARCH_REVEAL_DELAY_MS = 760;
const SEARCH_REVEAL_HIDE_MS = 3200;

function clearTimer(timerRef) {
  if (timerRef.current) {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  }
}

export default function App() {
  const stageRef = useRef(null);
  const labelLayerRef = useRef(null);
  const sceneApiRef = useRef(null);
  const revealAdvanceTimerRef = useRef(0);
  const revealDismissTimerRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState(INITIAL_STATS);
  const [trail, setTrail] = useState([COUNTRY_NODE]);
  const [selectedNode, setSelectedNode] = useState(COUNTRY_NODE);
  const [currentNode, setCurrentNode] = useState(COUNTRY_NODE);
  const [currentFeatures, setCurrentFeatures] = useState([]);
  const [cameraMode, setCameraMode] = useState("tilt");
  const [search, setSearch] = useState("");
  const [poiSearchState, setPoiSearchState] = useState(initialPoiSearchState());
  const [residentialLayerState, setResidentialLayerState] = useState(initialResidentialLayerState());
  const [locationReveal, setLocationReveal] = useState(null);
  const travelPlanner = useTravelPlanner(setNotice);
  const detailMap = useDetailMapEntry(setSelectedNode);
  const trailRef = useRef(trail);
  const cameraModeRef = useRef(cameraMode);
  const residentialLayerStateRef = useRef(residentialLayerState);

  const scheduleRevealAndAdvance = ({ reveal, onAdvance }) => {
    clearTimer(revealAdvanceTimerRef);
    clearTimer(revealDismissTimerRef);
    setLocationReveal(reveal);

    revealAdvanceTimerRef.current = window.setTimeout(() => {
      revealAdvanceTimerRef.current = 0;
      void onAdvance?.();
    }, SEARCH_REVEAL_DELAY_MS);

    revealDismissTimerRef.current = window.setTimeout(() => {
      revealDismissTimerRef.current = 0;
      setLocationReveal(null);
    }, SEARCH_REVEAL_HIDE_MS);
  };

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
        scheduleLocationReveal: scheduleRevealAndAdvance,
        onViewportChange: detailMap.syncDetailMapPrompt,
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

    const cleanupInteractions = setupSceneInteractions({ state, sceneApiRef, resizeScene });

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

    resizeScene(state);
    void renderRegion(state, COUNTRY_NODE, [COUNTRY_NODE]);
    animate();

    return () => {
      state.disposed = true;
      window.cancelAnimationFrame(state.animationFrame);
      cleanupInteractions();
      clearSceneLayers(state);
      state.renderer.dispose();
      state.renderer.domElement.remove();
      clearTimer(revealAdvanceTimerRef);
      clearTimer(revealDismissTimerRef);
    };
  }, []);

  const updateDestinationSearchState = ({ query, status, regionLabel, resultCount = 1, error = "", note }) => {
    setPoiSearchState((current) => ({
      ...current,
      status,
      requested: current.requested + 1,
      loaded: status === "failed" ? current.loaded : current.loaded + 1,
      failed: status === "failed" ? current.failed + 1 : current.failed,
      resultCount,
      query,
      regionLabel,
      error,
      note: note || current.note,
    }));
  };

  const handleSubmitSearch = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formValue = form?.elements?.namedItem?.("destination")?.value;
    const query = normalizeDestinationQuery(formValue, search);
    if (!query) {
      return;
    }

    const localMatch = currentFeatures.find(
      (item) => item.fullName.includes(query) || item.name.includes(query) || item.adcode === query,
    );

    if (localMatch) {
      updateDestinationSearchState({
        query,
        status: "ready",
        regionLabel: localMatch.fullName,
        note: "Locked the current city target and prepared the Amap detail viewport.",
      });
      scheduleRevealAndAdvance({
        reveal: buildLocationReveal({
          node: localMatch,
          sourceLabel: "Current administrative layer",
        }),
        onAdvance: async () => {
          await sceneApiRef.current?.chooseByAdcode(localMatch.adcode, {
            transition: { startZoom: 0.94, targetZoom: 1.08, delay: 180 },
          });
          detailMap.requestEnterDetailMap();
        },
      });
      return;
    }

    try {
      const adminResult = await searchAdminDistrict(query);
      if (!adminResult.node) {
        throw new Error(`Amap district search did not return a usable result for "${query}".`);
      }

      updateDestinationSearchState({
        query,
        status: "ready",
        regionLabel: adminResult.node.fullName,
        note: "Locked the city by Amap administrative search and prepared the detail planner surface.",
      });
      scheduleRevealAndAdvance({
        reveal: buildLocationReveal({
          node: adminResult.node,
          sourceLabel: adminResult.source.label,
        }),
        onAdvance: async () => {
          sceneApiRef.current?.goToNode(adminResult.node, adminResult.trail, {
            transition: { startZoom: 0.9, targetZoom: 1.06, delay: 220 },
          });
          detailMap.setViewportFromNode(adminResult.node);
          detailMap.requestEnterDetailMap();
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Destination search failed.";
      updateDestinationSearchState({
        query,
        status: "failed",
        regionLabel: currentNode.fullName || currentNode.name,
        resultCount: 0,
        error: message,
        note: "The current destination could not be locked. Please verify the Amap key or try another city name.",
      });
      setNotice(message);
    }
  };

  return (
    <div className={`app-shell ${loading ? "is-loading" : "is-ready"}`}>
      <main className="scene-stage">
        <div className="scene-vignette" aria-hidden="true"></div>
        <div
          ref={stageRef}
          className="map-surface"
          role="application"
          tabIndex={0}
          aria-label="中国 3D 地形首页，支持平移、缩放与进入高德细节规划模式。"
        ></div>
        <div ref={labelLayerRef} className="label-layer" aria-hidden="true"></div>
      </main>

      {!detailMap.detailMapMode && (
        <>
          <HeroOverlay
            search={search}
            setSearch={setSearch}
            handleSubmitSearch={handleSubmitSearch}
            locationReveal={locationReveal}
          />

          {detailMap.detailMapPromptVisible && detailMap.detailMapViewport && (
            <DetailMapPrompt
              currentNode={detailMap.detailMapViewport.node}
              onEnter={detailMap.enterDetailMap}
              onDismiss={detailMap.dismissDetailMapPrompt}
            />
          )}

          <SettingsPanel />
        </>
      )}

      <TravelPlanningWorkspace
        detailMapMode={detailMap.detailMapMode}
        detailMapViewport={detailMap.detailMapViewport}
        onExitDetailMap={detailMap.exitDetailMap}
        planner={travelPlanner}
        onPreviewNode={detailMap.handlePreviewSelectionNode}
        onPreviewNodes={detailMap.handlePreviewSelectionNodes}
      />

      {notice && (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}

      {loading && (
        <div id="loading-mask" role="status" aria-live="polite" aria-label="地图数据加载中">
          <div className="loading-card">
            <span className="loading-tag">REAL TERRAIN ONLINE</span>
            <h2>正在唤醒中国地形底座</h2>
            <p>正在请求行政边界、真实高程、免费影像与山体阴影数据，准备进入默认全国全景视角。</p>
          </div>
        </div>
      )}
    </div>
  );
}

