"use strict";

// ============================================================
// rules.js — job: answer tactical rule queries.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("rules", D => {
  function getGridSize(){ return D.gridSize; }
  function getSpawnRadius(){ return D.spawnRadius; }
  function getMaxAp(){ return D.maxAp; }
  function getEnemyActionIntervalMs(){ return D.enemyActionIntervalMs; }
  function getZoomLadder(){ return D.zoomLadder; }
  function getWheelNotchPx(){ return D.wheelNotchPx; }
  function getMaxZoomStepsPerEvent(){ return D.maxZoomStepsPerEvent; }
  function getDefaultDifficulty(){ return D.defaultDifficulty; }
  function getDifficultyProfiles(){ return D.difficultyProfiles; }
  function getShipSpecs(){ return D.shipSpecs; }
  function getCombatRules(){ return D.combatRules; }

  function inBounds(ctx, gx, gy){
    const gridSize = getGridSize();
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
    const eps = getCombatRules().rangeEpsilon || 1e-6;
    return Math.hypot(a.x - b.x, a.y - b.y) <= r + eps;
  }

  function terrainAt(ctx, gx, gy){
    if (!inBounds(ctx, gx, gy)) return null;
    const row = ctx && ctx.terrain && ctx.terrain[gx];
    return row ? row[gy] : "EMPTY";
  }

  // Flags are a Set on live units and an Array in SHIP_SPECS / test fixtures.
  function hasFlag(unit, flag){
    if (!unit || !unit.flags) return false;
    return typeof unit.flags.has === "function" ? unit.flags.has(flag) : unit.flags.includes(flag);
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

  function hasLineOfSight(ctx, x0, y0, x1, y1, mode){
    if (!inBounds(ctx, x0, y0) || !inBounds(ctx, x1, y1)) return false;
    if (x0 === x1 && y0 === y1) return true;
    if ((mode === "MOVE" || mode === "WEAPON") && terrainAt(ctx, x1, y1) === "ASTEROID") return false;
    const sx = x0 + 0.5, sy = y0 + 0.5, ex = x1 + 0.5, ey = y1 + 0.5;
    const dx = ex - sx, dy = ey - sy, d = Math.hypot(dx, dy);
    const steps = Math.ceil(d * (getCombatRules().losRayStepsPerCell || 16));
    for (let i = 1; i < steps; i++){
      const t = i / steps, px = sx + dx * t, py = sy + dy * t;
      const gx = Math.floor(px), gy = Math.floor(py);
      if (gx === x0 && gy === y0) continue;
      if (gx === x1 && gy === y1) continue;
      if (terrainAt(ctx, gx, gy) === "ASTEROID") return false;
    }
    return true;
  }

  function effectiveScan(ctx, unit){
    if (!unit || unit.hp <= 0) return 0;
    const nebScan = getCombatRules().nebulaEffectiveScan || 1;
    return terrainAt(ctx, unit.x, unit.y) === "NEBULA" ? nebScan : unit.scan;
  }

  function isCellVisibleToTeam(ctx, gx, gy, team){
    if (!inBounds(ctx, gx, gy)) return false;
    const eps = getCombatRules().rangeEpsilon || 1e-6;
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
      const cloakDist = (getCombatRules().nebulaCloakDist || 1.0) + (getCombatRules().rangeEpsilon || 1e-6);
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
    const u = getUnitAt(ctx, gx, gy);
    if (!u || u.team === observerTeam) return null;
    return isUnitSpottedByTeam(ctx, u, observerTeam) ? u : null;
  }

  function canMove(ctx, unitA, B){
    if (!unitA || unitA.hp <= 0 || unitA.flags.has("-moved") || unitA.move <= 0) return false;
    if (!inBounds(ctx, B.x, B.y)) return false;
    if (unitA.x === B.x && unitA.y === B.y) return false;
    if (!inRange(unitA, B, unitA.move)) return false;
    if (!hasLineOfSight(ctx, unitA.x, unitA.y, B.x, B.y, "MOVE")) return false;
    const occ = getUnitAt(ctx, B.x, B.y);
    if (occ){
      if (occ.team === unitA.team) return false;
      if (isUnitSpottedByTeam(ctx, occ, unitA.team)) return false;
    }
    return true;
  }

  function canCapture(ctx, unitA, B){
    if (!unitA || unitA.hp <= 0) return false;
    if (!unitA.flags.has("#space marines") || unitA.flags.has("-sent boarding party")) return false;
    if (!inRange(unitA, B, 1.0)) return false;
    const occ = getUnitAt(ctx, B.x, B.y);
    if (!occ || occ.team === unitA.team) return false;
    if (!isUnitSpottedByTeam(ctx, occ, unitA.team)) return false;
    if (occ.flags.has("!flagship")) return false;
    return true;
  }

  function canShoot(ctx, unitA, B){
    if (!unitA || unitA.hp <= 0) return false;
    if (unitA.firepower <= 0 || unitA.flags.has("-attacked") || unitA.range <= 0) return false;
    if (!inRange(unitA, B, unitA.range)) return false;
    const occ = getUnitAt(ctx, B.x, B.y);
    if (!occ || occ.team === unitA.team) return false;
    if (!isUnitSpottedByTeam(ctx, occ, unitA.team)) return false;
    if (!hasLineOfSight(ctx, unitA.x, unitA.y, B.x, B.y, "WEAPON")) return false;
    return true;
  }

  // ctx is required, like every other rule query: state belongs to the
  // caller and is never fetched through a bare-global back-channel.
  function canShield(ctx, unitA, B){
    if (!unitA || unitA.hp <= 0 || !B) return false;
    if (ctx && typeof ctx.ap === "number" && ctx.ap <= 0) return false;
    if (unitA.x !== B.x || unitA.y !== B.y) return false;
    if (!hasFlag(unitA, "#shield generator")) return false;
    if (hasFlag(unitA, "+shield") || hasFlag(unitA, "-shielded")) return false;
    return true;
  }

  function getPriorityActionAt(ctx, unitA, gx, gy, opts){
    if (!unitA || unitA.hp <= 0) return null;
    const B = { x: gx, y: gy };
    if (canMove(ctx, unitA, B)) return "MOVE";
    if (opts && opts.preferShoot && canShoot(ctx, unitA, B)) return "SHOOT";
    if (opts && opts.preferCapture && canCapture(ctx, unitA, B)) return "CAPTURE";
    if (canCapture(ctx, unitA, B)) return "CAPTURE";
    if (canShoot(ctx, unitA, B)) return "SHOOT";
    if (canShield(ctx, unitA, B)) return "SHIELD";
    return null;
  }

  function getValidWarpCells(ctx, capitalUnit, radius){
    const spawnRadius = getSpawnRadius();
    const gridSize = getGridSize();
    const eps = getCombatRules().rangeEpsilon || 1e-6;
    const sr = (ctx && ctx.spawnRadius !== undefined) ? ctx.spawnRadius : spawnRadius;
    const R = (radius === undefined) ? sr : radius;
    if (!capitalUnit || capitalUnit.hp <= 0) return [];
    const s = (ctx && ctx.gridSize) || gridSize;
    const valid = [];
    for (let gx = 0; gx < s; gx++){
      for (let gy = 0; gy < s; gy++){
        if (gx === capitalUnit.x && gy === capitalUnit.y) continue;
        if (terrainAt(ctx, gx, gy) === "ASTEROID") continue;
        if (getUnitAt(ctx, gx, gy)) continue;
        if (Math.hypot(gx - capitalUnit.x, gy - capitalUnit.y) <= R + eps) valid.push({ x: gx, y: gy });
      }
    }
    return valid;
  }

  function shootableFrom(ctx, u, dest, target){
    if (!target || target.hp <= 0 || u.firepower <= 0 || u.range <= 0) return false;
    if (!inRange(dest, target, u.range) || !isUnitSpottedByTeam(ctx, target, u.team)) return false;
    return hasLineOfSight(ctx, dest.x, dest.y, target.x, target.y, "WEAPON");
  }

  function isKillShot(u, target){
    if (!target || target.hp <= 0) return false;
    const shieldDmg = getCombatRules().shieldNonRailgunDamage || 1;
    const dmg = (target.flags.has("+shield") && !u.flags.has("#railgun")) ? shieldDmg : u.firepower;
    return (target.hp - dmg) <= 0;
  }

  function computeCollisionOutcome(unitA, occupant){
    const shieldBonus = getCombatRules().shieldCollisionBonus || 1;
    const moverHadShield = unitA.flags.has("+shield");
    const occHadShield = occupant.flags.has("+shield");
    const moverEff = unitA.hp + (moverHadShield ? shieldBonus : 0);
    const occEff = occupant.hp + (occHadShield ? shieldBonus : 0);
    return {
      moverHadShield,
      occHadShield,
      moverRem: moverEff - occEff,
      occRem: occEff - moverEff
    };
  }

  function computeShootOutcome(unitA, target){
    const shieldDmg = getCombatRules().shieldNonRailgunDamage || 1;
    if (target.flags.has("+shield")){
      // Any hit breaks the bubble; only #railgun fire keeps its full
      // firepower through the break — other weapons are cut to shieldDmg.
      const dmg = unitA.flags.has("#railgun") ? unitA.firepower : shieldDmg;
      return { damageDealt: dmg, shieldStripped: true };
    }
    return { damageDealt: unitA.firepower, shieldStripped: false };
  }

  function checkEndgameStatus(units){
    const us = units || [];
    let t1 = 0, t2 = 0;
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0 && u.flags.has("!flagship")){
        if (u.team === 1) t1++;
        else if (u.team === 2) t2++;
      }
    }
    const anyFlagships = (t1 + t2) > 0;
    return { t1Flagships: t1, t2Flagships: t2, t1Defeated: anyFlagships && t1 === 0, t2Defeated: anyFlagships && t2 === 0 };
  }

  return {
    get flagDescriptions(){ return D.flagDescriptions || {}; },
    get gridSize(){ return getGridSize(); },
    get spawnRadius(){ return getSpawnRadius(); },
    get maxAp(){ return getMaxAp(); },
    get enemyActionIntervalMs(){ return getEnemyActionIntervalMs(); },
    get zoomLadder(){ return getZoomLadder(); },
    get wheelNotchPx(){ return getWheelNotchPx(); },
    get maxZoomStepsPerEvent(){ return getMaxZoomStepsPerEvent(); },
    get defaultDifficulty(){ return getDefaultDifficulty(); },
    get difficultyProfiles(){ return getDifficultyProfiles(); },
    get shipSpecs(){ return getShipSpecs(); },
    inBounds,
    dist,
    inRange,
    terrainAt,
    getUnitAt,
    buildUnitIndex,
    hasFlag,
    hasLineOfSight,
    effectiveScan,
    isCellVisibleToTeam,
    isUnitSpottedByTeam,
    getSpottedEnemyAt,
    canMove,
    canCapture,
    canShoot,
    canShield,
    getPriorityActionAt,
    getValidWarpCells,
    shootableFrom,
    isKillShot,
    computeCollisionOutcome,
    computeShootOutcome,
    checkEndgameStatus
  };
});
