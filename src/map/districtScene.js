import * as THREE from "three";
import { getAmapWebKey } from "../appConfig.js";
import { featureBounds, mergeBounds, padBounds } from "./geo.js";
import { buildLabels, createLabelElements, createLineGroup, createMarkerGroup } from "./overlays.js";
import { searchRegionForNode } from "./poiLayer.js";
import { prepareResidentialLayerForNode } from "./residentialLayer.js";
import { clearSceneLayers, resizeScene } from "./sceneRuntime.js";
import { buildTerrainSurface } from "./terrain.js";
import { visibleGeoBounds } from "./viewBounds.js";
import { DEFAULT_VIEW_ZOOM, featureListForSearch } from "./viewState.js";
import { renderTravelNodeLayer } from "./wuhanTravelNodes.js";

function deriveSize(bounds, previousSize) {
  if (previousSize?.width && previousSize?.depth) {
    return previousSize;
  }

  const lonSpan = Math.max(0.1, bounds.maxLon - bounds.minLon);
  const latSpan = Math.max(0.1, bounds.maxLat - bounds.minLat);
  const aspect = lonSpan / latSpan;
  if (aspect >= 25 / 20.6) {
    return {
      width: 25,
      depth: Math.max(7.5, Math.min(20.6, 25 / aspect)),
    };
  }

  return {
    width: Math.max(7.5, Math.min(25, 20.6 * aspect)),
    depth: 20.6,
  };
}

function updatePoiSearchState(state, node) {
  const hasKey = Boolean(getAmapWebKey());
  state.callbacks.setPoiSearchState((current) => ({
    ...current,
    status: current.status === "failed" && !hasKey ? "failed" : "pending",
    query: "",
    resultCount: 0,
    error: current.status === "failed" && !hasKey ? current.error : "",
    regionLabel: searchRegionForNode(node).label,
  }));
}

export async function renderDistrictScene(state, { node, features, sourceUrl, nextTrail }) {
  state.isRenderingRegion = true;
  state.callbacks.setLoading(true);
  state.callbacks.setNotice("");

  try {
    if (!features?.length) {
      throw new Error("当前区县没有可用的街道/乡镇边界数据");
    }

    const namedFeatures = features.filter((feature) => feature.properties?.name && feature.geometry);
    if (!namedFeatures.length) {
      throw new Error("当前区县街道/乡镇边界为空");
    }

    const normalizedBounds = padBounds(mergeBounds(namedFeatures.map(featureBounds)), 0.14);
    const size = deriveSize(normalizedBounds, state.context?.size);
    const terrain = await buildTerrainSurface({
      bounds: normalizedBounds,
      size,
      features: namedFeatures,
      level: "district",
    });

    if (state.disposed) {
      terrain.geometry.dispose();
      terrain.texture?.dispose();
      return;
    }

    clearSceneLayers(state);
    state.context = {
      node,
      level: "district",
      bounds: normalizedBounds,
      size,
      features: namedFeatures,
      namedFeatures,
      sourceUrl,
      terrain,
    };

    state.terrainMesh = new THREE.Mesh(
      terrain.geometry,
      new THREE.MeshBasicMaterial({
        map: terrain.texture || null,
        vertexColors: !terrain.texture,
        side: THREE.DoubleSide,
      }),
    );
    state.terrainGroup.add(state.terrainMesh);

    state.lineGroup = createLineGroup({
      features: namedFeatures,
      bounds: normalizedBounds,
      size,
      sampleHeight: terrain.sampleHeight,
      selectedAdcode: null,
      variant: "townshipDetail",
    });
    state.terrainGroup.add(state.lineGroup);

    state.markerGroup = createMarkerGroup({ bounds: normalizedBounds, size, sampleHeight: terrain.sampleHeight });
    state.terrainGroup.add(state.markerGroup);

    state.labelItems = createLabelElements({
      labels: buildLabels({ features: namedFeatures, bounds: normalizedBounds, level: "township" }),
      labelLayer: state.labelLayer,
    });

    state.targetZoom = DEFAULT_VIEW_ZOOM;
    state.viewZoom = DEFAULT_VIEW_ZOOM;
    state.lodFocusLonLat = null;
    state.targetPan.set(0, state.pan.y, 0);
    state.pan.copy(state.targetPan);
    state.terrainGroup.position.copy(state.pan);
    resizeScene(state);

    state.callbacks.setCurrentNode(node);
    state.callbacks.setSelectedNode(node);
    state.callbacks.setTrail(nextTrail);
    state.callbacks.setCurrentFeatures(featureListForSearch(namedFeatures));
    state.callbacks.setStats({
      cells: terrain.stats.cells,
      maxElevation: terrain.stats.maxElevation,
      demZoom: terrain.demZoom,
      tiles: terrain.tiles,
      rasterZoom: terrain.rasterZoom,
      rasterTiles: terrain.rasterTiles,
      hillshadeTiles: terrain.hillshadeTiles,
      imagery: terrain.imagery,
      hillshade: terrain.hillshade,
      featureCount: namedFeatures.length,
    });
    prepareResidentialLayerForNode(state, node);
    updatePoiSearchState(state, node);
    state.callbacks.setSearch("");
    renderTravelNodeLayer(state, nextTrail);
    state.scheduleResidentialRefresh?.();
    state.callbacks.onViewportChange?.({
      currentNode: node,
      bounds: visibleGeoBounds(state),
    });
  } catch (error) {
    state.callbacks.setNotice(error instanceof Error ? error.message : "区级街道场景加载失败");
  } finally {
    state.callbacks.setLoading(false);
    state.isRenderingRegion = false;
  }
}
