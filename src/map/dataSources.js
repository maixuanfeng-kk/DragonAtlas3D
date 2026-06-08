export const DATAV_BOUNDARY_BASE = "https://geo.datav.aliyun.com/areas_v3/bound";
export const TERRARIUM_BASE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
export const ARCGIS_IMAGERY_BASE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
export const ARCGIS_HILLSHADE_BASE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile";
export const FREE_IMAGERY_SOURCE = {
  id: "arcgis-imagery",
  label: "ArcGIS World Imagery",
  serviceUrl: `${ARCGIS_IMAGERY_BASE.replace(/\/tile$/, "")}?f=pjson`,
  attribution: "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
};
export const HILLSHADE_SOURCE = {
  id: "arcgis-hillshade",
  label: "ArcGIS World Hillshade",
  serviceUrl: `${ARCGIS_HILLSHADE_BASE.replace(/\/tile$/, "")}?f=pjson`,
  attribution:
    "Sources: Esri, Vantor, Airbus DS, USGS, NGA, NASA, CGIAR, N Robinson, NCEAS, NLS, OS, NMA, Geodatastyrelsen, Rijkswaterstaat, GSA, Geoland, FEMA, Intermap, and the GIS user community",
};

import { clearTownshipCaches, loadTownshipGeoJson, townshipBoundaryUrl } from "./townships.js";

export { clearTownshipCaches, loadTownshipGeoJson, townshipBoundaryUrl };

const geoJsonCache = new Map();
const demTileCache = new Map();
const rasterTileCache = new Map();
const riverGeoJsonCache = new Map();

export const RIVER_DATA_URLS = {
  major: "/data/rivers/china-major-rivers.geojson",
  tributary: "/data/rivers/china-tributary-rivers.geojson",
};

const YANGTZE_SOURCE_IDS = new Set(["ne10m-756", "ne10m-758", "ne10m-760", "ne10m-763", "ne10m-745"]);
const YANGTZE_ESTUARY_EXTENSION = [
  [119.60635, 32.19689],
  [119.78, 32.13],
  [120.02, 32.02],
  [120.27, 31.9],
  [120.53, 31.79],
  [120.82, 31.7],
  [121.1, 31.61],
  [121.36, 31.5],
  [121.6, 31.41],
  [121.86, 31.34],
  [122.12, 31.28],
];

function geometryToLines(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }

  return [];
}

function appendLine(target, line, reverse = false) {
  const coordinates = reverse ? [...(line || [])].reverse() : line || [];
  if (!coordinates.length) {
    return;
  }

  const next = [...coordinates];
  const previous = target[target.length - 1];
  if (previous) {
    const [lonA, latA] = previous;
    const [lonB, latB] = next[0];
    if ((lonA - lonB) ** 2 + (latA - latB) ** 2 < 0.0004) {
      next.shift();
    }
  }

  target.push(...next);
}

function lineByFeatureId(features, id, index = 0) {
  const feature = features.find((item) => item.properties?.id === id);
  return geometryToLines(feature?.geometry)[index] || [];
}

function completeMajorRiverSystems(geojson) {
  const features = geojson?.features || [];
  if (!features.some((feature) => YANGTZE_SOURCE_IDS.has(feature.properties?.id))) {
    return geojson;
  }

  const yangtzeLine = [];
  appendLine(yangtzeLine, lineByFeatureId(features, "ne10m-756"));
  appendLine(yangtzeLine, lineByFeatureId(features, "ne10m-758"));
  appendLine(yangtzeLine, lineByFeatureId(features, "ne10m-760", 0));
  appendLine(yangtzeLine, lineByFeatureId(features, "ne10m-760", 1));
  appendLine(yangtzeLine, lineByFeatureId(features, "ne10m-763", 0));
  appendLine(yangtzeLine, lineByFeatureId(features, "ne10m-763", 1), true);
  appendLine(yangtzeLine, lineByFeatureId(features, "ne10m-745", 0), true);
  appendLine(yangtzeLine, lineByFeatureId(features, "ne10m-745", 1));
  appendLine(yangtzeLine, YANGTZE_ESTUARY_EXTENSION);

  if (yangtzeLine.length < 2) {
    return geojson;
  }

  return {
    ...geojson,
    features: [
      {
        type: "Feature",
        properties: {
          id: "yangtze-complete",
          name: "长江",
          name_en: "Yangtze",
          name_zh: "长江",
          scalerank: 1,
          min_zoom: 2,
          featurecla: "River",
          rivernum: 18,
          length: 48,
          provinceAdcodes: ["630000", "540000", "510000", "530000", "500000", "420000", "430000", "360000", "340000", "320000", "310000"],
          provinces: ["青海省", "西藏自治区", "四川省", "云南省", "重庆市", "湖北省", "湖南省", "江西省", "安徽省", "江苏省", "上海市"],
          kind: "major",
        },
        geometry: {
          type: "LineString",
          coordinates: yangtzeLine,
        },
      },
      ...features.filter((feature) => !YANGTZE_SOURCE_IDS.has(feature.properties?.id)),
    ],
  };
}

