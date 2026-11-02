"use strict";

// ============================================================
// clampViewportToBoard.js — job: clamp the viewport span and origin to the board bounds.
// Owner: cameraMath.js (pure). Holds no state.
// ============================================================

// Viewport clamping to the board bounds: returns the clamped values as
// plain data ({viewSpan, viewX, viewY}); the parent applies them to state.
const clampViewportToBoard = function (D, viewX, viewY, viewSpan) {
  const gridSize = D.gridSize;
  const nextSpan = Math.max(5, Math.min(32, viewSpan));
  const nextX = Math.max(0, Math.min(gridSize - nextSpan, viewX));
  const nextY = Math.max(0, Math.min(gridSize - nextSpan, viewY));
  return { viewSpan: nextSpan, viewX: nextX, viewY: nextY };
};
