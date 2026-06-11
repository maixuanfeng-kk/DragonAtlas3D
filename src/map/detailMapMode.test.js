import assert from "node:assert/strict";
import test from "node:test";

import {
  canEnterDetailMapFrom3D,
  createDetailMapViewport,
  detailMapTriggerSpanForLevel,
  shouldResetDetailMapPrompt,
  shouldSuggestDetailMap,
} from "./detailMapMode.js";

test("detailMapTriggerSpanForLevel allows earlier entry from the national 3D homepage", () => {
  assert.equal(detailMapTriggerSpanForLevel("country"), 3.2);
  assert.equal(detailMapTriggerSpanForLevel("province"), 1.2);
  assert.equal(detailMapTriggerSpanForLevel("city"), 0.42);
  assert.equal(detailMapTriggerSpanForLevel("district"), 0.2);
});

test("shouldSuggestDetailMap prompts once the current level reaches its trigger span", () => {
  assert.equal(
    shouldSuggestDetailMap({
      currentNode: { level: "district" },
      span: 0.18,
      hasJsApiKey: true,
      detailMode: false,
      promptDismissed: false,
    }),
    true,
  );

  assert.equal(
    shouldSuggestDetailMap({
      currentNode: { level: "country" },
      span: 2.95,
      hasJsApiKey: true,
      detailMode: false,
      promptDismissed: false,
    }),
    true,
  );

  assert.equal(
    shouldSuggestDetailMap({
      currentNode: { level: "country" },
      span: 4.1,
      hasJsApiKey: true,
      detailMode: false,
      promptDismissed: false,
    }),
    false,
  );

  assert.equal(
    shouldSuggestDetailMap({
      currentNode: { level: "district" },
      span: 0.18,
      hasJsApiKey: false,
      detailMode: false,
      promptDismissed: false,
    }),
    false,
  );
});

test("shouldResetDetailMapPrompt clears dismissal after zooming back out", () => {
  assert.equal(
    shouldResetDetailMapPrompt({
      currentNode: { level: "district" },
      span: 0.34,
      promptDismissed: true,
    }),
    true,
  );

  assert.equal(
    shouldResetDetailMapPrompt({
      currentNode: { level: "country" },
      span: 3.8,
      promptDismissed: true,
    }),
    true,
  );

  assert.equal(
    shouldResetDetailMapPrompt({
      currentNode: { level: "district" },
      span: 0.18,
      promptDismissed: true,
    }),
    false,
  );
});

test("createDetailMapViewport derives center, span, and a street-scale zoom from visible bounds", () => {
  const viewport = createDetailMapViewport({
    currentNode: {
      name: "Hongshan",
      fullName: "Hongshan District",
      level: "district",
    },
    bounds: {
      minLon: 114.27,
      maxLon: 114.35,
      minLat: 30.54,
      maxLat: 30.61,
    },
  });

  assert.deepEqual(viewport.center, [114.31, 30.575]);
  assert.equal(viewport.span, 0.08);
  assert.equal(viewport.zoom, 14);
  assert.equal(viewport.node.fullName, "Hongshan District");
});

test("createDetailMapViewport falls back to the node center when bounds are unavailable", () => {
  const viewport = createDetailMapViewport({
    currentNode: {
      name: "Wuhan",
      fullName: "Wuhan",
      level: "city",
      center: [114.3055, 30.5928],
    },
    bounds: null,
  });

  assert.deepEqual(viewport.center, [114.3055, 30.5928]);
  assert.equal(viewport.span, 0);
  assert.equal(viewport.zoom, 11);
  assert.equal(viewport.node.fullName, "Wuhan");
});

test("canEnterDetailMapFrom3D allows a manual entry button before the zoom prompt threshold", () => {
  assert.equal(
    canEnterDetailMapFrom3D({
      hasJsApiKey: true,
      detailMode: false,
      viewport: {
        center: [114.3055, 30.5928],
        node: { level: "city", fullName: "Wuhan" },
      },
    }),
    true,
  );

  assert.equal(
    canEnterDetailMapFrom3D({
      hasJsApiKey: false,
      detailMode: false,
      viewport: {
        center: [114.3055, 30.5928],
        node: { level: "city", fullName: "Wuhan" },
      },
    }),
    false,
  );
});
