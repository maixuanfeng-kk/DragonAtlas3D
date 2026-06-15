import assert from "node:assert/strict";
import test from "node:test";

import { withTimeout } from "./amapDetailMap.js";

test("withTimeout rejects a hung Amap loader promise with the provided message", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, "Amap detail map timed out."),
    /Amap detail map timed out\./,
  );
});

test("withTimeout returns the resolved loader value before the timeout", async () => {
  const result = await withTimeout(Promise.resolve("ready"), 50, "should not time out");
  assert.equal(result, "ready");
});
