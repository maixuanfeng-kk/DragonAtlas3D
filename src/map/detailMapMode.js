export const DETAIL_MAP_TRIGGER_MAX_SPAN = 0.2;
export const DETAIL_MAP_RESET_MIN_SPAN = 0.28;
const DETAIL_MAP_RESET_MAX_SPAN = 4.0;

const DETAIL_MAP_TRIGGER_SPANS = {
  country: 3.2,
  province: 7.0,
  city: 0.42,
  district: 0.2,
  township: 0.12,
  poi: 0.08,
};

export function detailMapTriggerSpanForLevel(level = "district") {
  return DETAIL_MAP_TRIGGER_SPANS[level] || DETAIL_MAP_TRIGGER_SPANS.district;
}

function detailMapResetSpanForLevel(level = "district") {
  const raw = detailMapTriggerSpanForLevel(level) * 1.15;
  return Math.min(DETAIL_MAP_RESET_MAX_SPAN, Math.max(DETAIL_MAP_RESET_MIN_SPAN, raw));
}

function zoomFromSpan(span) {
  if (!Number.isFinite(span) || span <= 0) {
    return 11;
  }

  if (span <= 0.015) {
    return 17;
  }
  if (span <= 0.03) {
    return 16;
  }
  if (span <= 0.08) {
    return 14;
  }
  if (span <= 0.12) {
    return 14;
  }
  if (span <= 0.2) {
    return 13;
  }
  if (span <= 0.36) {
    return 12;
  }
  return 11;
}

function _getAmapWebKey() {
  try {
    const ls = localStorage.getItem("da3d_amap_web_key");
    if (ls) return ls;
  } catch { /* ignore */ }
  return import.meta.env.VITE_AMAP_WEB_KEY || "";
}

function _getAmapJsKey() {
  try {
    const ls = localStorage.getItem("da3d_amap_js_key");
    if (ls) return ls;
  } catch { /* ignore */ }
  return import.meta.env.VITE_AMAP_JS_KEY || "";
}

function _getAmapJsSecurityCode() {
  try {
    const ls = localStorage.getItem("da3d_amap_js_security_code");
    if (ls) return ls;
  } catch { /* ignore */ }
  return import.meta.env.VITE_AMAP_JS_SECURITY_CODE || "";
}

export function hasAmapJsApiKey() {
  return Boolean(_getAmapJsKey() || _getAmapWebKey());
}

export function resolveAmapJsCredentials() {
  const jsKey = _getAmapJsKey().trim();
  const fallbackKey = _getAmapWebKey().trim();
  const securityJsCode = _getAmapJsSecurityCode().trim();
  const key = jsKey || fallbackKey;

  return {
    key,
    securityJsCode,
    hasKey: Boolean(key),
    usesFallbackKey: !jsKey && Boolean(fallbackKey),
  };
}

export function shouldSuggestDetailMap({
  currentNode,
  span,
  hasJsApiKey,
  detailMode,
  promptDismissed,
}) {
  const triggerSpan = detailMapTriggerSpanForLevel(currentNode?.level);
  return (
    Boolean(hasJsApiKey) &&
    !detailMode &&
    !promptDismissed &&
    Number.isFinite(span) &&
    span > 0 &&
    span <= triggerSpan
  );
}

export function shouldResetDetailMapPrompt({ currentNode, span, promptDismissed }) {
  const resetSpan = detailMapResetSpanForLevel(currentNode?.level);
  return (
    Boolean(promptDismissed) &&
    (!Number.isFinite(span) || span >= resetSpan || !currentNode)
  );
}

export function canEnterDetailMapFrom3D({ hasJsApiKey, detailMode, viewport }) {
  return (
    Boolean(hasJsApiKey) &&
    !detailMode &&
    Array.isArray(viewport?.center) &&
    viewport.center.length >= 2 &&
    viewport?.node?.level &&
    viewport.node.level !== "country"
  );
}

export function createDetailMapViewport({ currentNode, bounds }) {
  if (!bounds) {
    const center = Array.isArray(currentNode?.center) && currentNode.center.length >= 2
      ? [Number(currentNode.center[0]), Number(currentNode.center[1])]
      : null;

    if (!center) {
      return null;
    }

    return {
      center,
      span: 0,
      zoom: 11,
      node: currentNode || null,
      bounds: null,
    };
  }

  const span = Math.max(bounds.maxLon - bounds.minLon, bounds.maxLat - bounds.minLat);
  const center = [
    Number(((bounds.minLon + bounds.maxLon) / 2).toFixed(6)),
    Number(((bounds.minLat + bounds.maxLat) / 2).toFixed(6)),
  ];

  return {
    center,
    span: Number(span.toFixed(6)),
    zoom: zoomFromSpan(span),
    node: currentNode || null,
    bounds,
  };
}
