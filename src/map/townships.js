const TOWNSHIP_DIRECTORY_INDEX_URL = "/data/township-directory-index.json";
const TOWNSHIP_REPO_TREE_BASE = "https://github.com/rooma1989/china_geo_data/tree/main";
const TOWNSHIP_CDN_BASE = "https://cdn.jsdelivr.net/gh/rooma1989/china_geo_data@main";

const townshipDirectoryIndexCache = new Map();
const townshipGeoJsonCache = new Map();

function normalizeTownshipPathSegment(name) {
  return String(name || "").trim();
}

function townshipPathFromNames({ provinceName, cityName, districtName }) {
  return [provinceName, cityName, districtName].map(normalizeTownshipPathSegment).filter(Boolean).join("/");
}

function encodeTownshipPath(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function townshipTreeUrl(path = "") {
  return path ? `${TOWNSHIP_REPO_TREE_BASE}/${encodeTownshipPath(path)}` : TOWNSHIP_REPO_TREE_BASE;
}

function townshipFileUrl(path) {
  return `${TOWNSHIP_CDN_BASE}/${encodeTownshipPath(path)}`;
}

function emptyTownshipCollection(path, metadata = {}) {
  return {
    type: "FeatureCollection",
    features: [],
    __sourceUrl: townshipTreeUrl(path),
    __directoryPath: path,
    __indexUrl: TOWNSHIP_DIRECTORY_INDEX_URL,
    __sourceBaseUrl: TOWNSHIP_CDN_BASE,
    __status: "ready",
    __loadedFiles: 0,
    __totalFiles: 0,
    __error: "",
    ...metadata,
  };
}

function featureFromGeoJson(geojson, fallbackName, sourceUrl) {
  const source =
    geojson?.type === "FeatureCollection" || geojson?.type === "Feature" || geojson?.type === "Polygon" || geojson?.type === "MultiPolygon"
      ? geojson
      : geojson?.geojson || geojson?.geometry || null;
  const features =
    source?.type === "FeatureCollection"
      ? source.features || []
      : source?.type === "Feature"
        ? [source]
        : source?.type === "Polygon" || source?.type === "MultiPolygon"
          ? [{ type: "Feature", properties: {}, geometry: source }]
          : [];

  return features
    .filter((feature) => feature?.geometry)
    .map((feature, index) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        name: feature.properties?.name || fallbackName,
        adcode: feature.properties?.adcode || `township-${fallbackName}-${index}`,
        level: "township",
        sourceUrl,
      },
    }));
}

async function loadTownshipDirectoryIndex() {
  const cacheKey = "index";
  if (townshipDirectoryIndexCache.has(cacheKey)) {
    return townshipDirectoryIndexCache.get(cacheKey);
  }

  const request = fetch(TOWNSHIP_DIRECTORY_INDEX_URL)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`乡镇街道目录索引加载失败: ${response.status}`);
      }

      const payload = await response.json();
      if (!payload?.directories || typeof payload.directories !== "object") {
        throw new Error("乡镇街道目录索引格式无效");
      }

      return payload;
    })
    .catch((error) => {
      townshipDirectoryIndexCache.delete(cacheKey);
      throw error;
    });

  townshipDirectoryIndexCache.set(cacheKey, request);
  return request;
}

async function loadTownshipDirectory(path) {
  const payload = await loadTownshipDirectoryIndex();
  const names = Array.isArray(payload.directories?.[path]) ? payload.directories[path] : [];
  return {
    names,
    source: payload.source || null,
    stats: payload.stats || null,
  };
}

async function loadTownshipFile(path, fileName) {
  const fallbackName = String(fileName || "")
    .replace(/^geo_/, "")
    .replace(/\.json$/i, "");
  const sourceUrl = townshipFileUrl(`${path}/${fileName}`);
  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error(`乡镇街道文件加载失败: ${response.status}`);
  }

  return featureFromGeoJson(await response.json(), fallbackName, sourceUrl);
}

export function townshipBoundaryUrl({ provinceName, cityName, districtName }) {
  const path = townshipPathFromNames({ provinceName, cityName, districtName });
  return townshipTreeUrl(path);
}

export async function loadTownshipGeoJson({ provinceName, cityName, districtName, maxFiles = 80 }) {
  const path = townshipPathFromNames({ provinceName, cityName, districtName });
  if (path.split("/").length < 3) {
    return emptyTownshipCollection(path);
  }

  const key = `${path}:${maxFiles}`;
  if (townshipGeoJsonCache.has(key)) {
    return townshipGeoJsonCache.get(key);
  }

  const request = loadTownshipDirectory(path)
    .then(async ({ names, source, stats }) => {
      const files = names.filter((name) => /^geo_.+\.json$/i.test(name)).slice(0, maxFiles);
      if (!files.length) {
        return emptyTownshipCollection(path, {
          __source: source,
          __sourceStats: stats,
        });
      }

      const loadedFiles = await Promise.allSettled(files.map((fileName) => loadTownshipFile(path, fileName)));
      const featureGroups = [];
      const failedFiles = [];

      loadedFiles.forEach((result, index) => {
        if (result.status === "fulfilled") {
          featureGroups.push(result.value);
          return;
        }

        failedFiles.push({
          fileName: files[index],
          message: result.reason instanceof Error ? result.reason.message : "乡镇街道文件加载失败",
        });
      });

      const succeeded = featureGroups.length;
      const total = files.length;
      if (!succeeded && failedFiles.length) {
        throw new Error(`乡镇街道文件加载失败: 0/${total} 成功`);
      }

      return {
        type: "FeatureCollection",
        features: featureGroups.flat(),
        __sourceUrl: townshipTreeUrl(path),
        __directoryPath: path,
        __indexUrl: TOWNSHIP_DIRECTORY_INDEX_URL,
        __sourceBaseUrl: TOWNSHIP_CDN_BASE,
        __source: source,
        __sourceStats: stats,
        __status: failedFiles.length ? "partial" : "ready",
        __loadedFiles: succeeded,
        __totalFiles: total,
        __failedFiles: failedFiles,
        __error: failedFiles.length ? `乡镇街道部分加载: ${succeeded}/${total} 文件成功` : "",
      };
    })
    .catch((error) => {
      townshipGeoJsonCache.delete(key);
      throw error;
    });

  townshipGeoJsonCache.set(key, request);
  return request;
}

export function clearTownshipCaches() {
  townshipDirectoryIndexCache.clear();
  townshipGeoJsonCache.clear();
}
