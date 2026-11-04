"use strict";

// ============================================================
// toCanvasPx.js — job: convert normalized event coordinates to canvas pixels plus display size (toCanvasPx).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const toCanvasPx = function (p){
  return {
    px: p.evt.u * p.displaySize,
    py: p.evt.v * p.displaySize,
    ds: p.displaySize
  };
};
