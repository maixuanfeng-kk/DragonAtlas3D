import { resolveAmapJsCredentials } from "./detailMapMode.js";

const AMAP_LOADER_URL = "https://webapi.amap.com/loader.js";

let loaderPromise = null;

function injectAmapLoaderScript() {
  if (window.AMapLoader) {
    return Promise.resolve(window.AMapLoader);
  }

  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${AMAP_LOADER_URL}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.AMapLoader), { once: true });
        existing.addEventListener("error", () => reject(new Error("高德 JSAPI Loader 脚本加载失败。")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = AMAP_LOADER_URL;
      script.async = true;
      script.onload = () => resolve(window.AMapLoader);
      script.onerror = () => reject(new Error("高德 JSAPI Loader 脚本加载失败。"));
      document.head.appendChild(script);
    }).catch((error) => {
      loaderPromise = null;
      throw error;
    });
  }

  return loaderPromise;
}

export async function loadAmapDetailMapApi() {
  const credentials = resolveAmapJsCredentials();
  if (!credentials.hasKey) {
    throw new Error("缺少 VITE_AMAP_JS_KEY。细节地图需要高德 Web 端 JSAPI key。");
  }

  if (credentials.securityJsCode) {
    window._AMapSecurityConfig = {
      securityJsCode: credentials.securityJsCode,
    };
  }

  const AMapLoader = await injectAmapLoaderScript();
  if (!AMapLoader?.load) {
    throw new Error("高德 JSAPI Loader 未正确初始化。");
  }

  return AMapLoader.load({
    key: credentials.key,
    version: "2.0",
    plugins: ["AMap.Scale"],
  });
}
