import { provinceNameFromAdcode } from "../map/adminSearch.js";

const LEVEL_COPY = {
  country: "全国全景",
  province: "省级视角",
  city: "城市视角",
  district: "区县视角",
  township: "街道视角",
  poi: "地点视角",
};

export function buildLocationReveal({ node, sourceLabel = "地图数据" }) {
  const provinceName = provinceNameFromAdcode(node?.adcode || "");
  const fullName = node?.fullName || node?.name || "中国";
  const levelLabel = LEVEL_COPY[node?.level] || "区域视角";
  const regionLabel = provinceName ? `${provinceName} / ${node?.adcode || "100000"}` : node?.adcode || "100000";

  return {
    eyebrow: "地点探索",
    title: fullName,
    meta: [levelLabel, regionLabel],
    caption: `已根据 ${sourceLabel} 锁定 ${fullName}，镜头将轻推到它的真实地形视角。`,
  };
}

export function buildPoiReveal({ feature }) {
  const name = feature?.properties?.fullName || feature?.properties?.name || "精细地点";
  const categoryLabel = feature?.properties?.categoryLabel || "地点";
  const businessArea = feature?.properties?.businessArea || "";
  const provider = feature?.properties?.provider || "高德视口精细地点层";
  const geometryStatus = feature?.properties?.geometryStatus || "point-only";
  const geometryNote = geometryStatus === "ready" ? "已返回 AOI 面" : "当前仅有点位";

  return {
    eyebrow: "高德精细地点",
    title: name,
    meta: [categoryLabel, businessArea || provider],
    caption: `${provider} 已锁定该地点，镜头将轻推到当前位置。${geometryNote}。`,
  };
}

export function heroHeadline(node) {
  if (!node || node.level === "country") {
    return "先看见中国，再决定去哪里";
  }

  return `${node.fullName || node.name}，先看清地形，再继续规划`;
}

export function heroSubline(node) {
  if (!node || node.level === "country") {
    return "先建立中国地貌的空间感，再把景点、酒店、车站、商圈与后续行程逐步叠加进来。";
  }

  return "当前视角已经落到具体区域，继续缩放即可自动看到高德精细地点，再逐步承接路线、住宿与交通决策。";
}
