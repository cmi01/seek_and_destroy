"use strict";

// ============================================================
// unitSpottedByTeam.js — job: report whether a team detects a given unit.
// Owner: visionQueries.js (pure). Holds no state.
// ============================================================

const unitSpottedByTeam = function (D, ctx, targetUnit, observerTeam){
  // Private board-truth mirrors: this file is self-contained and calls no
  // other file, so the bounds, terrain, scan and cell-visibility rules are
  // restated here exactly.
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

  function visibleTo(c, x, y, team){
    if (!onBoard(c, x, y)) return false;
    const eps = D.combatRules.rangeEpsilon || 1e-6;
    const us = (c && c.units) || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp <= 0 || u.team !== team) continue;
      const eff = scanOf(c, u);
      if (eff <= 0) continue;
      if (Math.hypot(x - u.x, y - u.y) <= eff + eps) return true;
    }
    return false;
  }

  if (!targetUnit || targetUnit.hp <= 0) return false;
  if (targetUnit.team === observerTeam) return true;
  // Nebulae cloak: a target inside one is only seen at knife range.
  if (terrainOf(ctx, targetUnit.x, targetUnit.y) === "NEBULA"){
    const cloakDist = (D.combatRules.nebulaCloakDist || 1.0) + (D.combatRules.rangeEpsilon || 1e-6);
    const us = (ctx && ctx.units) || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp <= 0 || u.team !== observerTeam) continue;
      if (Math.hypot(targetUnit.x - u.x, targetUnit.y - u.y) <= cloakDist) return true;
    }
    return false;
  }
  return visibleTo(ctx, targetUnit.x, targetUnit.y, observerTeam);
};
