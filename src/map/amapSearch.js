import { AMAP_PLACE_SEARCH_SOURCE, AMAP_RESIDENTIAL_LAYER_SOURCE, shortName } from "./viewState.js";

const AMAP_WEB_KEY = import.meta.env.VITE_AMAP_WEB_KEY || "";
const AMAP_PLACE_TEXT_URL = AMAP_PLACE_SEARCH_SOURCE.serviceUrl;
const AMAP_PLACE_POLYGON_URL = AMAP_RESIDENTIAL_LAYER_SOURCE.serviceUrl;
const RESIDENTIAL_TYPE_CODES = ["120300", "120302"];
const VIEWPORT_RESIDENTIAL_TYPE_CODES = ["120300", "120302", "120303"];
const RESIDENTIAL_TAGS = /(住宅|小区|宿舍|社区)/;
const RESIDENTIAL_NAME_TAGS = /(小区|花园|家园|宿舍|新村|公寓|名苑|华庭|家属楼|里|苑|居|城|湾|府|阁|堡)$/;
const NON_RESIDENTIAL_NAME_TAGS = /(服务站|体验店|餐厅|饭店|酒店|面馆|营业厅|超市|医院|学校|公司|广场|大厦|商场|政府|派出所|银行)$/;

export function hasAmapWebKey() {
  return Boolean(AMAP_WEB_KEY);
}

function normalizeRegion(region = {}) {
  const adcode = String(region.adcode || "").trim();
  const label = String(region.label || "").trim();

  return {
    adcode,
    label: label || "全国",
  };
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

function poiFeatureFromPlace(place, index, { query = "", sourceUrl = AMAP_PLACE_TEXT_URL, sourceMode = "search" } = {}) {
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
      provider: AMAP_PLACE_SEARCH_SOURCE.label,
      query,
      sourceMode,
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

export function polygonQueryParam(bounds) {
  return `${bounds.minLon.toFixed(4)},${bounds.maxLat.toFixed(4)}|${bounds.maxLon.toFixed(4)},${bounds.minLat.toFixed(4)}`;
}

function isResidentialCandidate(place) {
  const typecode = String(place?.typecode || "").trim();
  if (!VIEWPORT_RESIDENTIAL_TYPE_CODES.includes(typecode)) {
    return false;
  }

  const businessTags = `${place?.business?.rectag || ""} ${place?.business?.keytag || ""}`.trim();
  if (RESIDENTIAL_TAGS.test(businessTags)) {
    return true;
  }

  const name = String(place?.name || "").trim();
  if (NON_RESIDENTIAL_NAME_TAGS.test(name)) {
    return false;
  }

  return RESIDENTIAL_NAME_TAGS.test(name);
}

export async function searchResidentialViewport(bounds, pageSize = 25, maxFeatures = 40) {
  if (!hasAmapWebKey()) {
    throw new Error("缺少 VITE_AMAP_WEB_KEY，无法自动加载视野内小区层。");
  }

  const fetchPage = async (pageNum) => {
    const url = new URL(AMAP_PLACE_POLYGON_URL);
    url.searchParams.set("key", AMAP_WEB_KEY);
    url.searchParams.set("polygon", polygonQueryParam(bounds));
    url.searchParams.set("types", VIEWPORT_RESIDENTIAL_TYPE_CODES.join("|"));
    url.searchParams.set("show_fields", "business");
    url.searchParams.set("page_size", String(pageSize));
    url.searchParams.set("page_num", String(pageNum));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`高德视野内小区层加载失败: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (String(data.status) !== "1") {
      throw new Error(`高德视野内小区层加载失败: ${data.info || data.infocode || "未知错误"}`);
    }
    return data;
  };

  const firstPage = await fetchPage(1);
  const totalCount = Number(firstPage.count || 0);
  const secondPage = totalCount > pageSize ? await fetchPage(2) : null;
  const places = [...(firstPage.pois || []), ...(secondPage?.pois || [])];
  const features = places
    .filter(isResidentialCandidate)
    .map((place, index) =>
      poiFeatureFromPlace(place, index, {
        sourceUrl: AMAP_PLACE_POLYGON_URL,
        sourceMode: "viewport",
      }),
    )
    .filter(Boolean)
    .slice(0, maxFeatures);

  return {
    totalCount,
    pageCount: places.length,
    features,
    viewport: polygonQueryParam(bounds),
  };
}

export function amapSearchStateUpdate({ status = "pending", requested = 0, loaded = 0, failed = 0, resultCount = 0, query = "", regionLabel = "全国", error = "" }) {
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
      "高德 Web 服务搜索使用 key；优先按当前行政区 adcode 限定范围，默认返回小区 POI 点位；只有高德返回面边界时才显示真实面。",
  };
}

export async function searchResidentialPoi(query, region = {}) {
  if (!hasAmapWebKey()) {
    throw new Error("缺少 VITE_AMAP_WEB_KEY，无法调用高德 Web 服务搜索。");
  }

  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) {
    throw new Error("搜索关键词不能为空。");
  }

  const normalizedRegion = normalizeRegion(region);
  const url = new URL(AMAP_PLACE_TEXT_URL);
  url.searchParams.set("key", AMAP_WEB_KEY);
  url.searchParams.set("keywords", trimmedQuery);
  url.searchParams.set("types", RESIDENTIAL_TYPE_CODES.join("|"));
  url.searchParams.set("city_limit", "true");
  url.searchParams.set("show_fields", "business");
  url.searchParams.set("page_size", "8");
  if (normalizedRegion.adcode) {
    url.searchParams.set("region", normalizedRegion.adcode);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`高德 POI 搜索失败: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (String(data.status) !== "1") {
    throw new Error(`高德 POI 搜索失败: ${data.info || data.infocode || "未知错误"}`);
  }

  return normalizePoiResult(data, trimmedQuery, normalizedRegion.label);
}
