"use strict";

// ============================================================
// unitScanRange.js — job: report a unit's scan range under its terrain.
// Owner: visionQueries.js (pure). Holds no state.
// ============================================================

const unitScanRange = function (D, ctx, unit){
  // Private board-truth mirrors: this file is self-contained and calls no
  // other file, so the bounds and terrain rules are restated here.
  function onBoard(c, x, y){
    const gridSize = D.gridSize;
    if (typeof c === "number") {
      return c >= 0 && c < gridSize && x >= 0 && x < gridSize;
    }
    const s = (c && c.gridSize) || gridSize;
    return x >= 0 && x < s && y >= 0 && y < s;
  }

  function terrainOf(c, x, y){
    if (!onBoard(c, x, y)) return null;
    const row = c && c.terrain && c.terrain[x];
    return row ? row[y] : "EMPTY";
  }

  if (!unit || unit.hp <= 0) return 0;
  const nebScan = D.combatRules.nebulaEffectiveScan || 1;
  return terrainOf(ctx, unit.x, unit.y) === "NEBULA" ? nebScan : unit.scan;
};
