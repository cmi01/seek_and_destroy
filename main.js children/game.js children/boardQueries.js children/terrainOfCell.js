"use strict";

// ============================================================
// terrainOfCell.js — job: name the terrain of a board cell.
// Owner: boardQueries.js (pure). Holds no state.
// ============================================================

const terrainOfCell = function (D, ctx, gx, gy){
  // Private mirror of the board-bounds rule (this file is self-contained and
  // calls no other file): a cell outside the board has no terrain.
  function onBoard(c, x, y){
    const gridSize = D.gridSize;
    if (typeof c === "number") {
      return c >= 0 && c < gridSize && x >= 0 && x < gridSize;
    }
    const s = (c && c.gridSize) || gridSize;
    return x >= 0 && x < s && y >= 0 && y < s;
  }

  if (!onBoard(ctx, gx, gy)) return null;
  const row = ctx && ctx.terrain && ctx.terrain[gx];
  return row ? row[gy] : "EMPTY";
};
