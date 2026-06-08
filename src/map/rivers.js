import * as THREE from "three";
import { clamp, projectLonLat } from "./geo.js";

const STYLE = {
  major: {
    color: "#1f7d91",
    edgeColor: "#cceef4",
    opacity: 0.16,
    edgeOpacity: 0.018,
    heightOffset: 0.062,
    maxPoints: 260,
    minWidth: 0.0017,
    maxWidth: 0.0052,
  },
  tributary: {
    color: "#2f8fa0",
    edgeColor: "#d7f4f7",
    opacity: 0.075,
    edgeOpacity: 0,
    heightOffset: 0.066,
    maxPoints: 130,
    minWidth: 0.0005,
    maxWidth: 0.00155,
  },
};

function geometryToLines(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }

  return [];
}

function lineBounds(line) {
  return line.reduce(
    (box, point) => ({
      minLon: Math.min(box.minLon, point[0]),
      maxLon: Math.max(box.maxLon, point[0]),
      minLat: Math.min(box.minLat, point[1]),
      maxLat: Math.max(box.maxLat, point[1]),
    }),
    {
      minLon: Infinity,
      maxLon: -Infinity,
      minLat: Infinity,
      maxLat: -Infinity,
    },
  );
}

function boundsIntersect(a, b, pad = 0.1) {
  return !(
    a.maxLon < b.minLon - pad ||
    a.minLon > b.maxLon + pad ||
    a.maxLat < b.minLat - pad ||
    a.minLat > b.maxLat + pad
  );
}

function featureLineBounds(feature) {
  const cached = feature.__riverBounds;
  if (cached) {
    return cached;
  }

  const bounds = geometryToLines(feature.geometry)
    .map(lineBounds)
    .reduce(
      (box, next) => ({
        minLon: Math.min(box.minLon, next.minLon),
        maxLon: Math.max(box.maxLon, next.maxLon),
        minLat: Math.min(box.minLat, next.minLat),
        maxLat: Math.max(box.maxLat, next.maxLat),
      }),
      {
        minLon: Infinity,
        maxLon: -Infinity,
        minLat: Infinity,
        maxLat: -Infinity,
      },
    );

  feature.__riverBounds = bounds;
  return bounds;
}

function thinLine(line, maxPoints) {
  if (!line || line.length <= maxPoints) {
    return line || [];
  }

  const step = Math.ceil(line.length / maxPoints);
  const next = [];

  for (let i = 0; i < line.length; i += step) {
    next.push(line[i]);
  }

  next.push(line[line.length - 1]);
  return next;
}

function lineLength(line) {
  let length = 0;

  for (let index = 1; index < line.length; index += 1) {
    const [lonA, latA] = line[index - 1];
    const [lonB, latB] = line[index];
    const scale = Math.cos((((latA + latB) / 2) * Math.PI) / 180);
    length += Math.hypot((lonB - lonA) * scale, latB - latA);
  }

  return length;
}

function widthForFeature(feature, kind) {
  const style = STYLE[kind] || STYLE.tributary;
  const rank = Number(feature.properties?.scalerank || 9);
  const length = Number(feature.properties?.length || 0);
  const rankWeight = clamp((9 - rank) / 8, 0, 1);
  const lengthWeight = clamp(length / (kind === "major" ? 18 : 7), 0, 1);
  const weight = kind === "major" ? Math.max(rankWeight * 0.45, lengthWeight * 0.42) : Math.max(rankWeight * 0.22, lengthWeight * 0.18);
  return style.minWidth + (style.maxWidth - style.minWidth) * weight;
}

function widthScaleForBounds(bounds) {
  const lonSpan = Math.max(0.1, bounds.maxLon - bounds.minLon);
  const latSpan = Math.max(0.1, bounds.maxLat - bounds.minLat);
  return clamp(Math.max(lonSpan, latSpan) / 18, 0.24, 1);
}

