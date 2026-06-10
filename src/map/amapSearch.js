import { AMAP_PLACE_SEARCH_SOURCE, AMAP_VIEWPORT_POI_SOURCE, shortName } from "./viewState.js";
import {
  VIEWPORT_POI_CATEGORIES,
  buildBusinessAreaFeatures,
  filterTransportHubFeatures,
  summarizeViewportPoiCategories,
  takeRepresentativeFeatures,
} from "./viewportPois.js";

const AMAP_WEB_KEY = import.meta.env.VITE_AMAP_WEB_KEY || "";
const AMAP_PLACE_TEXT_URL = AMAP_PLACE_SEARCH_SOURCE.serviceUrl;
const AMAP_PLACE_POLYGON_URL = AMAP_VIEWPORT_POI_SOURCE.serviceUrl;

function ratingFromPlace(place) {
  return String(place?.business?.rating || place?.biz_ext?.rating || place?.rating || "").trim();
}

function normalizeRegion(region = {}) {
  const adcode = String(region.adcode || "").trim();
  const label = String(region.label || "").trim();

  return {
    adcode,
    label: label || "全国",
  };
}

export function hasAmapWebKey() {
  return Boolean(AMAP_WEB_KEY);
}

export function placePolygonToGeometry(polyline = "") {
  const rings = String(polyline || "")
    .split("|")
    .map((ring) =>
      ring
        .split(";")
        .map((point) => point.split(",").map(Number))
        .filter((point) => point.length >= 2 && point.every(Number.isFinite)),
    )
    .filter((ring) => ring.length >= 3);

  if (!rings.length) {
    return null;
  }

  const polygon = rings[0];
  const closed = polygon[0][0] === polygon[polygon.length - 1][0] && polygon[0][1] === polygon[polygon.length - 1][1];
  const outer = closed ? polygon : [...polygon, polygon[0]];

  return {
    type: "Polygon",
    coordinates: [outer],
  };
}

function poiFeatureFromPlace(
  place,
  index,
  {
    query = "",
    sourceUrl = AMAP_PLACE_TEXT_URL,
    sourceMode = "search",
    categoryId = "",
    categoryLabel = "",
  } = {},
) {
  const [lon, lat] = String(place.location || "")
    .split(",")
    .map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  const geometry = placePolygonToGeometry(place.business?.aoi?.polyline || place.polyline || "");

  return {
    type: "Feature",
    properties: {
      adcode: String(place.adcode || place.id || `poi-${index}`),
      amapId: place.id || "",
      level: "poi",
      name: place.name || query,
      shortName: shortName(place.name || query),
      fullName: place.name || query,
      center: [lon, lat],
      sourceUrl,
      address: place.address || "",
      businessArea: place.business?.business_area || "",
      geometryStatus: geometry ? "ready" : "point-only",
      category: place.type || "",
      typecode: place.typecode || "",
      rating: ratingFromPlace(place),
      provider: sourceMode === "viewport" ? AMAP_VIEWPORT_POI_SOURCE.label : AMAP_PLACE_SEARCH_SOURCE.label,
      query,
      sourceMode,
      categoryId,
      categoryLabel,
    },
    geometry,
  };
}

function normalizePoiResult(data, query, regionLabel) {
  const pois = Array.isArray(data?.pois) ? data.pois : [];
  const features = pois.map((place, index) => poiFeatureFromPlace(place, index, { query })).filter(Boolean);
  return {
    query,
    regionLabel,
    rawCount: Number(data?.count || 0),
    features,
    firstPoi: pois[0] || null,
  };
}

