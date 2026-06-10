import { shouldLoadViewportPois } from "./viewportPois.js";

export const PREFER_DETAIL_MAP_FOR_FINE_POIS = true;

export function shouldRenderViewportPoiLayer({
  hasAmapWebKey,
  span,
  preferDetailMap = PREFER_DETAIL_MAP_FOR_FINE_POIS,
}) {
  if (!hasAmapWebKey || preferDetailMap) {
    return false;
  }

  return shouldLoadViewportPois({ span });
}

export function viewportPoiSuppressedNote() {
  return "3D 模式不再显示景点 / 酒店 / 车站 / 商圈圈层；请在聚焦后进入高德细节图查看精细地点。";
}
