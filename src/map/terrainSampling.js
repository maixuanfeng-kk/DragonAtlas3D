import * as THREE from "three";
import { clamp, lerp, lonLatToTileFloat } from "./geo.js";
import { NO_DATA_FLOOR } from "./terrainConfig.js";

export function tileKey(z, x, y) {
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

export function sampleRasterColor(lon, lat, zoom, tileMap) {
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

export function sampleRasterRgbByTileFloat(xFloat, yFloat, zoom, tileMap, out) {
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

export function elevationAt(elevations, row, col, cols, rows) {
  const safeRow = clamp(row, 0, rows);
  const safeCol = clamp(col, 0, cols);
  return elevations[safeRow * (cols + 1) + safeCol] || 0;
}

export function scaledHeightAt(heights, row, col, cols, rows) {
  const safeRow = clamp(row, 0, rows);
  const safeCol = clamp(col, 0, cols);
  return heights[safeRow * (cols + 1) + safeCol] || 0;
}

export function sampleGridElevation(u, v, elevations, cols, rows) {
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

export function rasterLuma(color) {
  if (!color) {
    return null;
  }

  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}
