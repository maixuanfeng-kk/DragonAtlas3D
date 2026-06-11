import { featureCenter } from "./geo.js";

export function normalizeTravelNode(node) {
  if (!node) {
    return null;
  }

  if (node.level === "country") {
    return null;
  }

  if (node.id && node.name) {
    return {
      id: String(node.id),
      name: String(node.name),
      node_type: node.node_type === "poi" ? "poi" : "area",
      center: Array.isArray(node.center) && node.center.length >= 2 ? [Number(node.center[0]), Number(node.center[1])] : null,
    };
  }

  if (node.type === "Feature") {
    const properties = node.properties || {};
    return {
      id: String(properties.adcode || properties.amapId || properties.fullName || properties.name),
      name: String(properties.fullName || properties.name || ""),
      node_type: properties.nodeType === "poi" || properties.level === "poi" ? "poi" : "area",
      center:
        Array.isArray(properties.center) && properties.center.length >= 2
          ? [Number(properties.center[0]), Number(properties.center[1])]
          : null,
    };
  }

  const feature = node.feature;
  const rawNodeType = feature?.properties?.nodeType;
  const center =
    feature?.properties?.center ||
    (feature?.geometry ? featureCenter(feature) : null) ||
    null;

  return {
    id: String(node.adcode || node.fullName || node.name),
    name: node.fullName || node.name,
    node_type: rawNodeType === "area" ? "area" : node.level === "poi" ? "poi" : "area",
    center: Array.isArray(center) && center.length >= 2 ? [Number(center[0]), Number(center[1])] : null,
  };
}

export function addTravelSelection(existing, node) {
  const candidate = normalizeTravelNode(node);
  if (!candidate) {
    return existing;
  }

  const next = [candidate, ...existing.filter((item) => item.id !== candidate.id)];
  return next.slice(0, 5);
}

export function removeTravelSelection(existing, id) {
  return existing.filter((item) => item.id !== id);
}

export function buildTravelRequestPayload({ selectedNodes, tripDays, dayOrNightPreference, interestTags, answers = {} }) {
  const payload = {
    thread_id: "wuhan-travel-agent-mvp",
    current_city: "wuhan",
    selected_nodes: selectedNodes,
    trip_days: tripDays,
    day_or_night_preference: dayOrNightPreference,
    interest_tags: interestTags,
  };

  return Object.keys(answers).length ? { ...payload, answers } : payload;
}
