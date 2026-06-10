import * as THREE from "three";
import { clamp, lerp, lonLatToTileFloat } from "./geo.js";
import { detailForLevel, exaggerationForLevel, HEIGHT_SCALE } from "./terrainConfig.js";
import { terrainColor } from "./terrainColors.js";
import { sampleGridElevation, sampleRasterRgbByTileFloat } from "./terrainSampling.js";

const RELIEF_SUN_DIRECTION = new THREE.Vector3(-0.56, 0.78, -0.28).normalize();

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

export function buildTerrainTexture({ bounds, size, level, rasterZoom, rasterMap, hillshadeMap, elevations, cols, rows }) {
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
        r = lerp(r, imageryLuma + (rgb[0] - imageryLuma) * 0.46, imageryBlend);
        g = lerp(g, imageryLuma + (rgb[1] - imageryLuma) * 0.46, imageryBlend);
        b = lerp(b, imageryLuma + (rgb[2] - imageryLuma) * 0.46, imageryBlend);
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

      pixels[index] = Math.round(clamp((r - 0.5) * 1.16 + 0.52, 0, 1) * 255);
      pixels[index + 1] = Math.round(clamp((g - 0.5) * 1.16 + 0.52, 0, 1) * 255);
      pixels[index + 2] = Math.round(clamp((b - 0.5) * 1.16 + 0.52, 0, 1) * 255);
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
