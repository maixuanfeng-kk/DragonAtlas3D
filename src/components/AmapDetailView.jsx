import { useEffect, useRef, useState } from "react";
import { loadAmapDetailMapApi } from "../map/amapDetailMap.js";
import { resolveAmapJsCredentials } from "../map/detailMapMode.js";

function initialLoadState() {
  const credentials = resolveAmapJsCredentials();
  if (!credentials.hasKey) {
    return {
      status: "failed",
      error: "缺少 VITE_AMAP_JS_KEY。细节地图需要高德 Web 端 JSAPI key。",
    };
  }

  return {
    status: "pending",
    error: "",
  };
}

function syncMapViewport({ map, AMap, markerRef, viewport }) {
  if (!map || !viewport) {
    return;
  }

  map.setZoomAndCenter(viewport.zoom, viewport.center);

  if (!markerRef.current) {
    markerRef.current = new AMap.Marker({
      position: viewport.center,
      offset: new AMap.Pixel(0, -8),
      anchor: "bottom-center",
      title: viewport.node?.fullName || viewport.node?.name || "当前落点",
    });
    markerRef.current.setMap(map);
  } else {
    markerRef.current.setPosition(viewport.center);
    markerRef.current.setTitle(viewport.node?.fullName || viewport.node?.name || "当前落点");
  }
}

function credentialNote(credentials) {
  if (credentials.usesFallbackKey) {
    return "当前细节图正在回退使用 VITE_AMAP_WEB_KEY；如果加载失败，请补充 VITE_AMAP_JS_KEY 和安全密钥。";
  }

  if (!credentials.securityJsCode) {
    return "如果这个 JSAPI key 是 2021 年 12 月后创建的，还需要配置 VITE_AMAP_JS_SECURITY_CODE。";
  }

  return "细节图由高德 JS 地图渲染层提供；3D 地形底座仍保留在首页。";
}

export function AmapDetailView({ viewport, onBack }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const latestViewportRef = useRef(viewport);
  const [loadState, setLoadState] = useState(initialLoadState);
  const credentials = resolveAmapJsCredentials();

  latestViewportRef.current = viewport;

  useEffect(() => {
    let cancelled = false;

    async function mountMap() {
      if (!credentials.hasKey || !containerRef.current) {
        return;
      }

      setLoadState({ status: "pending", error: "" });

      try {
        const AMap = await loadAmapDetailMapApi();
        if (cancelled || !containerRef.current) {
          return;
        }

        const map = new AMap.Map(containerRef.current, {
          viewMode: "2D",
          resizeEnable: true,
          zoom: latestViewportRef.current?.zoom || 13,
          center: latestViewportRef.current?.center || [104.066541, 30.572269],
          features: ["bg", "road", "building", "point"],
          mapStyle: "amap://styles/normal",
        });

        mapRef.current = map;

        if (AMap.Scale) {
          map.addControl(new AMap.Scale());
        }

        syncMapViewport({
          map,
          AMap,
          markerRef,
          viewport: latestViewportRef.current,
        });

        setLoadState({ status: "ready", error: "" });
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: "failed",
            error: error instanceof Error ? error.message : "高德细节地图加载失败。",
          });
        }
      }
    }

    void mountMap();

    return () => {
      cancelled = true;
      if (markerRef.current) {
        markerRef.current.setMap?.(null);
        markerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [credentials.hasKey, credentials.key, credentials.securityJsCode]);

  useEffect(() => {
    if (!mapRef.current || !viewport || !window.AMap) {
      return;
    }

    syncMapViewport({
      map: mapRef.current,
      AMap: window.AMap,
      markerRef,
      viewport,
    });
  }, [viewport]);

  const title =
    viewport?.node?.level === "country"
      ? "当前街区细节图"
      : viewport?.node?.fullName || viewport?.node?.name || "高德细节图";

  return (
    <section className="detail-map-shell" aria-label="高德细节地图">
      <div className="detail-map-canvas" ref={containerRef}></div>

      <header className="detail-map-bar">
        <div className="detail-map-copy">
          <p className="detail-map-kicker">AMAP DETAIL MODE</p>
          <h2>{title}</h2>
          <div className="detail-map-meta">
            <span>街区级细节</span>
            <span>高德 JS 地图</span>
            <span className={`is-${loadState.status}`}>{loadState.status === "ready" ? "已就绪" : loadState.status === "pending" ? "加载中" : "未就绪"}</span>
          </div>
          <p className="detail-map-note">{credentialNote(credentials)}</p>
          {loadState.error && <p className="detail-map-error">{loadState.error}</p>}
        </div>

        <button type="button" className="detail-map-back" onClick={onBack}>
          返回 3D 地形
        </button>
      </header>

      {loadState.status !== "ready" && (
        <div className="detail-map-mask" role="status" aria-live="polite">
          <div className="detail-map-mask-card">
            <p className="detail-map-kicker">DETAIL MAP</p>
            <h3>{loadState.status === "pending" ? "正在接入高德细节图" : "高德细节图当前未就绪"}</h3>
            <p>
              {loadState.status === "pending"
                ? "正在加载高德 JS 地图渲染层，并把当前 3D 视角落到街区级底图。"
                : loadState.error}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
