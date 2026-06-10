import assert from "node:assert/strict";
import test from "node:test";

import {
  viewportPoiSuppressedNote,
  shouldRenderViewportPoiLayer,
} from "./viewportPoiPolicy.js";

test("shouldRenderViewportPoiLayer disables the old 3D POI rings when detail-map mode is the primary fine-detail path", () => {
  assert.equal(
    shouldRenderViewportPoiLayer({
      hasAmapWebKey: true,
      span: 0.24,
      preferDetailMap: true,
    }),
    false,
  );

  assert.equal(
    shouldRenderViewportPoiLayer({
      hasAmapWebKey: true,
      span: 0.24,
      preferDetailMap: false,
    }),
    true,
  );
});

test("viewportPoiSuppressedNote explains that fine POIs moved into the Amap detail map", () => {
  assert.match(viewportPoiSuppressedNote(), /高德细节图/);
  assert.match(viewportPoiSuppressedNote(), /3D 模式/);
});
