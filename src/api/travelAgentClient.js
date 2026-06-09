const API_BASE = import.meta.env.VITE_TRAVEL_AGENT_API_BASE || "http://127.0.0.1:8000/api";

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Travel agent request failed: ${response.status}`);
  }

  return response.json();
}

export function postTravelClarify(payload) {
  return postJson("/travel/clarify", payload);
}

export function postTravelPlan(payload) {
  return postJson("/travel/plan", payload);
}
