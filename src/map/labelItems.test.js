import assert from "node:assert/strict";
import test from "node:test";

import { collectSceneLabelItems } from "./labelItems.js";

test("collectSceneLabelItems includes Wuhan travel node labels", () => {
  const travelLabel = { key: "donghu" };
  const items = collectSceneLabelItems({
    labelItems: [{ key: "province" }],
    tributaryRiverLayer: { labels: [] },
    cityDetailLayer: { labels: [] },
    districtDetailLayer: { labels: [] },
    townshipDetailLayer: { labels: [] },
    residentialLayer: { labels: [] },
    travelNodeLayer: { labels: [travelLabel] },
    poiLayer: { labels: [] },
  });

  assert.equal(items.includes(travelLabel), true);
});
