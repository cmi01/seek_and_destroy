"use strict";

// ============================================================
// pixelToCell.js — job: convert a screen pixel to the board cell under the rendered viewport.
// Owner: cameraMath.js (pure). Holds no state.
// ============================================================

// Pixel -> grid cell under the rendered viewport (clamped to the board).
const pixelToCell = function (D, px, py, vp) {
  const gridSize = D.gridSize;
  return {
    x: Math.max(0, Math.min(gridSize - 1, Math.floor(vp.viewX + px / vp.cellPx))),
    y: Math.max(0, Math.min(gridSize - 1, Math.floor(vp.viewY + py / vp.cellPx)))
  };
};
