import assert from "node:assert/strict";
import test from "node:test";

import { buildDetailMapOverlayModel, normalizePlanDays, selectDayFromPlan } from "./detailMapItineraryModel.js";

test("normalizePlanDays returns a selected active day with stop and leg ids", () => {
  const result = normalizePlanDays({
    itinerary: {
      days: [
        {
          day: 1,
          stops: [{ stop_id: "jianghan-road" }, { stop_id: "yellow-crane-tower" }],
          legs: [{ leg_id: "jianghan-road:yellow-crane-tower:walking" }],
        },
      ],
    },
  });

  assert.equal(result.activeDay, 1);
  assert.equal(result.days[0].stops[0].stop_id, "jianghan-road");
  assert.equal(result.days[0].legs[0].leg_id, "jianghan-road:yellow-crane-tower:walking");
});

test("selectDayFromPlan falls back to the first returned day", () => {
  const next = selectDayFromPlan({
    requestedDay: 3,
    days: [{ day: 1 }, { day: 2 }],
  });

  assert.equal(next, 1);
});

test("buildDetailMapOverlayModel returns numbered stop markers and leg labels", () => {
  const overlay = buildDetailMapOverlayModel({
    activeDay: 1,
    days: [
      {
        day: 1,
        stops: [{ stop_id: "a", name: "A", center: [114.1, 30.1], arrival_time: "09:30", departure_time: "10:30" }],
        legs: [{ leg_id: "a:b:walking", from_stop_id: "a", to_stop_id: "b", mode_label: "Walking", duration_minutes: 18, polyline: [[114.1, 30.1], [114.2, 30.2]], status: "ready" }],
      },
    ],
  });

  assert.equal(overlay.markers[0].indexLabel, "1");
  assert.equal(overlay.legs[0].label, "Walking 18 min");
});

test("buildDetailMapOverlayModel omits fake geometry for failed legs", () => {
  const overlay = buildDetailMapOverlayModel({
    activeDay: 1,
    days: [
      {
        day: 1,
        stops: [],
        legs: [{ leg_id: "a:b:transit", from_stop_id: "a", to_stop_id: "b", mode_label: "Transit", status: "failed", polyline: [] }],
      },
    ],
  });

  assert.equal(overlay.legs[0].status, "failed");
  assert.deepEqual(overlay.legs[0].polyline, []);
});
