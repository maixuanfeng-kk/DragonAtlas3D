import { useEffect, useRef, useState } from "react";
import { DetailMapPrompt } from "./components/DetailMapPrompt.jsx";
import { HeroOverlay } from "./components/HeroOverlay.jsx";
import { HudPanels } from "./components/HudPanels.jsx";
import { TravelPlanningWorkspace } from "./components/TravelPlanningWorkspace.jsx";
import { buildLocationReveal } from "./components/heroCopy.js";
import { normalizeDestinationQuery } from "./components/searchQuery.js";
import { searchAdminDistrict } from "./map/adminSearch.js";
import { createDetailMapViewport, hasAmapJsApiKey, shouldResetDetailMapPrompt, shouldSuggestDetailMap } from "./map/detailMapMode.js";
import { collectSceneLabelItems } from "./map/labelItems.js";
import { updateLabelPositions } from "./map/overlays.js";
import { updateResidentialLayer } from "./map/residentialLayer.js";
import { renderRegion } from "./map/regionRenderer.js";
import { setupSceneInteractions } from "./map/sceneInteractions.js";
import { clearSceneLayers, createSceneState, resizeScene, setCameraForMode, setupSceneRuntime } from "./map/sceneRuntime.js";
import {
  COUNTRY_NODE,
  INITIAL_STATS,
  initialPoiSearchState,
  initialResidentialLayerState,
  sourceUrlForNode,
} from "./map/viewState.js";
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
  const [cameraMode, setCameraMode] = useState("top");
  const [search, setSearch] = useState("");
  const [poiSearchState, setPoiSearchState] = useState(initialPoiSearchState());
  const [residentialLayerState, setResidentialLayerState] = useState(initialResidentialLayerState());
  const [locationReveal, setLocationReveal] = useState(null);
  const [detailMapMode, setDetailMapMode] = useState(false);
  const [detailMapPromptVisible, setDetailMapPromptVisible] = useState(false);
  const [detailMapPromptDismissed, setDetailMapPromptDismissed] = useState(false);
  const [detailMapViewport, setDetailMapViewport] = useState(null);
  const travelPlanner = useTravelPlanner(setNotice);
  const trailRef = useRef(trail);
  const cameraModeRef = useRef(cameraMode);
  const residentialLayerStateRef = useRef(residentialLayerState);
  const detailMapModeRef = useRef(detailMapMode);
  const detailMapPromptDismissedRef = useRef(detailMapPromptDismissed);

  const syncDetailMapPrompt = ({ currentNode, bounds }) => {
    const viewport = createDetailMapViewport({ currentNode, bounds });
    setDetailMapViewport(viewport);

    if (!viewport) {
      setDetailMapPromptVisible(false);
      return;
    }

    const shouldResetPrompt = shouldResetDetailMapPrompt({
      currentNode,
      span: viewport.span,
      promptDismissed: detailMapPromptDismissedRef.current,
    });

    const promptDismissed = shouldResetPrompt ? false : detailMapPromptDismissedRef.current;
    if (shouldResetPrompt) {
      detailMapPromptDismissedRef.current = false;
      setDetailMapPromptDismissed(false);
    }

    const shouldShowPrompt = shouldSuggestDetailMap({
      currentNode,
      span: viewport.span,
      hasJsApiKey: hasAmapJsApiKey(),
      detailMode: detailMapModeRef.current,
      promptDismissed,
    });

    setDetailMapPromptVisible(shouldShowPrompt);
  };

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
    detailMapModeRef.current = detailMapMode;
  }, [detailMapMode]);

  useEffect(() => {
    detailMapPromptDismissedRef.current = detailMapPromptDismissed;
  }, [detailMapPromptDismissed]);

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
        onViewportChange: syncDetailMapPrompt,
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

  useEffect(() => {
    sceneApiRef.current?.syncTravelRoutes(travelPlanner.planState.mapRouteDays);
  }, [travelPlanner.planState.mapRouteDays]);

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
        note: "已在当前行政层级内锁定目标地点，准备推进到该区域的真实地形视角。",
      });
      scheduleRevealAndAdvance({
        reveal: buildLocationReveal({
          node: localMatch,
          sourceLabel: "当前行政区数据",
        }),
        onAdvance: async () => {
          await sceneApiRef.current?.chooseByAdcode(localMatch.adcode, {
            transition: { startZoom: 0.94, targetZoom: 1.08, delay: 180 },
          });
        },
      });
      return;
    }

    try {
      const adminResult = await searchAdminDistrict(query);
      if (!adminResult.node) {
        throw new Error(`高德行政区查询没有返回“${query}”的有效行政区结果。`);
      }

      updateDestinationSearchState({
        query,
        status: "ready",
        regionLabel: adminResult.node.fullName,
        note: "已通过高德行政区查询锁定目标地点，准备推进到该区域的真实地形视角。",
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
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "目的地搜索失败。";
      updateDestinationSearchState({
        query,
        status: "failed",
        regionLabel: currentNode.fullName || currentNode.name,
        resultCount: 0,
        error: message,
        note: "当前未能锁定全国范围内的城市或省份，请检查高德 key，或先在已加载层级内探索。",
      });
      setNotice(message);
    }
  };

  const handleCopyApi = async () => {
    const url =
      selectedNode.level === currentNode.level
        ? sourceUrlForNode(currentNode, true)
        : sourceUrlForNode(selectedNode, true);

    try {
      await navigator.clipboard.writeText(url);
      setNotice("当前 GeoJSON 数据地址已复制。");
    } catch {
      setNotice("复制失败，请手动复制当前 GeoJSON 数据地址。");
    }
  };

  const panelNode = selectedNode || currentNode;
  const currentTravelCandidate = panelNode?.level && panelNode.level !== "country" ? panelNode : null;
  const enterDetailMap = () => {
    if (!detailMapViewport) {
      return;
    }

    setDetailMapPromptVisible(false);
    setDetailMapMode(true);
  };
  const dismissDetailMapPrompt = () => {
    detailMapPromptDismissedRef.current = true;
    setDetailMapPromptDismissed(true);
    setDetailMapPromptVisible(false);
  };
  const exitDetailMap = () => {
    detailMapModeRef.current = false;
    detailMapPromptDismissedRef.current = true;
    setDetailMapMode(false);
    setDetailMapPromptDismissed(true);
    setDetailMapPromptVisible(false);
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
          aria-label="中国三维地势图。支持拖拽平移、滚轮缩放，以及俯视与轻倾斜视角切换。"
        ></div>
        <div ref={labelLayerRef} className="label-layer" aria-hidden="true"></div>
      </main>

      <>
        {!detailMapMode && (
          <>
          <HeroOverlay
            currentNode={currentNode}
            stats={stats}
            poiSearchState={poiSearchState}
            residentialLayerState={residentialLayerState}
            search={search}
            setSearch={setSearch}
            handleSubmitSearch={handleSubmitSearch}
            locationReveal={locationReveal}
          />

          <HudPanels
            trail={trail}
            cameraMode={cameraMode}
            setCameraMode={setCameraMode}
            panelNode={panelNode}
            stats={stats}
            poiSearchState={poiSearchState}
            residentialLayerState={residentialLayerState}
            handleCopyApi={handleCopyApi}
            reset={() => sceneApiRef.current?.reset()}
            goToTrail={(index) => sceneApiRef.current?.goToTrail(index)}
          />

          <TravelPlanningWorkspace
            detailMapMode={detailMapMode}
            detailMapViewport={detailMapViewport}
            onExitDetailMap={exitDetailMap}
            currentCandidate={currentTravelCandidate}
            planner={travelPlanner}
          />

          {detailMapPromptVisible && detailMapViewport && (
            <DetailMapPrompt
              currentNode={detailMapViewport.node}
              onEnter={enterDetailMap}
              onDismiss={dismissDetailMapPrompt}
            />
          )}
          </>
        )}

        <TravelPlanningWorkspace
          detailMapMode={detailMapMode}
          detailMapViewport={detailMapViewport}
          onExitDetailMap={exitDetailMap}
          currentCandidate={currentTravelCandidate}
          planner={travelPlanner}
        />
      </>

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
