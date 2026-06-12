/** Shared key-value config backed by localStorage.
 *  Keys set via the SettingsPanel gear icon (bottom-left).
 *  Falls back to VITE_* env vars when no localStorage value is present. */

const LS_PREFIX = "da3d_";

function get(key) {
  try {
    return localStorage.getItem(LS_PREFIX + key) || "";
  } catch {
    return "";
  }
}

function set(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, value);
  } catch {
    // localStorage unavailable — silently ignore
  }
}

// ── Getters (localStorage → env fallback) ──────────────────────
export function getQwenApiKey() {
  return get("qwen_api_key") || import.meta.env.VITE_QWEN_API_KEY || "";
}

export function getQwenBaseUrl() {
  return get("qwen_base_url") || import.meta.env.VITE_QWEN_BASE_URL || "";
}

export function getQwenModel() {
  return get("qwen_model") || import.meta.env.VITE_QWEN_MODEL || "";
}

export function getAmapWebKey() {
  return get("amap_web_key") || import.meta.env.VITE_AMAP_WEB_KEY || "";
}

export function getAmapJsKey() {
  return get("amap_js_key") || import.meta.env.VITE_AMAP_JS_KEY || "";
}

export function getAmapJsSecurityCode() {
  return get("amap_js_security_code") || import.meta.env.VITE_AMAP_JS_SECURITY_CODE || "";
}

// ── Setters ────────────────────────────────────────────────────
export function setQwenApiKey(v) { set("qwen_api_key", v); }
export function setQwenBaseUrl(v) { set("qwen_base_url", v); }
export function setQwenModel(v) { set("qwen_model", v); }
export function setAmapWebKey(v) { set("amap_web_key", v); }
export function setAmapJsKey(v) { set("amap_js_key", v); }
export function setAmapJsSecurityCode(v) { set("amap_js_security_code", v); }

/** Quick summary of which keys are configured */
export function configSummary() {
  const qwen = !!(getQwenApiKey() && getQwenBaseUrl());
  const amap = !!(getAmapWebKey() || getAmapJsKey());
  return { qwen, amap };
}
