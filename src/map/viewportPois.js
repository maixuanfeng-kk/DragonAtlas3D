const VIEWPORT_POI_MAX_SPAN = 0.55;

export const VIEWPORT_POI_CATEGORIES = [
  {
    id: "scenic",
    label: "景点",
    amapTypes: "110000",
    pageSize: 10,
    limit: 4,
  },
  {
    id: "hotel",
    label: "酒店",
    amapTypes: "100000",
    pageSize: 10,
    limit: 4,
  },
  {
    id: "station",
    label: "车站",
    amapTypes: "150000",
    pageSize: 10,
    limit: 4,
  },
  {
    id: "business",
    label: "商圈",
    amapTypes: "060000",
    pageSize: 12,
    limit: 3,
  },
];

const TRANSPORT_HUB_NAME = /(站|机场|码头|客运|枢纽|地铁|轻轨|高铁|火车)/;
const NON_HUB_NAME = /(停车|充电|加油|收费|测速|服务区|桥|路口|通道)/;

function ratingValue(feature) {
  const value = Number.parseFloat(String(feature?.properties?.rating || ""));
  return Number.isFinite(value) ? value : 0;
}

function representativeKey(feature) {
  return String(feature?.properties?.fullName || feature?.properties?.name || "")
    .trim()
    .toLowerCase();
}

function compareRepresentativeFeatures(left, right) {
  const leftGeometry = left?.properties?.geometryStatus === "ready" ? 1 : 0;
  const rightGeometry = right?.properties?.geometryStatus === "ready" ? 1 : 0;
  if (leftGeometry !== rightGeometry) {
    return rightGeometry - leftGeometry;
  }

  const ratingDelta = ratingValue(right) - ratingValue(left);
  if (ratingDelta !== 0) {
    return ratingDelta;
  }

  const leftName = String(left?.properties?.fullName || left?.properties?.name || "");
  const rightName = String(right?.properties?.fullName || right?.properties?.name || "");
  return leftName.localeCompare(rightName, "zh-CN");
}

function averageCenter(features) {
  if (!features.length) {
    return [0, 0];
  }

  const total = features.reduce(
    (sum, feature) => {
      const [lon, lat] = feature.properties?.center || [0, 0];
      return {
        lon: sum.lon + lon,
        lat: sum.lat + lat,
      };
    },
    { lon: 0, lat: 0 },
  );

  return [
    Number((total.lon / features.length).toFixed(6)),
    Number((total.lat / features.length).toFixed(6)),
  ];
}

export function shouldLoadViewportPois({ span }) {
  return Number.isFinite(span) && span > 0 && span <= VIEWPORT_POI_MAX_SPAN;
}

export function takeRepresentativeFeatures(features, limit = 4) {
  if (!Array.isArray(features) || limit <= 0) {
    return [];
  }

  const deduped = new Map();
  features.forEach((feature) => {
    const key = representativeKey(feature);
    if (!key) {
      return;
    }

    const current = deduped.get(key);
    if (!current || compareRepresentativeFeatures(current, feature) > 0) {
      deduped.set(key, feature);
    }
  });

  return [...deduped.values()].sort(compareRepresentativeFeatures).slice(0, limit);
}

export function filterTransportHubFeatures(features) {
  return takeRepresentativeFeatures(
    (features || []).filter((feature) => {
      const name = String(feature?.properties?.fullName || feature?.properties?.name || "");
      return TRANSPORT_HUB_NAME.test(name) && !NON_HUB_NAME.test(name);
    }),
    4,
  );
}

export function buildBusinessAreaFeatures(features, limit = 3) {
  if (!Array.isArray(features) || limit <= 0) {
    return [];
  }

  const groups = new Map();
  features.forEach((feature) => {
    const area = String(feature?.properties?.businessArea || "").trim();
    if (!area) {
      return;
    }

    const existing = groups.get(area) || [];
    existing.push(feature);
    groups.set(area, existing);
  });

  return [...groups.entries()]
    .map(([businessArea, group]) => {
      const representative = takeRepresentativeFeatures(group, 1)[0];
      if (!representative) {
        return null;
      }

      return {
        type: "Feature",
        properties: {
          ...representative.properties,
          adcode: representative.properties?.adcode || businessArea,
          amapId: `business:${businessArea}`,
          name: businessArea,
          shortName: businessArea,
          fullName: businessArea,
          center: averageCenter(group),
          geometryStatus: "point-only",
          categoryId: "business",
          categoryLabel: "商圈",
          businessArea,
          memberCount: group.length,
        },
        geometry: null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const countDelta = (right.properties?.memberCount || 0) - (left.properties?.memberCount || 0);
      if (countDelta !== 0) {
        return countDelta;
      }

      return compareRepresentativeFeatures(left, right);
    })
    .slice(0, limit);
}

export function summarizeViewportPoiCategories(categoryCounts = {}) {
  return VIEWPORT_POI_CATEGORIES.map((category) => `${category.label}${categoryCounts[category.id] || 0}`).join(" / ");
}
