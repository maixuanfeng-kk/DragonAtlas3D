import * as THREE from "three";
import {
  collectTilesForBounds,
  clamp,
  featureBounds,
  lerp,
  lonLatToTileFloat,
  pointInFeature,
  projectLonLat,
} from "./geo.js";
import { loadRasterTile, loadTerrariumTile, rasterSourceInfo } from "./dataSources.js";

const NO_DATA_FLOOR = -11000;
const HEIGHT_SCALE = 0.00043;
const SUN_DIRECTION = new THREE.Vector3(-0.48, 0.72, -0.5).normalize();
const RELIEF_SUN_DIRECTION = new THREE.Vector3(-0.56, 0.78, -0.28).normalize();
const WARM_LIGHT = new THREE.Color("#fff2ce");
const COOL_SHADE = new THREE.Color("#263d46");

const TERRAIN_DETAIL = {
  country: {
    demZoom: 6,
    minDemZoom: 5,
    maxTiles: 180,
    rasterZoom: 6,
    minRasterZoom: 5,
    maxRasterTiles: 180,
    grid: { cols: 420, rows: 340 },
    exaggeration: 1.48,
    textureBlend: 0.18,
    textureWidth: 1536,
  },
  province: {
    demZoom: 8,
    minDemZoom: 6,
    maxTiles: 165,
    rasterZoom: 8,
    minRasterZoom: 6,
    maxRasterTiles: 175,
    grid: { cols: 380, rows: 300 },
    exaggeration: 1.28,
    textureBlend: 0.2,
    textureWidth: 1792,
  },
  city: {
    demZoom: 10,
    minDemZoom: 7,
    maxTiles: 150,
    rasterZoom: 10,
    minRasterZoom: 7,
    maxRasterTiles: 165,
    grid: { cols: 340, rows: 270 },
    exaggeration: 1.08,
    textureBlend: 0.24,
    textureWidth: 1536,
  },
  district: {
    demZoom: 11,
    minDemZoom: 8,
    maxTiles: 140,
    rasterZoom: 11,
    minRasterZoom: 8,
    maxRasterTiles: 150,
    grid: { cols: 300, rows: 235 },
    exaggeration: 1,
    textureBlend: 0.28,
    textureWidth: 1280,
  },
};

function detailForLevel(level) {
  return TERRAIN_DETAIL[level] || TERRAIN_DETAIL.city;
}

export function demZoomForLevel(level) {
  return detailForLevel(level).demZoom;
}

export function gridForLevel(level) {
  return detailForLevel(level).grid;
}

export function exaggerationForLevel(level) {
  return detailForLevel(level).exaggeration;
}

export function terrainColor(elevation, lon = 104, lat = 35) {
  const color = new THREE.Color();
  const coast = new THREE.Color("#557757");
  const lowland = new THREE.Color("#86a064");
  const upland = new THREE.Color("#b3aa75");
  const plateau = new THREE.Color("#c6aa7d");
  const alpine = new THREE.Color("#918a7d");
  const rock = new THREE.Color("#b6b6ad");
  const snow = new THREE.Color("#efeee3");
  const desert = new THREE.Color("#c9ad72");
  const dryBasin = new THREE.Color("#b99b64");
  const humidGreen = new THREE.Color("#5e875a");
  const plateauCold = new THREE.Color("#b79a74");

  if (elevation < 120) {
    color.lerpColors(coast, lowland, clamp(elevation / 120, 0, 1));
  } else if (elevation < 700) {
    color.lerpColors(lowland, upland, (elevation - 120) / 580);
  } else if (elevation < 1800) {
    color.lerpColors(upland, plateau, (elevation - 700) / 1100);
  } else if (elevation < 3400) {
    color.lerpColors(plateau, alpine, (elevation - 1800) / 1600);
  } else if (elevation < 5000) {
    color.lerpColors(alpine, rock, (elevation - 3400) / 1600);
  } else {
    color.lerpColors(rock, snow, clamp((elevation - 5000) / 1800, 0, 1));
  }

  const west = clamp((104 - lon) / 24, 0, 1);
  const farWest = clamp((96 - lon) / 16, 0, 1);
  const north = clamp((lat - 37) / 11, 0, 1);
  const southEast = clamp((lon - 105) / 18, 0, 1) * clamp((33 - lat) / 13, 0, 1);
  const tibetanPlateau = clamp((elevation - 2600) / 1600, 0, 1) * clamp((101 - lon) / 17, 0, 1);
  const arid = clamp(west * 0.62 + farWest * 0.44 + north * 0.22 - southEast * 0.36, 0, 1);

  color.lerp(desert, arid * clamp(1 - elevation / 5200, 0.08, 0.7));
  color.lerp(dryBasin, farWest * clamp(1 - Math.abs(elevation - 900) / 1300, 0, 0.34));
  color.lerp(plateauCold, tibetanPlateau * 0.26);
  color.lerp(humidGreen, southEast * clamp(1 - elevation / 2800, 0, 0.26));

  return color;
}

