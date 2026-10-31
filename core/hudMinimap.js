"use strict";

// ============================================================
// hudMinimap.js — job: build the minimap panel rect model.
// Owner: core/hud.js. Holds no state unless it is a core.
// ============================================================
(() => {
  // The minimap sits bottom-left of the display square. Pure: input metrics
  // in, plain rect out.
  function buildMinimapModel(input) {
    const DS = input.metrics.displaySize;
    const US = input.metrics.uiScale;
    const mmSize = input.metrics.minimapSize;
    const mmPad = Math.round(10 * US);
    return {
      rect: { x: mmPad, y: DS - mmSize - mmPad, w: mmSize, h: mmSize }
    };
  }

  createHud._register("minimap", {
    buildMinimapModel
  });
})();
