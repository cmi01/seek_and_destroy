"use strict";

// ============================================================
// visionQueries.js — job: answer scan, visibility and spotting queries.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("visionQueries", D => {
  // Private board lookups (this file's own job needs terrain and occupancy
  // truth; they mirror the board query semantics exactly).
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

  function unitAt(ctx, gx, gy){
    if (ctx && ctx.unitIndex) return ctx.unitIndex.get(gx * 4096 + gy) || null;
    const us = (ctx && ctx.units) || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0 && u.x === gx && u.y === gy) return u;
    }
    return null;
  }

  function effectiveScan(ctx, unit){
    if (!unit || unit.hp <= 0) return 0;
    const nebScan = D.combatRules.nebulaEffectiveScan || 1;
    return terrainAt(ctx, unit.x, unit.y) === "NEBULA" ? nebScan : unit.scan;
  }

  function isCellVisibleToTeam(ctx, gx, gy, team){
    if (!inBounds(ctx, gx, gy)) return false;
    const eps = D.combatRules.rangeEpsilon || 1e-6;
    const us = (ctx && ctx.units) || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp <= 0 || u.team !== team) continue;
      const eff = effectiveScan(ctx, u);
      if (eff <= 0) continue;
      if (Math.hypot(gx - u.x, gy - u.y) <= eff + eps) return true;
    }
    return false;
  }

  function isUnitSpottedByTeam(ctx, targetUnit, observerTeam){
    if (!targetUnit || targetUnit.hp <= 0) return false;
    if (targetUnit.team === observerTeam) return true;
    if (terrainAt(ctx, targetUnit.x, targetUnit.y) === "NEBULA"){
      const cloakDist = (D.combatRules.nebulaCloakDist || 1.0) + (D.combatRules.rangeEpsilon || 1e-6);
      const us = (ctx && ctx.units) || [];
      for (let i = 0; i < us.length; i++){
        const u = us[i];
        if (u.hp <= 0 || u.team !== observerTeam) continue;
        if (Math.hypot(targetUnit.x - u.x, targetUnit.y - u.y) <= cloakDist) return true;
      }
      return false;
    }
    return isCellVisibleToTeam(ctx, targetUnit.x, targetUnit.y, observerTeam);
  }

  function getSpottedEnemyAt(ctx, gx, gy, observerTeam){
    const u = unitAt(ctx, gx, gy);
    if (!u || u.team === observerTeam) return null;
    return isUnitSpottedByTeam(ctx, u, observerTeam) ? u : null;
  }

  return {
    effectiveScan,
    isCellVisibleToTeam,
    isUnitSpottedByTeam,
    getSpottedEnemyAt
  };
});
