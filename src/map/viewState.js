import * as THREE from "three";
import { datavBoundaryUrl, datavSingleBoundaryUrl, rasterSourceInfo } from "./dataSources.js";
import { featureCenter, findFeatureAt } from "./geo.js";

export const DEFAULT_VIEW_ZOOM = 1;
export const MIN_VIEW_ZOOM = 0.75;
export const MAX_VIEW_ZOOM = 42;
export const FIT_MARGIN = 1.18;
export const TERRAIN_BASE_Y = -0.72;
export const TOP_CAMERA = new THREE.Vector3(0, 28, 0);
export const TILT_CAMERA = new THREE.Vector3(0, 26, 11);

export const LOD_ZOOM = {
  countryCities: 2.15,
  countryDistricts: 10,
  countryTownships: 18,
  provinceDistricts: 2.55,
  provinceTownships: 7.5,
  cityTownships: 3.2,
  tributaryRivers: 2.35,
};

export const COUNTRY_NODE = {
  name: "中国",
  fullName: "中华人民共和国",
  adcode: "100000",
  level: "country",
};

export const NANSHA_MARKERS = [
  { name: "永暑礁", center: [112.88, 9.55], detail: true },
  { name: "美济礁", center: [115.53, 9.91], detail: true },
  { name: "渚碧礁", center: [114.07, 10.91], detail: true },
  { name: "南沙群岛", center: [113.7, 9.8], label: true },
];

export const AMAP_PLACE_SEARCH_SOURCE = {
  id: "amap-web-place-search",
  label: "高德 Web 服务 POI 搜索",
  serviceUrl: "https://restapi.amap.com/v5/place/text",
  attribution: "Source: 高德开放平台 Place Search v5",
  access: "key-required",
};

export const AMAP_VIEWPORT_POI_SOURCE = {
  id: "amap-web-viewport-poi",
  label: "高德视口精细地点层",
  serviceUrl: "https://restapi.amap.com/v5/place/polygon",
  attribution: "Source: 高德开放平台 Place Search v5 polygon",
  access: "key-required",
};

export const AMAP_RESIDENTIAL_LAYER_SOURCE = AMAP_VIEWPORT_POI_SOURCE;

export function initialRasterStats(source = "imagery") {
  return {
    ...rasterSourceInfo(source),
    status: "pending",
    requested: 0,
    loaded: 0,
    failed: 0,
    error: "",
  };
}

export function initialPoiSearchState() {
  const hasKey = Boolean(import.meta.env.VITE_AMAP_WEB_KEY);
  return {
    ...AMAP_PLACE_SEARCH_SOURCE,
    status: hasKey ? "pending" : "failed",
    requested: 0,
    loaded: 0,
    failed: hasKey ? 0 : 1,
    resultCount: 0,
    query: "",
    regionLabel: "中国",
    error: hasKey ? "" : "缺少 VITE_AMAP_WEB_KEY，当前无法使用高德 POI 搜索。",
    note: hasKey
      ? "当前保留搜索入口，同时优先支持在地图缩放后自动显示精细地点。"
      : "未启用高德 Web 服务 key，当前仅可浏览行政边界与地形底座。",
  };
}

export function initialResidentialLayerState() {
  const hasKey = Boolean(import.meta.env.VITE_AMAP_WEB_KEY);
  return {
    ...AMAP_VIEWPORT_POI_SOURCE,
    status: hasKey ? "pending" : "failed",
    requested: 0,
    loaded: 0,
    failed: hasKey ? 0 : 1,
    resultCount: 0,
    regionLabel: "中国",
    viewportLabel: "",
    error: hasKey ? "" : "缺少 VITE_AMAP_WEB_KEY，无法自动加载高德精细地点层。",
    note: hasKey
      ? "缩放到聚焦视角后，自动显示景点 / 酒店 / 车站 / 商圈代表点；商圈来自高德返回的 business_area 聚合。"
      : "精细地点层未启用。",
  };
}

export const INITIAL_STATS = {
  cells: 0,
  maxElevation: 0,
  demZoom: 0,
  tiles: 0,
  rasterZoom: 0,
  rasterTiles: 0,
  hillshadeTiles: 0,
  imagery: initialRasterStats("imagery"),
  hillshade: initialRasterStats("hillshade"),
  featureCount: 0,
};

export function sourceStatusText(status) {
  return {
    pending: "等待加载",
    ready: "已就绪",
    partial: "部分就绪",
    failed: "加载失败",
  }[status] || status;
}

export function levelName(level) {
  return {
    country: "全国",
    province: "省级",
    city: "城市",
    district: "区县",
    township: "街道 / 乡镇",
    poi: "地点",
  }[level] || level;
}

export function childLevelName(features) {
  const first = features.find((feature) => feature.properties?.name);
  return levelName(first?.properties?.level || "province");
}

export function shortName(name = "") {
  return name
    .replace(/特别行政区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/藏族自治州$/, "")
    .replace(/彝族自治州$/, "")
    .replace(/蒙古自治州$/, "")
    .replace(/朝鲜族自治州$/, "")
    .replace(/哈尼族彝族自治州$/, "")
    .replace(/傣族景颇族自治州$/, "")
    .replace(/自治州$/, "")
    .replace(/自治区$/, "")
    .replace(/地区$/, "")
    .replace(/自治县$/, "")
    .replace(/街道办事处$/, "街道")
    .replace(/[省市县区旗]$/, "");
}

export function normalizeFeature(feature) {
  const properties = feature.properties || {};
  const adcode = String(properties.adcode || "");
  return {
    name: shortName(properties.name || ""),
    fullName: properties.name || "",
    adcode,
    level: properties.level,
    feature,
  };
}

export function sourceUrlForNode(node, collection = false) {
  if (!node?.adcode) {
    return datavBoundaryUrl("100000");
  }

  return collection ? datavBoundaryUrl(node.adcode) : datavSingleBoundaryUrl(node.adcode);
}

export function featureListForSearch(features) {
  return features
    .filter((feature) => feature.properties?.name)
    .map((feature) => normalizeFeature(feature))
    .sort((left, right) => left.adcode.localeCompare(right.adcode));
}

export function findFeatureNear(lon, lat, features, maxDistance = 2.8) {
  const exact = findFeatureAt(lon, lat, features);
  if (exact) {
    return exact;
  }

  let nearest = null;
  let nearestDistance = maxDistance * maxDistance;
  features.forEach((feature) => {
    const [centerLon, centerLat] = featureCenter(feature);
    const distance = (centerLon - lon) ** 2 + (centerLat - lat) ** 2;
    if (distance < nearestDistance) {
      nearest = feature;
      nearestDistance = distance;
    }
  });

  return nearest;
}