export function datavBoundaryUrl(adcode) {
  return `${DATAV_BOUNDARY_BASE}/${adcode}_full.json`;
}

export function datavSingleBoundaryUrl(adcode) {
  return `${DATAV_BOUNDARY_BASE}/${adcode}.json`;
}

export function terrariumTileUrl({ z, x, y }) {
  return `${TERRARIUM_BASE}/${z}/${x}/${y}.png`;
}

export function rasterTileUrl(tile, source = "imagery") {
  const base = source === "hillshade" ? ARCGIS_HILLSHADE_BASE : ARCGIS_IMAGERY_BASE;
  return `${base}/${tile.z}/${tile.y}/${tile.x}`;
}

export function rasterSourceInfo(source = "imagery") {
  return source === "hillshade" ? HILLSHADE_SOURCE : FREE_IMAGERY_SOURCE;
}

export async function loadAdminGeoJson(adcode) {
  const key = String(adcode);
  if (geoJsonCache.has(key)) {
    return geoJsonCache.get(key);
  }

  const url = datavBoundaryUrl(key);
  const request = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`行政区划加载失败: ${response.status}`);
    }

    const geojson = await response.json();
    geojson.__sourceUrl = url;
    return geojson;
  });

  geoJsonCache.set(key, request);
  return request;
}

export async function loadTerrariumTile(tile) {
  const key = `${tile.z}/${tile.x}/${tile.y}`;
  if (demTileCache.has(key)) {
    return demTileCache.get(key);
  }

  const request = fetch(terrariumTileUrl(tile))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`DEM 瓦片加载失败: ${response.status}`);
      }

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();

      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const elevations = new Float32Array(canvas.width * canvas.height);
      let min = Infinity;
      let max = -Infinity;

      for (let i = 0, j = 0; i < pixels.length; i += 4, j += 1) {
        const value = pixels[i] * 256 + pixels[i + 1] + pixels[i + 2] / 256 - 32768;
        const elevation = Number.isFinite(value) ? value : 0;
        elevations[j] = elevation;
        min = Math.min(min, elevation);
        max = Math.max(max, elevation);
      }

      return {
        ...tile,
        width: canvas.width,
        height: canvas.height,
        elevations,
        min,
        max,
      };
    })
    .catch((error) => {
      demTileCache.delete(key);
      throw error;
    });

  demTileCache.set(key, request);
  return request;
}

export async function loadRasterTile(tile, source = "imagery") {
  const key = `${source}/${tile.z}/${tile.x}/${tile.y}`;
  if (rasterTileCache.has(key)) {
    return rasterTileCache.get(key);
  }

  const sourceInfo = rasterSourceInfo(source);
  const request = fetch(rasterTileUrl(tile, source))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Raster tile load failed: ${response.status}`);
      }

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();

      return {
        ...tile,
        source: sourceInfo.id,
        providerLabel: sourceInfo.label,
        attribution: sourceInfo.attribution,
        width: canvas.width,
        height: canvas.height,
        pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
      };
    })
    .catch((error) => {
      rasterTileCache.delete(key);
      throw error;
    });

  rasterTileCache.set(key, request);
  return request;
}

export async function loadRiverGeoJson(kind = "major") {
  const url = RIVER_DATA_URLS[kind];
  if (!url) {
    throw new Error(`Unknown river layer: ${kind}`);
  }

  if (riverGeoJsonCache.has(kind)) {
    return riverGeoJsonCache.get(kind);
  }

  const request = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`河流数据加载失败: ${response.status}`);
    }

    const geojson = await response.json();
    const nextGeojson = kind === "major" ? completeMajorRiverSystems(geojson) : geojson;
    nextGeojson.__sourceUrl = url;
    return nextGeojson;
  });

  riverGeoJsonCache.set(kind, request);
  return request;
}

export function clearDataSourceCaches() {
  geoJsonCache.clear();
  demTileCache.clear();
  rasterTileCache.clear();
  riverGeoJsonCache.clear();
  clearTownshipCaches();
}
