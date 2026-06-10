import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDestinationQuery } from "./searchQuery.js";

test("normalizeDestinationQuery prefers the submitted form value", () => {
  assert.equal(normalizeDestinationQuery(" 四川 ", ""), "四川");
});

test("normalizeDestinationQuery falls back to the controlled state value", () => {
  assert.equal(normalizeDestinationQuery("", "云南"), "云南");
});

test("normalizeDestinationQuery returns an empty string when neither source is usable", () => {
  assert.equal(normalizeDestinationQuery(null, "  "), "");
});
