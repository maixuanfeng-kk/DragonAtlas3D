import * as THREE from "three";
import { featureBounds, lerp, pointInFeature, projectLonLat } from "./geo.js";
import { loadRasterTile, loadTerrariumTile, rasterSourceInfo } from "./dataSources.js";
import {
  chooseDemTiles,
  chooseRasterTiles,
  detailForLevel,
  exaggerationForLevel,
  gridForLevel,
  HEIGHT_SCALE,
} from "./terrainConfig.js";
import { reliefColor } from "./terrainShading.js";
import { tileKey, sampleElevation, sampleRasterColor } from "./terrainSampling.js";
import { buildTerrainTexture } from "./terrainTexture.js";

export { demZoomForLevel, exaggerationForLevel, gridForLevel } from "./terrainConfig.js";
export { terrainColor } from "./terrainColors.js";
export { sampleElevation } from "./terrainSampling.js";

function prepareMaskFeatures(features) {
  return features.map((feature) => {
    const bounds = feature.__bounds || featureBounds(feature);
    feature.__bounds = bounds;
    return { feature, bounds };
  });
}

function isInsideAnyFeature(lon, lat, preparedFeatures) {
  return preparedFeatures.some(({ feature, bounds }) => {
    if (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat) {
      return false;
    }

    return pointInFeature(lon, lat, feature);
  });
}

function rasterLoadSummary(results, source = "imagery") {
  const sourceInfo = rasterSourceInfo(source);
  const loaded = results.filter((result) => result.status === "fulfilled").length;
  const requested = results.length;
  const failed = requested - loaded;
  const firstError = results.find((result) => result.status === "rejected")?.reason;

  return {
    id: sourceInfo.id,
    label: sourceInfo.label,
    serviceUrl: sourceInfo.serviceUrl,
    attribution: sourceInfo.attribution,
    status: failed === 0 ? "ready" : loaded > 0 ? "partial" : "failed",
    requested,
    loaded,
    failed,
    error: firstError instanceof Error ? firstError.message : firstError ? String(firstError) : "",
  };
}

async function loadTerrainTiles(bounds, level) {
  const { demZoom, tiles } = chooseDemTiles(bounds, level);
  const { rasterZoom, tiles: rasterTiles } = chooseRasterTiles(bounds, level);
  const [loadedTiles, loadedRasterResults, loadedHillshadeResults] = await Promise.all([
    Promise.all(tiles.map((tile) => loadTerrariumTile(tile))),
    Promise.allSettled(rasterTiles.map((tile) => loadRasterTile(tile, "imagery"))),
    Promise.allSettled(rasterTiles.map((tile) => loadRasterTile(tile, "hillshade"))),
  ]);

  return {
    demZoom,
    tiles,
    rasterZoom,
    tileMap: new Map(loadedTiles.map((tile) => [tileKey(tile.z, tile.x, tile.y), tile])),
    rasterMap: fulfilledTileMap(loadedRasterResults),
    hillshadeMap: fulfilledTileMap(loadedHillshadeResults),
    imagery: rasterLoadSummary(loadedRasterResults, "imagery"),
    hillshade: rasterLoadSummary(loadedHillshadeResults, "hillshade"),
  };
}

function fulfilledTileMap(results) {
  return new Map(
    results
      .filter((result) => result.status === "fulfilled")
      .map((result) => [tileKey(result.value.z, result.value.x, result.value.y), result.value]),
  );
}

function buildGrid({ bounds, size, rows, cols, demZoom, tileMap, exaggeration }) {
  const positions = [];
  const uvs = [];
  const elevations = [];
  const heights = [];
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let row = 0; row <= rows; row += 1) {
    const lat = lerp(bounds.minLat, bounds.maxLat, row / rows);

    for (let col = 0; col <= cols; col += 1) {
      const lon = lerp(bounds.minLon, bounds.maxLon, col / cols);
      const elevation = sampleElevation(lon, lat, demZoom, tileMap);
      const height = elevation * HEIGHT_SCALE * exaggeration;
      const [x, y, z] = projectLonLat(lon, lat, bounds, size, height);

      minElevation = Math.min(minElevation, elevation);
      maxElevation = Math.max(maxElevation, elevation);
      elevations.push(elevation);
      heights.push(height);
      positions.push(x, y, z);
      uvs.push(col / cols, row / rows);
    }
  }

  return { positions, uvs, elevations, heights, minElevation, maxElevation };
}

