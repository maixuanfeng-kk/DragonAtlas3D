const API_BASE = import.meta.env.VITE_TRAVEL_AGENT_API_BASE || "http://127.0.0.1:8000/api";

export async function fetchCityPoiRecommendations({ city = "wuhan", mappedOnly = true } = {}) {
  const url = new URL(`${API_BASE}/poi`);
  url.searchParams.set("city", city);
  url.searchParams.set("mapped_only", mappedOnly ? "true" : "false");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`POI catalog request failed: ${response.status}`);
  }

  return response.json();
}
