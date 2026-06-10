import * as THREE from "three";
import { clamp } from "./geo.js";
import { normalizeImageryColor, terrainColor } from "./terrainColors.js";
import { elevationAt, rasterLuma, scaledHeightAt } from "./terrainSampling.js";

const SUN_DIRECTION = new THREE.Vector3(-0.48, 0.72, -0.5).normalize();
const WARM_LIGHT = new THREE.Color("#fff2ce");
const COOL_SHADE = new THREE.Color("#263d46");

export function reliefColor({
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
