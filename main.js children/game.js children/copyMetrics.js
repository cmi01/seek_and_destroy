"use strict";

// ============================================================
// copyMetrics.js — job: a fresh plain copy of the live layout metrics (copyMetrics).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const copyMetrics = function (m){
  if (!m) return null;
  return {
    displaySize: m.displaySize,
    viewportWidth: m.viewportWidth,
    viewportHeight: m.viewportHeight,
    isWidescreen: m.isWidescreen,
    renderScale: m.renderScale,
    devicePx: m.devicePx,
    cellPx: m.cellPx,
    fontScale: m.fontScale,
    textScale: m.textScale,
    uiScale: m.uiScale,
    minimapSize: m.minimapSize,
    minimapCanvasSize: m.minimapCanvasSize,
    minimapDevicePx: m.minimapDevicePx,
    ui: m.ui
  };
};
