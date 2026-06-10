import * as THREE from "three";
import { clamp } from "./geo.js";

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

export function normalizeImageryColor(color, elevation) {
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
