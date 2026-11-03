"use strict";

// ============================================================
// listWarpCells.js — job: list empty non-asteroid cells in range of a
// locus unit that the locus's team can currently see.
// Owner: reservePlacement.js (pure). Holds no state.
// ============================================================
const listWarpCells = function (D, ctx, capitalUnit, radius){
  function terrainAt(ctx, gx, gy){
    const row = ctx && ctx.terrain && ctx.terrain[gx];
    return row ? row[gy] : "EMPTY";
  }

  function unitAt(ctx, gx, gy){
    const us = (ctx && ctx.units) || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0 && u.x === gx && u.y === gy) return u;
    }
    return null;
  }

  function onBoard(c, x, y){
    const gridSize = D.gridSize;
    if (typeof c === "number") {
      return c >= 0 && c < gridSize && x >= 0 && x < gridSize;
    }
    const s = (c && c.gridSize) || gridSize;
    return x >= 0 && x < s && y >= 0 && y < s;
  }

  function scanOf(c, u){
    if (!u || u.hp <= 0) return 0;
    const nebScan = D.combatRules.nebulaEffectiveScan || 1;
    return terrainAt(c, u.x, u.y) === "NEBULA" ? nebScan : u.scan;
  }

  function cellVisible(c, gx, gy, team){
    if (!onBoard(c, gx, gy)) return false;
    const visEps = D.combatRules.rangeEpsilon || 1e-6;
    const us = (c && c.units) || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp <= 0 || u.team !== team) continue;
      const eff = scanOf(c, u);
      if (eff <= 0) continue;
      if (Math.hypot(gx - u.x, gy - u.y) <= eff + visEps) return true;
    }
    return false;
  }

  const spawnRadius = D.spawnRadius;
  const gridSize = D.gridSize;
  const eps = D.combatRules.rangeEpsilon || 1e-6;
  const sr = (ctx && ctx.spawnRadius !== undefined) ? ctx.spawnRadius : spawnRadius;
  const R = (radius === undefined) ? sr : radius;
  if (!capitalUnit || capitalUnit.hp <= 0) return [];
  const s = (ctx && ctx.gridSize) || gridSize;
  const team = capitalUnit.team;
  const valid = [];
  for (let gx = 0; gx < s; gx++){
    for (let gy = 0; gy < s; gy++){
      if (gx === capitalUnit.x && gy === capitalUnit.y) continue;
      if (terrainAt(ctx, gx, gy) === "ASTEROID") continue;
      if (unitAt(ctx, gx, gy)) continue;
      if (Math.hypot(gx - capitalUnit.x, gy - capitalUnit.y) > R + eps) continue;
      if (!cellVisible(ctx, gx, gy, team)) continue;
      valid.push({ x: gx, y: gy });
    }
  }
  return valid;
};
