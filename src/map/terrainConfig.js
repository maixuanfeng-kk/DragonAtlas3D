import { collectTilesForBounds } from "./geo.js";

export const NO_DATA_FLOOR = -11000;
export const HEIGHT_SCALE = 0.00043;

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

export function detailForLevel(level) {
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

export function chooseDemTiles(bounds, level) {
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

export function chooseRasterTiles(bounds, level) {
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
