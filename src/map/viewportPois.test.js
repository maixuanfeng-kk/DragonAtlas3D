import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBusinessAreaFeatures,
  shouldLoadViewportPois,
  takeRepresentativeFeatures,
} from "./viewportPois.js";

function createFeature({
  name,
  center = [114.3, 30.5],
  geometryStatus = "point-only",
  rating = "",
  businessArea = "",
  categoryId = "scenic",
}) {
  return {
    type: "Feature",
    properties: {
      adcode: `${name}-adcode`,
      amapId: `${name}-id`,
      name,
      shortName: name,
      fullName: name,
      center,
      geometryStatus,
      rating,
      businessArea,
      categoryId,
      categoryLabel: categoryId,
    },
    geometry: geometryStatus === "ready" ? { type: "Polygon", coordinates: [] } : null,
  };
}

test("shouldLoadViewportPois only enables viewport POIs for focused views", () => {
  assert.equal(shouldLoadViewportPois({ span: 0.55 }), true);
  assert.equal(shouldLoadViewportPois({ span: 1.35 }), false);
  assert.equal(shouldLoadViewportPois({ span: Number.NaN }), false);
});

test("takeRepresentativeFeatures prioritizes AOI and higher-rated POIs while deduping names", () => {
  const features = [
    createFeature({ name: "黄鹤楼", geometryStatus: "point-only", rating: "4.2" }),
    createFeature({ name: "黄鹤楼", geometryStatus: "ready", rating: "4.8" }),
    createFeature({ name: "东湖景区", geometryStatus: "ready", rating: "4.5" }),
    createFeature({ name: "晴川阁", geometryStatus: "point-only", rating: "4.9" }),
  ];

  const picked = takeRepresentativeFeatures(features, 3);

  assert.deepEqual(
    picked.map((item) => item.properties.fullName),
    ["黄鹤楼", "东湖景区", "晴川阁"],
  );
  assert.equal(picked[0].properties.geometryStatus, "ready");
});

test("buildBusinessAreaFeatures groups by business area and keeps representative centers", () => {
  const features = [
    createFeature({ name: "武商MALL", center: [114.29, 30.58], businessArea: "武广商圈", categoryId: "business" }),
    createFeature({ name: "K11", center: [114.31, 30.59], businessArea: "武广商圈", categoryId: "business" }),
    createFeature({ name: "楚河汉街", center: [114.34, 30.56], businessArea: "楚河汉街", categoryId: "business" }),
  ];

  const businessAreas = buildBusinessAreaFeatures(features, 4);

  assert.equal(businessAreas.length, 2);
  assert.equal(businessAreas[0].properties.fullName, "武广商圈");
  assert.deepEqual(businessAreas[0].properties.center, [114.3, 30.585]);
  assert.equal(businessAreas[0].properties.categoryId, "business");
});
