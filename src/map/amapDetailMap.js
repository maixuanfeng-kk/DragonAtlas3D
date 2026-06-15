import { resolveAmapJsCredentials } from "./detailMapMode.js";

const AMAP_LOADER_URL = "https://webapi.amap.com/loader.js";
const AMAP_DETAIL_TIMEOUT_MS = 30000;

let loaderPromise = null;

export function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timerId = globalThis.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        globalThis.clearTimeout(timerId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timerId);
        reject(error);
      },
    );
  });
}

function createLoaderScript({ resolve, reject }) {
  const script = document.createElement("script");
  script.src = AMAP_LOADER_URL;
  script.async = true;
  script.dataset.da3dAmapLoader = "true";
  script.dataset.da3dStatus = "loading";
  script.onload = () => {
    script.dataset.da3dStatus = "loaded";
    if (!window.AMapLoader) {
      reject(new Error("高德 JSAPI loader 加载完成但 window.AMapLoader 未暴露。请确认 key 已开通 JS API 权限。"));
      return;
    }
    resolve(window.AMapLoader);
  };
  script.onerror = () => {
    script.dataset.da3dStatus = "error";
    reject(new Error("高德 JSAPI loader 脚本加载失败，请检查网络连接。"));
  };
  document.head.appendChild(script);
  return script;
}

function injectAmapLoaderScript() {
  if (window.AMapLoader?.load) {
    return Promise.resolve(window.AMapLoader);
  }

  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      let existing = document.querySelector(`script[src="${AMAP_LOADER_URL}"]`);

      if (existing?.dataset.da3dStatus === "loaded" && !window.AMapLoader) {
        existing.remove();
        existing = null;
      }

      if (existing?.dataset.da3dStatus === "error") {
        existing.remove();
        existing = null;
      }

      if (!existing || !existing.dataset.da3dStatus) {
        existing?.remove();
        createLoaderScript({ resolve, reject });
        return;
      }

      existing.addEventListener(
        "load",
        () => {
          existing.dataset.da3dStatus = "loaded";
          if (!window.AMapLoader) {
            reject(new Error("高德 JSAPI loader 加载完成但 window.AMapLoader 未暴露。"));
            return;
          }
          resolve(window.AMapLoader);
        },
        { once: true },
      );
      existing.addEventListener(
        "error",
        () => {
          existing.dataset.da3dStatus = "error";
          reject(new Error("高德 JSAPI loader 脚本加载失败。"));
        },
        { once: true },
      );
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
    throw new Error("缺少高德 JS API Key。请在左下角 ⚙ 配置面板中填写，或在 .env.local 中设置 VITE_AMAP_JS_KEY。");
  }

  // Set security config BEFORE loading
  if (credentials.securityJsCode) {
    window._AMapSecurityConfig = {
      securityJsCode: credentials.securityJsCode,
    };
  }

  const AMapLoader = await withTimeout(
    injectAmapLoaderScript(),
    AMAP_DETAIL_TIMEOUT_MS,
    "高德 JSAPI loader 加载超时（30s）。请检查网络或 key 配置。",
  );

  if (!AMapLoader?.load) {
    throw new Error("高德 JSAPI loader 未提供 load() 方法，请确认 key 已开通 JS API 权限。");
  }

  return withTimeout(
    AMapLoader.load({
      key: credentials.key,
      version: "2.0",
      plugins: ["AMap.Scale"],
    }),
    AMAP_DETAIL_TIMEOUT_MS,
    `高德 JSAPI 运行时加载超时（30s）。请确认：

① 此 key（${credentials.key.slice(0, 6)}...）已开通「JS API」权限
② 安全密钥是在此 key 下生成的
③ 已添加 127.0.0.1 和 localhost 到允许域名列表

以上三项请在 https://console.amap.com/dev/key/ 对应 key 的详情页配置`,
  );
}
