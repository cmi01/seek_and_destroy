"use strict";

// ============================================================
// reservePlacement.js — job: choose valid reserve-entry cells.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("reservePlacement", D => {
  // Private board lookups (this file scans the whole grid; they mirror the
  // board query semantics for in-bounds cells).
  function terrainAt(ctx, gx, gy){
    const row = ctx && ctx.terrain && ctx.terrain[gx];
    return row ? row[gy] : "EMPTY";
  }

  function unitAt(ctx, gx, gy){
    if (ctx && ctx.unitIndex) return ctx.unitIndex.get(gx * 4096 + gy) || null;
    const us = (ctx && ctx.units) || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0 && u.x === gx && u.y === gy) return u;
    }
    return null;
  }

  function getValidWarpCells(ctx, capitalUnit, radius){
    const spawnRadius = D.spawnRadius;
    const gridSize = D.gridSize;
    const eps = D.combatRules.rangeEpsilon || 1e-6;
    const sr = (ctx && ctx.spawnRadius !== undefined) ? ctx.spawnRadius : spawnRadius;
    const R = (radius === undefined) ? sr : radius;
    if (!capitalUnit || capitalUnit.hp <= 0) return [];
    const s = (ctx && ctx.gridSize) || gridSize;
    const valid = [];
    for (let gx = 0; gx < s; gx++){
      for (let gy = 0; gy < s; gy++){
        if (gx === capitalUnit.x && gy === capitalUnit.y) continue;
        if (terrainAt(ctx, gx, gy) === "ASTEROID") continue;
        if (unitAt(ctx, gx, gy)) continue;
        if (Math.hypot(gx - capitalUnit.x, gy - capitalUnit.y) <= R + eps) valid.push({ x: gx, y: gy });
      }
    }
    return valid;
  }

  return {
    getValidWarpCells
  };
});
