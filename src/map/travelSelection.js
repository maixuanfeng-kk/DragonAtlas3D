import { featureCenter } from "./geo.js";

export function normalizeTravelNode(node) {
  if (!node || node.level === "country") {
    return null;
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
  return next.slice(0, 3);
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
