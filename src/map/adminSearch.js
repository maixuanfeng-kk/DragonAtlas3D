import { getAmapWebKey } from "../appConfig.js";
import { COUNTRY_NODE, shortName } from "./viewState.js";

const AMAP_WEB_KEY = getAmapWebKey();

export const AMAP_DISTRICT_SEARCH_SOURCE = {
  id: "amap-web-district-search",
  label: "高德行政区查询",
  serviceUrl: "https://restapi.amap.com/v3/config/district",
  attribution: "Source: 高德开放平台 District Search",
  access: "key-required",
};

const PROVINCE_LOOKUP = {
  11: "北京市",
  12: "天津市",
  13: "河北省",
  14: "山西省",
  15: "内蒙古自治区",
  21: "辽宁省",
  22: "吉林省",
  23: "黑龙江省",
  31: "上海市",
  32: "江苏省",
  33: "浙江省",
  34: "安徽省",
  35: "福建省",
  36: "江西省",
  37: "山东省",
  41: "河南省",
  42: "湖北省",
  43: "湖南省",
  44: "广东省",
  45: "广西壮族自治区",
  46: "海南省",
  50: "重庆市",
  51: "四川省",
  52: "贵州省",
  53: "云南省",
  54: "西藏自治区",
  61: "陕西省",
  62: "甘肃省",
  63: "青海省",
  64: "宁夏回族自治区",
  65: "新疆维吾尔自治区",
  71: "台湾省",
  81: "香港特别行政区",
  82: "澳门特别行政区",
};

const LEVEL_PRIORITY = {
  province: 4,
  city: 3,
  district: 2,
  street: 1,
  country: 0,
};

function parseCenter(center = "") {
  const [lon, lat] = String(center).split(",").map(Number);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

function normalizeLevel(level = "") {
  const nextLevel = String(level || "").trim().toLowerCase();
  return nextLevel || "district";
}

export function provinceNameFromAdcode(adcode = "") {
  const normalized = String(adcode).padEnd(6, "0");
  return PROVINCE_LOOKUP[normalized.slice(0, 2)] || "";
}

export function pickDistrictCandidate(districts = []) {
  return (
    districts
      .filter((item) => item?.name && item?.adcode && LEVEL_PRIORITY[normalizeLevel(item.level)] > 1)
      .sort((left, right) => LEVEL_PRIORITY[normalizeLevel(right.level)] - LEVEL_PRIORITY[normalizeLevel(left.level)])[0] || null
  );
}

export function districtToNode(district) {
  const fullName = String(district?.name || "").trim();
  return {
    name: shortName(fullName),
    fullName,
    adcode: String(district?.adcode || ""),
    level: normalizeLevel(district?.level),
    center: parseCenter(district?.center || ""),
  };
}

export function buildTrailForNode(node) {
  const trail = [COUNTRY_NODE];
  if (!node?.adcode || node.adcode === COUNTRY_NODE.adcode) {
    return trail;
  }

  const provinceFullName = provinceNameFromAdcode(node.adcode);
  const provinceAdcode = `${String(node.adcode).slice(0, 2)}0000`;
  if (provinceFullName && provinceAdcode !== node.adcode) {
    trail.push({
      name: shortName(provinceFullName),
      fullName: provinceFullName,
      adcode: provinceAdcode,
      level: "province",
    });
  }

  trail.push(node);
  return trail;
}

export function hasAdminSearchKey() {
  return Boolean(AMAP_WEB_KEY);
}

export async function searchAdminDistrict(query) {
  if (!AMAP_WEB_KEY) {
    throw new Error("缺少 VITE_AMAP_WEB_KEY，当前无法调用高德行政区查询。");
  }

  const keywords = String(query || "").trim();
  if (!keywords) {
    throw new Error("搜索关键词不能为空。");
  }

  const url = new URL(AMAP_DISTRICT_SEARCH_SOURCE.serviceUrl);
  url.searchParams.set("key", AMAP_WEB_KEY);
  url.searchParams.set("keywords", keywords);
  url.searchParams.set("subdistrict", "0");
  url.searchParams.set("extensions", "all");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`高德行政区查询失败：HTTP ${response.status}`);
  }

  const data = await response.json();
  if (String(data.status) !== "1") {
    throw new Error(`高德行政区查询失败：${data.info || data.infocode || "未知错误"}`);
  }

  const candidate = pickDistrictCandidate(Array.isArray(data.districts) ? data.districts : []);
  const node = candidate ? districtToNode(candidate) : null;

  return {
    query: keywords,
    candidate,
    node,
    trail: node ? buildTrailForNode(node) : [COUNTRY_NODE],
    source: AMAP_DISTRICT_SEARCH_SOURCE,
  };
}
