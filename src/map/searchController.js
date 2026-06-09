import { datavBoundaryUrl } from "./dataSources.js";
import { searchResidentialPoi, amapSearchStateUpdate } from "./amapSearch.js";
import { renderPoiSelection, searchRegionForNode } from "./poiLayer.js";
import { drillIntoFeature, updateSelectedHighlight } from "./regionRenderer.js";
import { COUNTRY_NODE, normalizeFeature } from "./viewState.js";

export async function chooseFeature(state, feature) {
  if (!feature?.properties?.name) {
    return;
  }

  if (feature.properties.level === "province" || feature.properties.level === "city" || feature.properties.level === "district") {
    await drillIntoFeature(state, feature);
    return;
  }

  const node = normalizeFeature(feature);
  const baseTrail = state.trailRef.current.filter((item) => item.level !== "district");
  state.callbacks.setSelectedNode(node);
  state.callbacks.setTrail([...baseTrail, node]);
  updateSelectedHighlight(state, node.adcode);
}

export async function submitSearch({ query, currentFeatures, currentNode, sceneApi, setSelectedNode, setNotice, setPoiSearchState }) {
  const localMatch = currentFeatures.find((item) => item.fullName.includes(query) || item.name.includes(query) || item.adcode === query);
  if (localMatch) {
    sceneApi?.chooseByAdcode(localMatch.adcode);
    setPoiSearchState((current) =>
      amapSearchStateUpdate({
        ...current,
        status: "ready",
        requested: current.requested,
        loaded: current.loaded,
        failed: 0,
        resultCount: 0,
        query,
        regionLabel: searchRegionForNode(currentNode).label,
        error: "",
      }),
    );
    return;
  }

  const region = searchRegionForNode(currentNode);
  setPoiSearchState((current) =>
    amapSearchStateUpdate({
      ...current,
      status: "pending",
      requested: current.requested + 1,
      loaded: current.loaded,
      failed: current.failed,
      resultCount: current.resultCount,
      query,
      regionLabel: region.label,
      error: "",
    }),
  );

  try {
    const result = await searchResidentialPoi(query, region);
    if (!result.features.length) {
      const regionHint =
        !region.adcode || region.label === "全国"
          ? "当前在全国视图，建议先进入城市或区县后再搜小区。"
          : "可能是当前行政区限制过严或该小区名称未被收录。";
      setPoiSearchState((current) =>
        amapSearchStateUpdate({
          ...current,
          status: "partial",
          requested: current.requested,
          loaded: current.loaded + 1,
          failed: current.failed,
          resultCount: 0,
          query,
          regionLabel: result.regionLabel,
          error: `高德未返回小区结果。${regionHint}`,
        }),
      );
      setNotice(`高德未在${result.regionLabel}返回“${query}”的小区结果。${regionHint}`);
      return;
    }

    const feature = result.features[0];
    sceneApi?.selectPoiFeature(feature);
    setSelectedNode({
      name: feature.properties.shortName || feature.properties.name,
      fullName: feature.properties.fullName || feature.properties.name,
      adcode: feature.properties.adcode,
      level: "poi",
      feature,
    });
    setPoiSearchState((current) =>
      amapSearchStateUpdate({
        ...current,
        status: feature.properties.geometryStatus === "ready" ? "ready" : "partial",
        requested: current.requested,
        loaded: current.loaded + 1,
        failed: current.failed,
        resultCount: result.features.length,
        query,
        regionLabel: result.regionLabel,
        error: feature.properties.geometryStatus === "ready" ? "" : "高德当前结果只返回 POI 点位，未返回小区真实边界面。",
      }),
    );
    setNotice(
      feature.properties.geometryStatus === "ready"
        ? `高德已定位小区“${feature.properties.fullName}”`
        : `高德已定位小区“${feature.properties.fullName}”，当前仅提供点位`,
    );
  } catch (error) {
    setPoiSearchState((current) =>
      amapSearchStateUpdate({
        ...current,
        status: "failed",
        requested: current.requested,
        loaded: current.loaded,
        failed: current.failed + 1,
        resultCount: 0,
        query,
        regionLabel: region.label,
        error: error instanceof Error ? error.message : "高德 POI 搜索失败",
      }),
    );
    setNotice(error instanceof Error ? error.message : "高德 POI 搜索失败");
  }
}

export async function copyPanelApi(selectedNode, currentNode, setNotice) {
  const url = selectedNode.level === currentNode.level ? datavBoundaryUrl(currentNode.adcode) : datavBoundaryUrl(selectedNode.adcode || COUNTRY_NODE.adcode);
  try {
    await navigator.clipboard.writeText(url);
    setNotice("GeoJSON API 已复制");
  } catch {
    setNotice("复制失败，请手动复制链接");
  }
}

export function selectPoiOnMap(state, feature) {
  if (!feature || !state.context) {
    return;
  }

  renderPoiSelection(state, feature);
  state.callbacks.setSelectedNode({
    name: feature.properties?.shortName || feature.properties?.name || "小区/POI",
    fullName: feature.properties?.fullName || feature.properties?.name || "小区/POI",
    adcode: String(feature.properties?.adcode || ""),
    level: "poi",
    feature,
  });
}

export function selectTravelFeatureOnMap(state, feature) {
  if (!feature || !state.context) {
    return;
  }

  renderPoiSelection(state, feature);
  const nodeType = feature.properties?.nodeType === "area" ? "area" : "poi";
  state.callbacks.setSelectedNode({
    name: feature.properties?.shortName || feature.properties?.name || "武汉旅游节点",
    fullName: feature.properties?.fullName || feature.properties?.name || "武汉旅游节点",
    adcode: String(feature.properties?.travelId || feature.properties?.adcode || ""),
    level: nodeType,
    feature,
  });
}
