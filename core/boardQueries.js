"use strict";

// ============================================================
// boardQueries.js — job: answer board geometry, terrain and occupancy queries.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("boardQueries", D => {
  function inBounds(ctx, gx, gy){
    const gridSize = D.gridSize;
    if (typeof ctx === "number") {
      return ctx >= 0 && ctx < gridSize && gx >= 0 && gx < gridSize;
    }
    const s = (ctx && ctx.gridSize) || gridSize;
    return gx >= 0 && gx < s && gy >= 0 && gy < s;
  }

  function dist(a, b){
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function inRange(a, b, r){
    const eps = D.combatRules.rangeEpsilon || 1e-6;
    return Math.hypot(a.x - b.x, a.y - b.y) <= r + eps;
  }

  function terrainAt(ctx, gx, gy){
    if (!inBounds(ctx, gx, gy)) return null;
    const row = ctx && ctx.terrain && ctx.terrain[gx];
    return row ? row[gy] : "EMPTY";
  }

  // O(1) occupancy lookups: a cell-key -> living unit index. Callers that do
  // many lookups against an unchanging board (the AI's per-beat snapshot,
  // one rendered frame) attach it to their context as ctx.unitIndex.
  function cellKey(gx, gy){ return gx * 4096 + gy; }

  function buildUnitIndex(units){
    const index = new Map();
    const us = units || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0) index.set(cellKey(u.x, u.y), u);
    }
    return index;
  }

  function getUnitAt(ctx, gx, gy){
    if (ctx && ctx.unitIndex) return ctx.unitIndex.get(cellKey(gx, gy)) || null;
    const us = (ctx && ctx.units) || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0 && u.x === gx && u.y === gy) return u;
    }
    return null;
  }

  return {
    inBounds,
    dist,
    inRange,
    terrainAt,
    cellKey,
    buildUnitIndex,
    getUnitAt
  };
});