async function fetchAmapPlaceList(params, errorPrefix) {
  const url = new URL(params.sourceUrl || AMAP_PLACE_POLYGON_URL);
  Object.entries(params.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}` !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${errorPrefix}: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (String(data.status) !== "1") {
    throw new Error(`${errorPrefix}: ${data.info || data.infocode || "未知错误"}`);
  }

  return data;
}

export function polygonQueryParam(bounds) {
  return `${bounds.minLon.toFixed(4)},${bounds.maxLat.toFixed(4)}|${bounds.maxLon.toFixed(4)},${bounds.minLat.toFixed(4)}`;
}

function categorySummary(features) {
  return features.reduce((summary, feature) => {
    const key = feature.properties?.categoryId || "unknown";
    return {
      ...summary,
      [key]: (summary[key] || 0) + 1,
    };
  }, {});
}

async function searchViewportCategory(bounds, category) {
  const data = await fetchAmapPlaceList(
    {
      sourceUrl: AMAP_PLACE_POLYGON_URL,
      query: {
        key: AMAP_WEB_KEY,
        polygon: polygonQueryParam(bounds),
        types: category.amapTypes,
        show_fields: "business",
        page_size: category.pageSize,
        page_num: 1,
      },
    },
    `高德${category.label}视口查询失败`,
  );

  const rawPois = Array.isArray(data?.pois) ? data.pois : [];
  const rawFeatures = rawPois
    .map((place, index) =>
      poiFeatureFromPlace(place, index, {
        sourceUrl: AMAP_PLACE_POLYGON_URL,
        sourceMode: "viewport",
        categoryId: category.id,
        categoryLabel: category.label,
      }),
    )
    .filter(Boolean);

  const pickedFeatures =
    category.id === "station"
      ? filterTransportHubFeatures(rawFeatures).slice(0, category.limit)
      : category.id === "business"
        ? buildBusinessAreaFeatures(rawFeatures, category.limit)
        : takeRepresentativeFeatures(rawFeatures, category.limit);

  return {
    category,
    totalCount: Number(data?.count || 0),
    rawCount: rawFeatures.length,
    features: pickedFeatures,
    pageLimitReached: Number(data?.count || 0) > rawFeatures.length,
    pointOnly: pickedFeatures.length > 0 && pickedFeatures.every((feature) => feature.properties?.geometryStatus !== "ready"),
    businessAreaCoverage:
      category.id === "business" && rawFeatures.length > 0
        ? pickedFeatures.length / Math.max(1, Math.min(rawFeatures.length, category.limit))
        : 1,
  };
}

export async function searchViewportPois(bounds) {
  if (!hasAmapWebKey()) {
    throw new Error("缺少 VITE_AMAP_WEB_KEY，无法加载高德精细地点层。");
  }

  const settled = await Promise.allSettled(VIEWPORT_POI_CATEGORIES.map((category) => searchViewportCategory(bounds, category)));
  const successfulResults = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failedResults = settled
    .filter((result) => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : "高德精细地点层加载失败"));

  const features = successfulResults.flatMap((result) => result.features);
  const counts = categorySummary(features);
  const pageLimitedCategories = successfulResults.filter((result) => result.pageLimitReached).map((result) => result.category.label);
  const pointOnlyCategories = successfulResults.filter((result) => result.pointOnly).map((result) => result.category.label);
  const missingBusinessArea =
    successfulResults.some((result) => result.category.id === "business" && result.rawCount > 0 && result.features.length === 0);

  let status = "ready";
  const notes = [];
  if (failedResults.length) {
    status = successfulResults.length ? "partial" : "failed";
    notes.push(failedResults.join("；"));
  }
  if (pageLimitedCategories.length) {
    status = "partial";
    notes.push(`当前视口结果过多，已按代表点截取：${pageLimitedCategories.join("、")}`);
  }
  if (pointOnlyCategories.length) {
    status = "partial";
    notes.push(`高德未为这些类别返回 AOI 面：${pointOnlyCategories.join("、")}`);
  }
  if (missingBusinessArea) {
    status = "partial";
    notes.push("部分购物类 POI 未返回 business_area，因此未被纳入商圈聚合");
  }

  return {
    status,
    features,
    counts,
    viewport: polygonQueryParam(bounds),
    note:
      notes.join("；") ||
      `高德视口精细地点层已就绪：${summarizeViewportPoiCategories(counts)}。商圈基于高德返回的 business_area 聚合。`,
    error: failedResults.join("；"),
  };
}

export function amapSearchStateUpdate({
  status = "pending",
  requested = 0,
  loaded = 0,
  failed = 0,
  resultCount = 0,
  query = "",
  regionLabel = "全国",
  error = "",
}) {
  return {
    ...AMAP_PLACE_SEARCH_SOURCE,
    status,
    requested,
    loaded,
    failed,
    resultCount,
    query,
    regionLabel,
    error,
    note:
      "当前搜索仍使用高德 Web 服务 key；地图缩放后的精细地点由独立的高德视口精细地点层负责，不做静默切换。",
  };
}

export async function searchAmapPlace(query, region = {}) {
  if (!hasAmapWebKey()) {
    throw new Error("缺少 VITE_AMAP_WEB_KEY，无法调用高德 Web 服务搜索。");
  }

  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) {
    throw new Error("搜索关键词不能为空。");
  }

  const normalizedRegion = normalizeRegion(region);
  const data = await fetchAmapPlaceList(
    {
      sourceUrl: AMAP_PLACE_TEXT_URL,
      query: {
        key: AMAP_WEB_KEY,
        keywords: trimmedQuery,
        city_limit: true,
        show_fields: "business",
        page_size: 8,
        region: normalizedRegion.adcode || undefined,
      },
    },
    "高德 POI 搜索失败",
  );

  return normalizePoiResult(data, trimmedQuery, normalizedRegion.label);
}
