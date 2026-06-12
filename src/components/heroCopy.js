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
    eyebrow: "目的地已锁定",
    title: fullName,
    meta: [levelLabel, regionLabel],
    caption: `已根据 ${sourceLabel} 锁定 ${fullName}，即将进入高德细节规划模式。`,
  };
}

export function buildPoiReveal({ feature }) {
  const name = feature?.properties?.fullName || feature?.properties?.name || "精细地点";
  const categoryLabel = feature?.properties?.categoryLabel || "地点";
  const businessArea = feature?.properties?.businessArea || "";
  const provider = feature?.properties?.provider || "高德视口精细地点层";

  return {
    eyebrow: "高德精细地点",
    title: name,
    meta: [categoryLabel, businessArea || provider],
    caption: `${provider} 已锁定该地点。`,
  };
}

export function heroHeadline(node) {
  if (!node || node.level === "country") {
    return "DragonAtlas3D · 中国旅行助手";
  }
  return node.fullName || node.name || "中国";
}

export function heroSubline(node) {
  if (!node || node.level === "country") {
    return "搜索城市名称，或直接放大地图到省级区域，即可进入高德细节规划模式。";
  }
  return "继续缩放浏览，或搜索新城市进入规划。";
}
