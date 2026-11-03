"use strict";

// ============================================================
// hudMinimap.js — job: build the minimap panel rect model.
// Owner: hud.js. Holds no state unless it is a core.
// ============================================================

// The minimap sits bottom-left of the display square. Pure: input metrics
// in, plain rect out. This file is just this one function; the composing
// parent captures the binding when it loads the file.
function buildMinimapModel(input) {
  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const mmSize = (input.metrics.ui && input.metrics.ui.minimap) || input.metrics.minimapSize;
  const mmPad = (input.metrics.ui && input.metrics.ui.padSm) || Math.round(10 * US);
  return {
    rect: { x: mmPad, y: DS - mmSize - mmPad, w: mmSize, h: mmSize }
  };
}