function createRibbonGeometry({ line, bounds, size, sampleHeight, width, heightOffset }) {
  const centers = line
    .filter((point) => point?.length >= 2)
    .map(([lon, lat]) => {
      const height = sampleHeight(lon, lat) + heightOffset;
      return {
        lon,
        lat,
        vector: new THREE.Vector3(...projectLonLat(lon, lat, bounds, size, height)),
      };
    });

  if (centers.length < 2) {
    return null;
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  const halfWidth = width / 2;

  centers.forEach((item, index) => {
    const previous = centers[Math.max(0, index - 1)].vector;
    const next = centers[Math.min(centers.length - 1, index + 1)].vector;
    const tangent = next.clone().sub(previous);

    if (tangent.lengthSq() < 0.000001 && index > 0) {
      tangent.copy(item.vector).sub(centers[index - 1].vector);
    }

    if (tangent.lengthSq() < 0.000001) {
      tangent.set(1, 0, 0);
    }

    tangent.y = 0;
    tangent.normalize();

    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(halfWidth);
    const left = item.vector.clone().add(normal);
    const right = item.vector.clone().sub(normal);

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(index / Math.max(centers.length - 1, 1), 0, index / Math.max(centers.length - 1, 1), 1);
  });

  for (let index = 0; index < centers.length - 1; index += 1) {
    const a = index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRiverMaterial(style, edge = false) {
  return new THREE.MeshBasicMaterial({
    color: edge ? style.edgeColor : style.color,
    transparent: true,
    opacity: edge ? style.edgeOpacity : style.opacity,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
}

function lineMidpoint(line) {
  const total = lineLength(line);
  const target = total / 2;
  let distance = 0;

  for (let index = 1; index < line.length; index += 1) {
    const segment = lineLength([line[index - 1], line[index]]);
    if (distance + segment >= target) {
      const ratio = segment > 0 ? (target - distance) / segment : 0;
      return [
        line[index - 1][0] + (line[index][0] - line[index - 1][0]) * ratio,
        line[index - 1][1] + (line[index][1] - line[index - 1][1]) * ratio,
      ];
    }
    distance += segment;
  }

  return line[Math.floor(line.length / 2)] || null;
}

export function filterRiverFeatures({ geojson, bounds, provinceAdcode, kind = "major", maxFeatures = 160, targetZoom = Infinity }) {
  const features = geojson?.features || [];
  const selected = features.filter((feature) => {
    const minZoom = Number(feature.properties?.min_zoom || 0);
    if (targetZoom < minZoom) {
      return false;
    }

    if (provinceAdcode) {
      const provinceAdcodes = feature.properties?.provinceAdcodes || [];
      if (!provinceAdcodes.includes(String(provinceAdcode))) {
        return false;
      }
    }

    return boundsIntersect(featureLineBounds(feature), bounds, kind === "major" ? 0.2 : 0.08);
  });

  return selected
    .sort((a, b) => {
      const aRank = Number(a.properties?.scalerank || 99);
      const bRank = Number(b.properties?.scalerank || 99);
      if (aRank !== bRank) {
        return aRank - bRank;
      }

      return Number(b.properties?.length || 0) - Number(a.properties?.length || 0);
    })
    .slice(0, maxFeatures);
}

export function createRiverGroup({ features, bounds, size, sampleHeight, kind = "major" }) {
  const style = STYLE[kind] || STYLE.tributary;
  const group = new THREE.Group();
  const riverMaterial = createRiverMaterial(style);
  const edgeMaterial = createRiverMaterial(style, true);
  const widthScale = widthScaleForBounds(bounds) * (kind === "major" ? 1 : 0.82);

  features.forEach((feature) => {
    const width = widthForFeature(feature, kind) * widthScale;

    geometryToLines(feature.geometry).forEach((rawLine) => {
      const line = thinLine(rawLine, style.maxPoints);
      if (line.length < 2 || !boundsIntersect(lineBounds(line), bounds, 0.04)) {
        return;
      }

      const edgeGeometry = createRibbonGeometry({
        line,
        bounds,
        size,
        sampleHeight,
        width: width * (kind === "major" ? 1.45 : 1.25),
        heightOffset: style.heightOffset - 0.006,
      });
      const geometry = createRibbonGeometry({
        line,
        bounds,
        size,
        sampleHeight,
        width,
        heightOffset: style.heightOffset,
      });

      if (edgeGeometry) {
        if (style.edgeOpacity > 0.001) {
          const mesh = new THREE.Mesh(edgeGeometry, edgeMaterial);
          mesh.renderOrder = kind === "major" ? 0.8 : 0.6;
          group.add(mesh);
        }
      }

      if (geometry) {
        const mesh = new THREE.Mesh(geometry, riverMaterial);
        mesh.renderOrder = kind === "major" ? 0.9 : 0.7;
        group.add(mesh);
      }
    });
  });

  return group;
}

export function buildRiverLabels({ features, bounds, kind = "major", maxLabels = 18 }) {
  if (kind !== "major" || maxLabels <= 0) {
    return [];
  }

  return features
    .filter((feature) => {
      const name = feature.properties?.name || "";
      if (!name || feature.properties?.name_en === "Unnamed") {
        return false;
      }

      const rank = Number(feature.properties?.scalerank || 99);
      const length = Number(feature.properties?.length || 0);
      return rank <= 3 && length >= 5.2;
    })
    .slice(0, maxLabels)
    .map((feature) => {
      const longest = geometryToLines(feature.geometry)
        .slice()
        .sort((a, b) => lineLength(b) - lineLength(a))[0];
      const center = longest ? lineMidpoint(longest) : null;

      return center
        ? {
            key: `river-${feature.properties?.id || feature.properties?.name}`,
            type: "river",
            text: feature.properties?.name,
            center,
            minZoom: 2.2,
            offset: [0, -8],
          }
        : null;
    })
    .filter((label) => {
      if (!label) {
        return false;
      }

      const [lon, lat] = label.center;
      return lon >= bounds.minLon && lon <= bounds.maxLon && lat >= bounds.minLat && lat <= bounds.maxLat;
    });
}
