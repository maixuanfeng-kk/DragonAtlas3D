import assert from "node:assert/strict";
import test from "node:test";

import { buildLocationReveal, buildPoiReveal } from "../components/heroCopy.js";
import { districtToNode, pickDistrictCandidate } from "./adminSearch.js";

test("pickDistrictCandidate prefers province and city over street results", () => {
  const candidate = pickDistrictCandidate([
    {
      name: "武侯街道",
      adcode: "510107",
      level: "street",
    },
    {
      name: "成都市",
      adcode: "510100",
      level: "city",
      center: "104.066541,30.572269",
    },
  ]);

  assert.equal(candidate?.name, "成都市");
  assert.equal(candidate?.level, "city");
});

test("districtToNode keeps the administrative metadata needed for scene navigation", () => {
  const node = districtToNode({
    name: "云南省",
    adcode: "530000",
    level: "province",
    center: "102.710002,25.045806",
  });

  assert.deepEqual(node, {
    name: "云南",
    fullName: "云南省",
    adcode: "530000",
    level: "province",
    center: [102.710002, 25.045806],
  });
});

test("buildLocationReveal creates a minimal destination card before the camera advances", () => {
  const reveal = buildLocationReveal({
    node: {
      name: "成都",
      fullName: "成都市",
      adcode: "510100",
      level: "city",
    },
    sourceLabel: "高德行政区查询",
  });

  assert.equal(reveal.eyebrow, "地点探索");
  assert.equal(reveal.title, "成都市");
  assert.equal(reveal.meta[0], "城市视角");
  assert.match(reveal.meta[1], /四川/);
  assert.match(reveal.caption, /高德行政区查询/);
});

test("buildPoiReveal describes viewport POI cards with category and source context", () => {
  const reveal = buildPoiReveal({
    feature: {
      properties: {
        fullName: "成都东站",
        categoryLabel: "车站",
        businessArea: "东客站",
        provider: "高德视口精细地点层",
        geometryStatus: "point-only",
      },
    },
  });

  assert.equal(reveal.eyebrow, "高德精细地点");
  assert.equal(reveal.title, "成都东站");
  assert.equal(reveal.meta[0], "车站");
  assert.match(reveal.meta[1], /东客站/);
  assert.match(reveal.caption, /仅有点位/);
});
