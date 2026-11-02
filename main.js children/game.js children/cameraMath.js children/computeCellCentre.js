"use strict";

// ============================================================
// computeCellCentre.js — job: convert a board cell to its pixel centre.
// Owner: cameraMath.js (pure). Holds no state.
// ============================================================

// Grid cell -> pixel centre of that cell.
const computeCellCentre = function (gx, gy, cellPx) {
  return { x: (gx + 0.5) * cellPx, y: (gy + 0.5) * cellPx };
};
