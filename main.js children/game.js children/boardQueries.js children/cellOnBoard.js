"use strict";

// ============================================================
// cellOnBoard.js — job: report whether a cell lies inside the board.
// Owner: boardQueries.js (pure). Holds no state.
// ============================================================

// `ctx` may arrive as a context object carrying its own gridSize, or (legacy
// call shape) as the grid size itself with only an x coordinate to check.
const cellOnBoard = function (D, ctx, gx, gy){
  const gridSize = D.gridSize;
  if (typeof ctx === "number") {
    return ctx >= 0 && ctx < gridSize && gx >= 0 && gx < gridSize;
  }
  const s = (ctx && ctx.gridSize) || gridSize;
  return gx >= 0 && gx < s && gy >= 0 && gy < s;
};
