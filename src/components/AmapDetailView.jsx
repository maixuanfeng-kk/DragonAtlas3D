import { useEffect, useRef, useState } from "react";
import { loadAmapDetailMapApi } from "../map/amapDetailMap.js";
import { mountAmapItineraryOverlay } from "../map/amapItineraryOverlay.js";
import { buildDetailMapOverlayModel } from "../map/detailMapItineraryModel.js";
import { resolveAmapJsCredentials } from "../map/detailMapMode.js";

function initialLoadState() {
  const credentials = resolveAmapJsCredentials();
  if (!credentials.hasKey) {
    return { status: "failed", error: "Missing VITE_AMAP_JS_KEY or fallback VITE_AMAP_WEB_KEY for detail map mode." };
  }
  return { status: "pending", error: "" };
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
      title: viewport.node?.fullName || viewport.node?.name || "Current focus",
    });
    markerRef.current.setMap(map);
  } else {
    markerRef.current.setPosition(viewport.center);
    markerRef.current.setTitle(viewport.node?.fullName || viewport.node?.name || "Current focus");
  }
}

function credentialNote(credentials) {
  if (credentials.usesFallbackKey) {
    return "Detail mode is currently using the Amap Web key as the JS fallback. Add VITE_AMAP_JS_KEY and VITE_AMAP_JS_SECURITY_CODE if loading becomes unstable.";
  }
  if (!credentials.securityJsCode) {
    return "If this JS key was created under the newer Amap console rules, add VITE_AMAP_JS_SECURITY_CODE as well.";
  }
  return "Amap JS is the city-detail planning surface. The 3D terrain homepage remains the macro entrance only.";
}

export function AmapDetailView({ viewport, itineraryState, selectedNodes, onBack, onSelectStop, onSelectLeg }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const latestViewportRef = useRef(viewport);
  const overlayCleanupRef = useRef(() => {});
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
          center: latestViewportRef.current?.center || [114.3055, 30.5928],
          features: ["bg", "road", "building", "point"],
          mapStyle: "amap://styles/normal",
        });
        mapRef.current = map;
        if (AMap.Scale) {
          map.addControl(new AMap.Scale());
        }
        syncMapViewport({ map, AMap, markerRef, viewport: latestViewportRef.current });
        setLoadState({ status: "ready", error: "" });
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: "failed",
            error: error instanceof Error ? error.message : "Amap detail map failed to load.",
          });
        }
      }
    }

    void mountMap();
    return () => {
      cancelled = true;
      overlayCleanupRef.current();
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

    syncMapViewport({ map: mapRef.current, AMap: window.AMap, markerRef, viewport });
  }, [viewport]);

  useEffect(() => {
    if (!mapRef.current || !window.AMap) {
      return;
    }

    overlayCleanupRef.current();
    overlayCleanupRef.current = mountAmapItineraryOverlay({
      AMap: window.AMap,
      map: mapRef.current,
      overlayModel: buildDetailMapOverlayModel({
        activeDay: itineraryState?.activeDay,
        days: itineraryState?.days || [],
        selectedNodes,
      }),
      activeStopId: itineraryState?.activeStopId,
      activeLegId: itineraryState?.activeLegId,
      onStopSelect: onSelectStop,
      onLegSelect: onSelectLeg,
    });

    return () => overlayCleanupRef.current();
  }, [itineraryState, onSelectLeg, onSelectStop, selectedNodes]);

  const title = viewport?.node?.level === "country" ? "Current detail map" : viewport?.node?.fullName || viewport?.node?.name || "Amap detail map";
  const activeDay = itineraryState?.activeDay || 1;

  return (
    <section className="detail-map-shell" aria-label="Amap detail map">
      <div className="detail-map-canvas" ref={containerRef}></div>

      <header className="detail-map-bar">
        <div className="detail-map-copy">
          <p className="detail-map-kicker">AMAP DETAIL MODE</p>
          <h2>{title}</h2>
          <div className="detail-map-meta">
            <span>City planner</span>
            <span>Amap JS map</span>
            <span>Day {activeDay}</span>
            <span className={`is-${loadState.status}`}>{loadState.status}</span>
          </div>
          <p className="detail-map-note">{credentialNote(credentials)}</p>
          {loadState.error && <p className="detail-map-error">{loadState.error}</p>}
        </div>

        <button type="button" className="detail-map-back" onClick={onBack}>
          Back to 3D terrain
        </button>
      </header>

      {loadState.status !== "ready" && (
        <div className="detail-map-mask" role="status" aria-live="polite">
          <div className="detail-map-mask-card">
            <p className="detail-map-kicker">DETAIL MAP</p>
            <h3>{loadState.status === "pending" ? "Connecting Amap detail map" : "Amap detail map unavailable"}</h3>
            <p>{loadState.status === "pending" ? "Loading the Amap city detail layer and syncing the current viewport." : loadState.error}</p>
          </div>
        </div>
      )}
    </section>
  );
}
