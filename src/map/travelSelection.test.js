import assert from "node:assert/strict";
import test from "node:test";

import { addTravelSelection, normalizeTravelNode } from "./travelSelection.js";

test("normalizeTravelNode accepts mapped recommendation rows", () => {
  const node = normalizeTravelNode({
    id: "yellow-crane-tower",
    name: "Yellow Crane Tower",
    node_type: "poi",
    center: [114.306, 30.547],
  });

  assert.deepEqual(node, {
    id: "yellow-crane-tower",
    name: "Yellow Crane Tower",
    node_type: "poi",
    center: [114.306, 30.547],
  });
});

test("addTravelSelection accepts amap feature search results", () => {
  const selection = addTravelSelection([], {
    type: "Feature",
    properties: {
      adcode: "B0FFG92M5N",
      name: "Tanhualin",
      fullName: "Tanhualin",
      center: [114.314, 30.558],
      nodeType: "poi",
      level: "poi",
    },
    geometry: null,
  });

  assert.equal(selection.length, 1);
  assert.equal(selection[0].name, "Tanhualin");
  assert.equal(selection[0].node_type, "poi");
});
