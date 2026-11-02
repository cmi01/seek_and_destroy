"use strict";

// ============================================================
// cellVisibleToTeam.js — job: report whether any living unit of a team sees a cell.
// Owner: visionQueries.js (pure). Holds no state.
// ============================================================

const cellVisibleToTeam = function (D, ctx, gx, gy, team){
  // Private board-truth mirrors: this file is self-contained and calls no
  // other file, so the bounds, terrain and scan rules are restated here.
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

  function scanOf(c, u){
    if (!u || u.hp <= 0) return 0;
    const nebScan = D.combatRules.nebulaEffectiveScan || 1;
    return terrainOf(c, u.x, u.y) === "NEBULA" ? nebScan : u.scan;
  }

  if (!onBoard(ctx, gx, gy)) return false;
  const eps = D.combatRules.rangeEpsilon || 1e-6;
  const us = (ctx && ctx.units) || [];
  for (let i = 0; i < us.length; i++){
    const u = us[i];
    if (u.hp <= 0 || u.team !== team) continue;
    const eff = scanOf(ctx, u);
    if (eff <= 0) continue;
    if (Math.hypot(gx - u.x, gy - u.y) <= eff + eps) return true;
  }
  return false;
};