function buildVertexColors({ bounds, size, rows, cols, grid, rasterZoom, rasterMap, hillshadeMap, textureBlend }) {
  const colors = [];
  const stride = cols + 1;

  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      const lon = lerp(bounds.minLon, bounds.maxLon, col / cols);
      const lat = lerp(bounds.minLat, bounds.maxLat, row / rows);
      const color = reliefColor({
        elevation: grid.elevations[row * stride + col],
        elevations: grid.elevations,
        heights: grid.heights,
        row,
        col,
        cols,
        rows,
        lon,
        lat,
        bounds,
        size,
        textureColor: sampleRasterColor(lon, lat, rasterZoom, rasterMap),
        hillshadeColor: sampleRasterColor(lon, lat, rasterZoom, hillshadeMap),
        textureBlend,
      });
      colors.push(color.r, color.g, color.b);
    }
  }

  return colors;
}

function buildTerrainIndices({ bounds, rows, cols, maskFeatures }) {
  const indices = [];
  const stride = cols + 1;
  let cells = 0;

  for (let row = 0; row < rows; row += 1) {
    const lat = lerp(bounds.minLat, bounds.maxLat, (row + 0.5) / rows);

    for (let col = 0; col < cols; col += 1) {
      const lon = lerp(bounds.minLon, bounds.maxLon, (col + 0.5) / cols);
      if (!isInsideAnyFeature(lon, lat, maskFeatures)) {
        continue;
      }

      const a = row * stride + col;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;

      indices.push(a, c, b, b, c, d);
      cells += 1;
    }
  }

  return { indices, cells };
}

function createGeometry({ positions, colors, uvs, indices }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export async function buildTerrainSurface({ bounds, size, features, level }) {
  const { cols, rows } = gridForLevel(level);
  const terrainTiles = await loadTerrainTiles(bounds, level);
  const exaggeration = exaggerationForLevel(level);
  const textureBlend = detailForLevel(level).textureBlend;
  const maskFeatures = prepareMaskFeatures(features);
  const grid = buildGrid({
    bounds,
    size,
    rows,
    cols,
    demZoom: terrainTiles.demZoom,
    tileMap: terrainTiles.tileMap,
    exaggeration,
  });
  const colors = buildVertexColors({
    bounds,
    size,
    rows,
    cols,
    grid,
    rasterZoom: terrainTiles.rasterZoom,
    rasterMap: terrainTiles.rasterMap,
    hillshadeMap: terrainTiles.hillshadeMap,
    textureBlend,
  });
  const { indices, cells } = buildTerrainIndices({ bounds, rows, cols, maskFeatures });
  const texture = buildTerrainTexture({
    bounds,
    size,
    level,
    rasterZoom: terrainTiles.rasterZoom,
    rasterMap: terrainTiles.rasterMap,
    hillshadeMap: terrainTiles.hillshadeMap,
    elevations: grid.elevations,
    cols,
    rows,
  });

  return {
    geometry: createGeometry({ positions: grid.positions, colors, uvs: grid.uvs, indices }),
    texture,
    demZoom: terrainTiles.demZoom,
    tiles: terrainTiles.tiles.length,
    rasterZoom: terrainTiles.rasterZoom,
    rasterTiles: terrainTiles.rasterMap.size,
    hillshadeTiles: terrainTiles.hillshadeMap.size,
    imagery: terrainTiles.imagery,
    hillshade: terrainTiles.hillshade,
    stats: {
      cells,
      minElevation: Number.isFinite(grid.minElevation) ? Math.round(grid.minElevation) : 0,
      maxElevation: Number.isFinite(grid.maxElevation) ? Math.round(grid.maxElevation) : 0,
    },
    sampleHeight(lon, lat) {
      return sampleElevation(lon, lat, terrainTiles.demZoom, terrainTiles.tileMap) * HEIGHT_SCALE * exaggeration;
    },
  };
}