function chooseDemTiles(bounds, level) {
  const detail = detailForLevel(level);

  for (let zoom = detail.demZoom; zoom >= detail.minDemZoom; zoom -= 1) {
    const tiles = collectTilesForBounds(bounds, zoom);
    if (tiles.length <= detail.maxTiles || zoom === detail.minDemZoom) {
      return { demZoom: zoom, tiles };
    }
  }

  const demZoom = detail.minDemZoom;
  return { demZoom, tiles: collectTilesForBounds(bounds, demZoom) };
}

function chooseRasterTiles(bounds, level) {
  const detail = detailForLevel(level);

  for (let zoom = detail.rasterZoom; zoom >= detail.minRasterZoom; zoom -= 1) {
    const tiles = collectTilesForBounds(bounds, zoom);
    if (tiles.length <= detail.maxRasterTiles || zoom === detail.minRasterZoom) {
      return { rasterZoom: zoom, tiles };
    }
  }

  const rasterZoom = detail.minRasterZoom;
  return { rasterZoom, tiles: collectTilesForBounds(bounds, rasterZoom) };
}

function tileKey(z, x, y) {
  return `${z}/${x}/${y}`;
}

function sampleTile(tile, px, py) {
  const x0 = clamp(Math.floor(px), 0, tile.width - 1);
  const y0 = clamp(Math.floor(py), 0, tile.height - 1);
  const x1 = clamp(x0 + 1, 0, tile.width - 1);
  const y1 = clamp(y0 + 1, 0, tile.height - 1);
  const tx = clamp(px - x0, 0, 1);
  const ty = clamp(py - y0, 0, 1);
  const a = tile.elevations[y0 * tile.width + x0];
  const b = tile.elevations[y0 * tile.width + x1];
  const c = tile.elevations[y1 * tile.width + x0];
  const d = tile.elevations[y1 * tile.width + x1];

  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function sampleRasterRgb(tile, px, py, out = [0, 0, 0]) {
  const x0 = clamp(Math.floor(px), 0, tile.width - 1);
  const y0 = clamp(Math.floor(py), 0, tile.height - 1);
  const x1 = clamp(x0 + 1, 0, tile.width - 1);
  const y1 = clamp(y0 + 1, 0, tile.height - 1);
  const tx = clamp(px - x0, 0, 1);
  const ty = clamp(py - y0, 0, 1);

  const read = (x, y, channel) => tile.pixels[(y * tile.width + x) * 4 + channel] / 255;
  for (let channel = 0; channel < 3; channel += 1) {
    const a = read(x0, y0, channel);
    const b = read(x1, y0, channel);
    const c = read(x0, y1, channel);
    const d = read(x1, y1, channel);
    out[channel] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }

  return out;
}

function sampleRasterPixel(tile, px, py) {
  const channels = sampleRasterRgb(tile, px, py);
  return new THREE.Color().setRGB(channels[0], channels[1], channels[2], THREE.SRGBColorSpace);
}

export function sampleElevation(lon, lat, zoom, tileMap) {
  const tileFloat = lonLatToTileFloat(lon, lat, zoom);
  const x = Math.floor(tileFloat.x);
  const y = Math.floor(tileFloat.y);
  const tile = tileMap.get(tileKey(zoom, x, y));

  if (!tile) {
    return 0;
  }

  const px = (tileFloat.x - x) * (tile.width - 1);
  const py = (tileFloat.y - y) * (tile.height - 1);
  const elevation = sampleTile(tile, px, py);

  if (!Number.isFinite(elevation) || elevation < NO_DATA_FLOOR) {
    return 0;
  }

  return Math.max(0, elevation);
}

function sampleRasterColor(lon, lat, zoom, tileMap) {
  if (!tileMap?.size) {
    return null;
  }

  const tileFloat = lonLatToTileFloat(lon, lat, zoom);
  const x = Math.floor(tileFloat.x);
  const y = Math.floor(tileFloat.y);
  const tile = tileMap.get(tileKey(zoom, x, y));

  if (!tile) {
    return null;
  }

  const px = (tileFloat.x - x) * (tile.width - 1);
  const py = (tileFloat.y - y) * (tile.height - 1);
  return sampleRasterPixel(tile, px, py);
}

function sampleRasterColorRgb(lon, lat, zoom, tileMap, out) {
  if (!tileMap?.size) {
    return null;
  }

  const tileFloat = lonLatToTileFloat(lon, lat, zoom);
  const x = Math.floor(tileFloat.x);
  const y = Math.floor(tileFloat.y);
  const tile = tileMap.get(tileKey(zoom, x, y));

  if (!tile) {
    return null;
  }

  const px = (tileFloat.x - x) * (tile.width - 1);
  const py = (tileFloat.y - y) * (tile.height - 1);
  return sampleRasterRgb(tile, px, py, out);
}

function sampleRasterRgbByTileFloat(xFloat, yFloat, zoom, tileMap, out) {
  if (!tileMap?.size) {
    return null;
  }

  const x = Math.floor(xFloat);
  const y = Math.floor(yFloat);
  const tile = tileMap.get(tileKey(zoom, x, y));

  if (!tile) {
    return null;
  }

  const px = (xFloat - x) * (tile.width - 1);
  const py = (yFloat - y) * (tile.height - 1);
  return sampleRasterRgb(tile, px, py, out);
}

function prepareMaskFeatures(features) {
  return features.map((feature) => {
    const bounds = feature.__bounds || featureBounds(feature);
    feature.__bounds = bounds;
    return { feature, bounds };
  });
}

function elevationAt(elevations, row, col, cols, rows) {
  const safeRow = clamp(row, 0, rows);
  const safeCol = clamp(col, 0, cols);
  return elevations[safeRow * (cols + 1) + safeCol] || 0;
}

function scaledHeightAt(heights, row, col, cols, rows) {
  const safeRow = clamp(row, 0, rows);
  const safeCol = clamp(col, 0, cols);
  return heights[safeRow * (cols + 1) + safeCol] || 0;
}

function sampleGridElevation(u, v, elevations, cols, rows) {
  const gx = clamp(u * cols, 0, cols);
  const gy = clamp(v * rows, 0, rows);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = clamp(x0 + 1, 0, cols);
  const y1 = clamp(y0 + 1, 0, rows);
  const tx = gx - x0;
  const ty = gy - y0;
  const a = elevationAt(elevations, y0, x0, cols, rows);
  const b = elevationAt(elevations, y0, x1, cols, rows);
  const c = elevationAt(elevations, y1, x0, cols, rows);
  const d = elevationAt(elevations, y1, x1, cols, rows);

  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function gridReliefShade({ u, v, elevation, elevations, cols, rows, size, exaggeration }) {
  const du = 1 / Math.max(cols, 1);
  const dv = 1 / Math.max(rows, 1);
  const west = sampleGridElevation(clamp(u - du, 0, 1), v, elevations, cols, rows);
  const east = sampleGridElevation(clamp(u + du, 0, 1), v, elevations, cols, rows);
  const south = sampleGridElevation(u, clamp(v - dv, 0, 1), elevations, cols, rows);
  const north = sampleGridElevation(u, clamp(v + dv, 0, 1), elevations, cols, rows);
  const dx = Math.max(size.width / cols, 0.0001);
  const dz = Math.max(size.depth / rows, 0.0001);
  const normal = new THREE.Vector3(
    -((east - west) * HEIGHT_SCALE * exaggeration) / (dx * 2),
    1,
    -((north - south) * HEIGHT_SCALE * exaggeration) / (dz * 2),
  ).normalize();
  const direct = clamp(normal.dot(RELIEF_SUN_DIRECTION), 0, 1);
  const neighborAverage = (west + east + south + north) / 4;
  const ridgeValley = clamp((elevation - neighborAverage) / 620, -0.22, 0.22);
  const localRelief = clamp(Math.hypot(east - west, north - south) / 1150, 0, 0.24);

  return clamp(0.62 + direct * 0.55 + ridgeValley * 0.22 - localRelief * 0.16, 0.46, 1.24);
}

function normalizeImageryColor(color, elevation) {
  const adjusted = color.clone();
  const hsl = {};
  adjusted.getHSL(hsl);
  adjusted.setHSL(
    hsl.h,
    clamp(hsl.s * 1.05 + 0.015, 0.06, 0.62),
    clamp(hsl.l * 0.95 + 0.035, 0.16, 0.78),
  );

  if (elevation > 4200) {
    adjusted.lerp(new THREE.Color("#e6e1d1"), clamp((elevation - 4200) / 2600, 0, 0.2));
  }

  return adjusted;
}

function rasterLuma(color) {
  if (!color) {
    return null;
  }

  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}

function buildTerrainTexture({ bounds, size, level, rasterZoom, rasterMap, hillshadeMap, elevations, cols, rows }) {
  if (!elevations.length) {
    return null;
  }

  const detail = detailForLevel(level);
  const width = detail.textureWidth;
  const aspect = size.depth / Math.max(size.width, 0.1);
  const height = Math.round(clamp(width * aspect, 1024, width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: false });
  const imageData = context.createImageData(width, height);
  const pixels = imageData.data;
  const rgb = [0, 0, 0];
  const shadeRgb = [1, 1, 1];
  const imageryBlend = detail.textureBlend;
  const exaggeration = exaggerationForLevel(level);
  const rasterMin = lonLatToTileFloat(bounds.minLon, bounds.minLat, rasterZoom);
  const rasterMax = lonLatToTileFloat(bounds.maxLon, bounds.minLat, rasterZoom);

  for (let y = 0; y < height; y += 1) {
    const rowT = y / Math.max(height - 1, 1);
    const lat = lerp(bounds.maxLat, bounds.minLat, rowT);
    const gridV = 1 - rowT;
    const rasterRow = lonLatToTileFloat(bounds.minLon, lat, rasterZoom);

    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(width - 1, 1);
      const lon = lerp(bounds.minLon, bounds.maxLon, u);
      const elevation = sampleGridElevation(u, gridV, elevations, cols, rows);
      const rasterX = lerp(rasterMin.x, rasterMax.x, u);
      const colorSample = sampleRasterRgbByTileFloat(rasterX, rasterRow.y, rasterZoom, rasterMap, rgb);
      const index = (y * width + x) * 4;
      const terrainBase = terrainColor(elevation, lon, lat);
      const demShade = gridReliefShade({ u, v: gridV, elevation, elevations, cols, rows, size, exaggeration });

      let r = terrainBase.r;
      let g = terrainBase.g;
      let b = terrainBase.b;

      if (colorSample) {
        const imageryLuma = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
        const textureR = imageryLuma + (rgb[0] - imageryLuma) * 0.46;
        const textureG = imageryLuma + (rgb[1] - imageryLuma) * 0.46;
        const textureB = imageryLuma + (rgb[2] - imageryLuma) * 0.46;
        r = lerp(r, textureR, imageryBlend);
        g = lerp(g, textureG, imageryBlend);
        b = lerp(b, textureB, imageryBlend);
      }

      const shadeSample = sampleRasterRgbByTileFloat(rasterX, rasterRow.y, rasterZoom, hillshadeMap, shadeRgb);
      let shade = demShade;
      if (shadeSample) {
        const hillshade = shadeRgb[0] * 0.299 + shadeRgb[1] * 0.587 + shadeRgb[2] * 0.114;
        shade = clamp(demShade * 0.78 + (0.72 + (hillshade - 0.5) * 0.94) * 0.22, 0.42, 1.28);
      }
      r *= shade;
      g *= shade;
      b *= shade;

      if (elevation > 4600) {
        const snow = clamp((elevation - 4600) / 1800, 0, 0.18);
        r = lerp(r, 0.93, snow);
        g = lerp(g, 0.92, snow);
        b = lerp(b, 0.86, snow);
      }

      r = clamp((r - 0.5) * 1.16 + 0.52, 0, 1);
      g = clamp((g - 0.5) * 1.16 + 0.52, 0, 1);
      b = clamp((b - 0.5) * 1.16 + 0.52, 0, 1);

      pixels[index] = Math.round(r * 255);
      pixels[index + 1] = Math.round(g * 255);
      pixels[index + 2] = Math.round(b * 255);
      pixels[index + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return texture;
}

function reliefColor({
  elevation,
  elevations,
  heights,
  row,
  col,
  cols,
  rows,
  lon,
  lat,
  bounds,
  size,
  textureColor,
  hillshadeColor,
  textureBlend,
}) {
  const dx = Math.max(size.width / cols, 0.0001);
  const dz = Math.max(size.depth / rows, 0.0001);
  const left = scaledHeightAt(heights, row, col - 1, cols, rows);
  const right = scaledHeightAt(heights, row, col + 1, cols, rows);
  const north = scaledHeightAt(heights, row + 1, col, cols, rows);
  const south = scaledHeightAt(heights, row - 1, col, cols, rows);
  const normal = new THREE.Vector3(
    -(right - left) / (dx * 2),
    1,
    -(north - south) / (dz * 2),
  ).normalize();

  const direct = clamp(normal.dot(SUN_DIRECTION), 0, 1);
  const elevationDeltaX = elevationAt(elevations, row, col + 1, cols, rows) - elevationAt(elevations, row, col - 1, cols, rows);
  const elevationDeltaZ = elevationAt(elevations, row + 1, col, cols, rows) - elevationAt(elevations, row - 1, col, cols, rows);
  const centerElevation = elevationAt(elevations, row, col, cols, rows);
  const neighborAverage =
    (elevationAt(elevations, row, col - 1, cols, rows) +
      elevationAt(elevations, row, col + 1, cols, rows) +
      elevationAt(elevations, row - 1, col, cols, rows) +
      elevationAt(elevations, row + 1, col, cols, rows)) /
    4;
  const localRelief = clamp(Math.hypot(elevationDeltaX, elevationDeltaZ) / 950, 0, 1);
  const ridgeValley = clamp((centerElevation - neighborAverage) / 520, -0.24, 0.24);
  const basinFade = clamp((lon - bounds.minLon) / Math.max(bounds.maxLon - bounds.minLon, 0.1), 0, 1);
  const terrainBase = terrainColor(elevation, lon, lat);
  const base = textureColor
    ? terrainBase.clone().lerp(normalizeImageryColor(textureColor, elevation), textureBlend)
    : terrainBase;
  const hillshade = rasterLuma(hillshadeColor);
  const rasterShade = hillshade == null ? 0 : (hillshade - 0.58) * 0.72;
  const shade = 0.68 + direct * 0.26 + rasterShade - localRelief * 0.04 + ridgeValley * 0.14 - basinFade * 0.01;
  const color = base.multiplyScalar(clamp(shade, 0.4, 1.22));

  if (direct > 0.62) {
    color.lerp(WARM_LIGHT, (direct - 0.62) * 0.1);
  } else if (direct < 0.24) {
    color.lerp(COOL_SHADE, (0.24 - direct) * 0.22);
  }

  if (elevation > 4700) {
    color.lerp(WARM_LIGHT, clamp((elevation - 4700) / 2600, 0, 0.16));
  }

  return color;
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

export async function buildTerrainSurface({ bounds, size, features, level }) {
  const { demZoom, tiles } = chooseDemTiles(bounds, level);
  const { rasterZoom, tiles: rasterTiles } = chooseRasterTiles(bounds, level);
  const { cols, rows } = gridForLevel(level);
  const [loadedTiles, loadedRasterResults, loadedHillshadeResults] = await Promise.all([
    Promise.all(tiles.map((tile) => loadTerrariumTile(tile))),
    Promise.allSettled(rasterTiles.map((tile) => loadRasterTile(tile, "imagery"))),
    Promise.allSettled(rasterTiles.map((tile) => loadRasterTile(tile, "hillshade"))),
  ]);
  const tileMap = new Map(loadedTiles.map((tile) => [tileKey(tile.z, tile.x, tile.y), tile]));
  const rasterMap = new Map(
    loadedRasterResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => [tileKey(result.value.z, result.value.x, result.value.y), result.value]),
  );
  const hillshadeMap = new Map(
    loadedHillshadeResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => [tileKey(result.value.z, result.value.x, result.value.y), result.value]),
  );
  const imagery = rasterLoadSummary(loadedRasterResults, "imagery");
  const hillshade = rasterLoadSummary(loadedHillshadeResults, "hillshade");
  const maskFeatures = prepareMaskFeatures(features);
  const exaggeration = exaggerationForLevel(level);
  const textureBlend = detailForLevel(level).textureBlend;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const elevations = [];
  const heights = [];
  let cells = 0;
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

  const stride = cols + 1;

  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      const color = reliefColor({
        elevation: elevations[row * stride + col],
        elevations,
        heights,
        row,
        col,
        cols,
        rows,
        lon: lerp(bounds.minLon, bounds.maxLon, col / cols),
        lat: lerp(bounds.minLat, bounds.maxLat, row / rows),
        bounds,
        size,
        textureColor: sampleRasterColor(
          lerp(bounds.minLon, bounds.maxLon, col / cols),
          lerp(bounds.minLat, bounds.maxLat, row / rows),
          rasterZoom,
          rasterMap,
        ),
        hillshadeColor: sampleRasterColor(
          lerp(bounds.minLon, bounds.maxLon, col / cols),
          lerp(bounds.minLat, bounds.maxLat, row / rows),
          rasterZoom,
          hillshadeMap,
        ),
        textureBlend,
      });
      colors.push(color.r, color.g, color.b);
    }
  }

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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const texture = buildTerrainTexture({
    bounds,
    size,
    level,
    rasterZoom,
    rasterMap,
    hillshadeMap,
    elevations,
    cols,
    rows,
  });

  return {
    geometry,
    texture,
    demZoom,
    tiles: tiles.length,
    rasterZoom,
    rasterTiles: rasterMap.size,
    hillshadeTiles: hillshadeMap.size,
    imagery,
    hillshade,
    stats: {
      cells,
      minElevation: Number.isFinite(minElevation) ? Math.round(minElevation) : 0,
      maxElevation: Number.isFinite(maxElevation) ? Math.round(maxElevation) : 0,
    },
    sampleHeight(lon, lat) {
      return sampleElevation(lon, lat, demZoom, tileMap) * HEIGHT_SCALE * exaggeration;
    },
  };
}
