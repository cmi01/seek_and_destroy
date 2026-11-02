"use strict";

// ============================================================
// visibilityCache.js — job: compute the visibility cache over units and terrain.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const computeVisCache = function (D, ctx, team) {
  // Private vision lookups (this file's own job needs per-cell visibility
  // truth over the passed state shape; they mirror the vision query
  // semantics exactly).
  function inBounds(D, ctx, gx, gy) {
    const gridSize = D.gridSize;
    if (typeof ctx === "number") {
      return ctx >= 0 && ctx < gridSize && gx >= 0 && gx < gridSize;
    }
    const s = (ctx && ctx.gridSize) || gridSize;
    return gx >= 0 && gx < s && gy >= 0 && gy < s;
  }

  function terrainAt(D, ctx, gx, gy) {
    if (!inBounds(D, ctx, gx, gy)) return null;
    const row = ctx && ctx.terrain && ctx.terrain[gx];
    return row ? row[gy] : "EMPTY";
  }

  function effectiveScan(D, ctx, unit) {
    if (!unit || unit.hp <= 0) return 0;
    const nebScan = D.combatRules.nebulaEffectiveScan || 1;
    return terrainAt(D, ctx, unit.x, unit.y) === "NEBULA" ? nebScan : unit.scan;
  }

  function isCellVisible(D, ctx, gx, gy, team) {
    if (!inBounds(D, ctx, gx, gy)) return false;
    const eps = D.combatRules.rangeEpsilon || 1e-6;
    const us = (ctx && ctx.units) || [];
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (u.hp <= 0 || u.team !== team) continue;
      const eff = effectiveScan(D, ctx, u);
      if (eff <= 0) continue;
      if (Math.hypot(gx - u.x, gy - u.y) <= eff + eps) return true;
    }
    return false;
  }

  // The visibility grid for `team` over the whole board as plain data
  // (boolean per cell). The parent stores the returned structure in its
  // visCache state and owns the dirty/explored bookkeeping around it.
  const gridSize = D.gridSize;
  const vis = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gy = 0; gy < gridSize; gy++) {
      vis[gx][gy] = isCellVisible(D, ctx, gx, gy, team);
    }
  }
  return vis;
};
