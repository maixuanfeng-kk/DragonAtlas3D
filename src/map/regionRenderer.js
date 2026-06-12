import * as THREE from "three";
import { getAmapWebKey } from "../appConfig.js";
import { datavBoundaryUrl, loadAdminGeoJson, loadRiverGeoJson } from "./dataSources.js";
import { CHINA_BOUNDS, featureBounds, mergeBounds, padBounds } from "./geo.js";
import { buildLabels, createLabelElements, createLineGroup, createMarkerGroup } from "./overlays.js";
import { searchRegionForNode } from "./poiLayer.js";
import { prepareResidentialLayerForNode } from "./residentialLayer.js";
import { buildRiverLabels, createRiverGroup, filterRiverFeatures } from "./rivers.js";
import { clearSceneLayers, resizeScene } from "./sceneRuntime.js";
import { scheduleSceneArrival } from "./sceneTransitions.js";
import { buildTerrainSurface } from "./terrain.js";
import { visibleGeoBounds } from "./viewBounds.js";
import { COUNTRY_NODE, DEFAULT_VIEW_ZOOM, featureListForSearch } from "./viewState.js";
import { renderTravelNodeLayer } from "./wuhanTravelNodes.js";

export function updateSelectedHighlight(state, adcode) {
  if (!state.context || !state.lineGroup) {
    return;
  }

  state.terrainGroup.remove(state.lineGroup);
  state.lineGroup.traverse((child) => child.geometry?.dispose?.());
  state.lineGroup = createLineGroup({
    features: state.context.features,
    bounds: state.context.bounds,
    size: state.context.size,
    sampleHeight: state.context.terrain.sampleHeight,
    selectedAdcode: adcode,
  });
  state.terrainGroup.add(state.lineGroup);
}

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

export async function renderRegion(state, node, nextTrail) {
  state.isRenderingRegion = true;
  state.callbacks.setLoading(true);
  state.callbacks.setNotice("");

  try {
    const geojson = await loadAdminGeoJson(node.adcode);
    if (state.disposed) {
      return;
    }

    const features = geojson.features || [];
    const namedFeatures = features.filter((feature) => feature.properties?.name);
    const level = node.level;
    const bounds =
      level === "country"
        ? CHINA_BOUNDS
        : padBounds(node.feature ? featureBounds(node.feature) : mergeBounds(features.map(featureBounds)), 0.16);
    const size = deriveSize(bounds, state.context?.size);
    const terrain = await buildTerrainSurface({ bounds, size, features, level });

    if (state.disposed) {
      terrain.geometry.dispose();
      terrain.texture?.dispose();
      return;
    }

    clearSceneLayers(state);
    state.context = {
      node,
      level,
      bounds,
      size,
      features,
      namedFeatures,
      sourceUrl: geojson.__sourceUrl || datavBoundaryUrl(node.adcode),
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

    let majorRiverFeatures = [];
    try {
      const majorRiverGeojson = await loadRiverGeoJson("major");
      if (state.disposed) {
        return;
      }

      majorRiverFeatures = filterRiverFeatures({
        geojson: majorRiverGeojson,
        bounds,
        kind: "major",
        maxFeatures: level === "country" ? 34 : 24,
      });
      state.majorRiverGroup = createRiverGroup({
        features: majorRiverFeatures,
        bounds,
        size,
        sampleHeight: terrain.sampleHeight,
        kind: "major",
      });
      state.terrainGroup.add(state.majorRiverGroup);
    } catch (error) {
      state.callbacks.setNotice(error instanceof Error ? error.message : "主干河流加载失败");
    }

    state.lineGroup = createLineGroup({
      features,
      bounds,
      size,
      sampleHeight: terrain.sampleHeight,
      selectedAdcode: null,
    });
    state.terrainGroup.add(state.lineGroup);

    state.markerGroup = createMarkerGroup({ bounds, size, sampleHeight: terrain.sampleHeight });
    state.terrainGroup.add(state.markerGroup);

    state.labelItems = createLabelElements({
      labels: [
        ...buildLabels({ features: namedFeatures, bounds, level }),
        ...buildRiverLabels({
          features: majorRiverFeatures,
          bounds,
          kind: "major",
          maxLabels: level === "country" ? 7 : 5,
        }),
      ],
      labelLayer: state.labelLayer,
    });

    state.targetZoom = DEFAULT_VIEW_ZOOM;
    state.viewZoom = DEFAULT_VIEW_ZOOM;
    state.lodFocusLonLat = null;
    state.targetPan.set(0, state.pan.y, 0);
    state.pan.copy(state.targetPan);
    state.terrainGroup.position.copy(state.pan);
    resizeScene(state);

    const transition = state.transitionPreset || (!state.hasArrivedOnce && level === "country"
      ? { startZoom: 0.84, targetZoom: DEFAULT_VIEW_ZOOM, delay: 320 }
      : null);
    if (transition) {
      scheduleSceneArrival(state, transition);
    }
    state.transitionPreset = null;
    state.hasArrivedOnce = true;

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
    state.callbacks.setNotice(error instanceof Error ? error.message : "地图数据加载失败");
  } finally {
    state.callbacks.setLoading(false);
    state.isRenderingRegion = false;
  }
}

export async function drillIntoFeature(state, feature) {
  const nextNode = {
    name: feature.properties?.name || "",
    fullName: feature.properties?.name || "",
    adcode: String(feature.properties?.adcode || ""),
    level: feature.properties?.level,
    feature,
  };
  const baseTrail = state.context?.node?.level === "country" ? [COUNTRY_NODE] : state.trailRef.current;
  const nextTrail = [...baseTrail.filter((node) => node.level !== "district"), nextNode];
  await renderRegion(state, nextNode, nextTrail);
}
