"use strict";

// ============================================================
// lineOfSight.js — job: answer line-of-sight queries.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("lineOfSight", D => {
  // Private board lookups (this file's own job needs terrain truth along the
  // ray; they mirror the board query semantics exactly).
  function inBounds(ctx, gx, gy){
    const gridSize = D.gridSize;
    if (typeof ctx === "number") {
      return ctx >= 0 && ctx < gridSize && gx >= 0 && gx < gridSize;
    }
    const s = (ctx && ctx.gridSize) || gridSize;
    return gx >= 0 && gx < s && gy >= 0 && gy < s;
  }

  function terrainAt(ctx, gx, gy){
    if (!inBounds(ctx, gx, gy)) return null;
    const row = ctx && ctx.terrain && ctx.terrain[gx];
    return row ? row[gy] : "EMPTY";
  }

  function hasLineOfSight(ctx, x0, y0, x1, y1, mode){
    if (!inBounds(ctx, x0, y0) || !inBounds(ctx, x1, y1)) return false;
    if (x0 === x1 && y0 === y1) return true;
    if ((mode === "MOVE" || mode === "WEAPON") && terrainAt(ctx, x1, y1) === "ASTEROID") return false;
    const sx = x0 + 0.5, sy = y0 + 0.5, ex = x1 + 0.5, ey = y1 + 0.5;
    const dx = ex - sx, dy = ey - sy, d = Math.hypot(dx, dy);
    const steps = Math.ceil(d * (D.combatRules.losRayStepsPerCell || 16));
    for (let i = 1; i < steps; i++){
      const t = i / steps, px = sx + dx * t, py = sy + dy * t;
      const gx = Math.floor(px), gy = Math.floor(py);
      if (gx === x0 && gy === y0) continue;
      if (gx === x1 && gy === y1) continue;
      if (terrainAt(ctx, gx, gy) === "ASTEROID") return false;
    }
    return true;
  }

  return {
    hasLineOfSight
  };
});
