export const CHINA_BOUNDS = {
  minLon: 73,
  maxLon: 135.5,
  minLat: 3,
  maxLat: 54.5,
};

export const WORLD_LIMITS = {
  minLon: -180,
  maxLon: 180,
  minLat: -85.05112878,
  maxLat: 85.05112878,
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function computeWorldSize(bounds) {
  const centerLat = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
  const widthDegrees = Math.max(0.1, (bounds.maxLon - bounds.minLon) * Math.cos(centerLat));
  const heightDegrees = Math.max(0.1, bounds.maxLat - bounds.minLat);
  const aspect = widthDegrees / heightDegrees;
  const maxWidth = 25;
  const maxDepth = 20.6;

  if (aspect >= maxWidth / maxDepth) {
    return {
      width: maxWidth,
      depth: clamp(maxWidth / aspect, 7.5, maxDepth),
    };
  }

  return {
    width: clamp(maxDepth * aspect, 7.5, maxWidth),
    depth: maxDepth,
  };
}

export function projectLonLat(lon, lat, bounds, size, height = 0) {
  const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon) - 0.5) * size.width;
  const z = -(((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat) - 0.5) * size.depth);
  return [x, height, z];
}

export function unprojectMapPoint(x, z, bounds, size) {
  const lon = (x / size.width + 0.5) * (bounds.maxLon - bounds.minLon) + bounds.minLon;
  const lat = (-z / size.depth + 0.5) * (bounds.maxLat - bounds.minLat) + bounds.minLat;
  return [lon, lat];
}

export function lonLatToTileFloat(lon, lat, zoom) {
  const safeLat = clamp(lat, WORLD_LIMITS.minLat, WORLD_LIMITS.maxLat);
  const n = 2 ** zoom;
  const latRad = (safeLat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  return { x, y };
}

export function collectTilesForBounds(bounds, zoom) {
  const n = 2 ** zoom;
  const nw = lonLatToTileFloat(bounds.minLon, bounds.maxLat, zoom);
  const se = lonLatToTileFloat(bounds.maxLon, bounds.minLat, zoom);
  const minX = clamp(Math.floor(nw.x), 0, n - 1);
  const maxX = clamp(Math.floor(se.x), 0, n - 1);
  const minY = clamp(Math.floor(nw.y), 0, n - 1);
  const maxY = clamp(Math.floor(se.y), 0, n - 1);
  const tiles = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({ z: zoom, x, y, key: `${zoom}/${x}/${y}` });
    }
  }

  return tiles;
}

export function thinRing(ring, maxPoints = 420) {
  if (!ring || ring.length <= maxPoints) {
    return ring || [];
  }

  const step = Math.ceil(ring.length / maxPoints);
  const next = [];

  for (let i = 0; i < ring.length; i += step) {
    next.push(ring[i]);
  }

  next.push(ring[ring.length - 1]);
  return next;
}

export function geometryToPolygons(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }

  return [];
}

export function ringBounds(ring) {
  return ring.reduce(
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

export function featureBounds(feature) {
  const rings = geometryToPolygons(feature.geometry).map((polygon) => polygon[0]).filter(Boolean);
  return rings.reduce(
    (box, ring) => {
      const next = ringBounds(ring);
      return {
        minLon: Math.min(box.minLon, next.minLon),
        maxLon: Math.max(box.maxLon, next.maxLon),
        minLat: Math.min(box.minLat, next.minLat),
        maxLat: Math.max(box.maxLat, next.maxLat),
      };
    },
    {
      minLon: Infinity,
      maxLon: -Infinity,
      minLat: Infinity,
      maxLat: -Infinity,
    },
  );
}

export function mergeBounds(boundsList) {
  return boundsList.reduce(
    (box, bounds) => ({
      minLon: Math.min(box.minLon, bounds.minLon),
      maxLon: Math.max(box.maxLon, bounds.maxLon),
      minLat: Math.min(box.minLat, bounds.minLat),
      maxLat: Math.max(box.maxLat, bounds.maxLat),
    }),
    {
      minLon: Infinity,
      maxLon: -Infinity,
      minLat: Infinity,
      maxLat: -Infinity,
    },
  );
}

export function padBounds(bounds, ratio = 0.12) {
  const lonPad = Math.max(0.15, (bounds.maxLon - bounds.minLon) * ratio);
  const latPad = Math.max(0.15, (bounds.maxLat - bounds.minLat) * ratio);

  return {
    minLon: Math.max(CHINA_BOUNDS.minLon, bounds.minLon - lonPad),
    maxLon: Math.min(CHINA_BOUNDS.maxLon, bounds.maxLon + lonPad),
    minLat: Math.max(CHINA_BOUNDS.minLat, bounds.minLat - latPad),
    maxLat: Math.min(CHINA_BOUNDS.maxLat, bounds.maxLat + latPad),
  };
}

export function pointInRing(lon, lat, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function pointInFeature(lon, lat, feature) {
  return geometryToPolygons(feature.geometry).some((polygon) => {
    const outer = polygon[0];
    if (!outer || !pointInRing(lon, lat, outer)) {
      return false;
    }

    return !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
  });
}

export function findFeatureAt(lon, lat, features) {
  return features.find((feature) => {
    if (!feature.properties?.name) {
      return false;
    }

    const bounds = feature.__bounds || featureBounds(feature);
    feature.__bounds = bounds;

    if (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat) {
      return false;
    }

    return pointInFeature(lon, lat, feature);
  });
}

export function featureCenter(feature) {
  const { center, centroid } = feature.properties || {};
  const point = centroid || center;
  if (Array.isArray(point) && point.length >= 2) {
    return point;
  }

  const bounds = feature.__bounds || featureBounds(feature);
  feature.__bounds = bounds;
  return [(bounds.minLon + bounds.maxLon) / 2, (bounds.minLat + bounds.maxLat) / 2];
}
