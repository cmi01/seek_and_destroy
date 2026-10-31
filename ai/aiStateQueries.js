"use strict";

// ============================================================
// aiStateQueries.js — job: answer AI state queries.
// Owner: ai/aiLogic.js. Holds no state unless it is a core.
// ============================================================
(() => {
  function myUnits(env, ctx){
    return ((ctx && ctx.units) || []).filter(u => u.hp > 0 && u.team === 2);
  }

  function spottedEnemies(env, ctx){
    return ((ctx && ctx.units) || []).filter(u => u.hp > 0 && u.team === 1 && env.isUnitSpottedByTeam(ctx, u, 2));
  }

  function activeBeliefs(env, ctx){
    const mc = env.tuning(ctx).beliefMinConfidence;
    const map = (ctx && ctx.lastSeenEnemies) || new Map();
    return Array.from(map.values()).filter(b => b.confidence >= mc);
  }

  // Ranks candidate cells by closeness to the nearest spotted enemy (or, if
  // none are spotted, the nearest remembered belief or coarse sector contact).
  function moveHeuristic(env, ctx, u, dest){
    const sp = spottedEnemies(env, ctx);
    let objs = sp.length ? sp : activeBeliefs(env, ctx);
    if (!objs.length){
      objs = ((ctx && ctx.units) || []).filter(p => p.hp > 0 && p.team === 1);
    }
    if (!objs.length) return 0;
    let best = Infinity;
    for (let i = 0; i < objs.length; i++){
      const d = env.dist(dest, objs[i]);
      if (d < best) best = d;
    }
    return -best;
  }

  function reachableCells(env, ctx, u, maxCells){
    const pg = (env.priorities(ctx) && env.priorities(ctx).planGeneration) || {};
    const cap = (maxCells === undefined) ? (pg.defaultReachableCap || 48) : maxCells;
    if (!u || u.hp <= 0 || u.flags.has("-moved") || u.move <= 0) return [];
    const s = (ctx && ctx.gridSize) || env.gridSize;
    const r = Math.ceil(u.move);
    const out = [];
    for (let gx = Math.max(0, u.x - r); gx <= Math.min(s - 1, u.x + r); gx++){
      for (let gy = Math.max(0, u.y - r); gy <= Math.min(s - 1, u.y + r); gy++){
        const d = { x: gx, y: gy };
        if (env.canMove(ctx, u, d)) out.push(d);
      }
    }
    out.sort((a, b) => moveHeuristic(env, ctx, u, b) - moveHeuristic(env, ctx, u, a));
    return out.slice(0, cap);
  }

  function computeSyncedMemory(env, ctx){
    const tn = env.tuning(ctx);
    const mi = (env.priorities(ctx) && env.priorities(ctx).memoryAndInvariants) || {};
    const maxStep = (mi.maxHeadingStep !== undefined) ? mi.maxHeadingStep : 3;
    const emptyMaxConf = (mi.emptyVisibleCellMaxConfidence !== undefined) ? mi.emptyVisibleCellMaxConfidence : 0.5;
    const dec = env.cfg(ctx).beliefDecay;
    const s = (ctx && ctx.gridSize) || env.gridSize;
    const turn = (ctx && ctx.turnNumber) || 1;
    const us = (ctx && ctx.units) || [];
    const pm = (ctx && ctx.lastSeenEnemies) || new Map();
    const nm = new Map();
    const pe = Array.from(pm.entries());
    for (let i = 0; i < pe.length; i++) nm.set(pe[i][0], { ...pe[i][1] });
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0 && u.team === 1 && env.isUnitSpottedByTeam(ctx, u, 2)){
        const pv = nm.get(u.id), dx = pv ? (u.x - pv.x) : 0, dy = pv ? (u.y - pv.y) : 0;
        nm.set(u.id, {
          id: u.id, x: u.x, y: u.y,
          dx: Math.max(-maxStep, Math.min(maxStep, dx)),
          dy: Math.max(-maxStep, Math.min(maxStep, dy)),
          type: u.type, hp: u.hp, cost: u.cost,
          turnSeen: turn, advancedTurn: turn, confidence: 1,
          hasFired: u.flags.has("-attacked"),
          hasMoved: u.flags.has("-moved"),
          hasShielded: u.flags.has("-shielded")
        });
      }
    }
    const es = Array.from(nm.entries());
    for (let i = 0; i < es.length; i++){
      const id = es[i][0], m = es[i][1], act = us.find(u => u.id === id && u.hp > 0);
      if (!act){ nm.delete(id); continue; }
      if (m.advancedTurn === turn || env.isUnitSpottedByTeam(ctx, act, 2)) continue;
      const nx = Math.max(0, Math.min(s - 1, Math.round(m.x + m.dx)));
      const ny = Math.max(0, Math.min(s - 1, Math.round(m.y + m.dy)));
      const nc = m.confidence * dec, age = turn - m.turnSeen;
      const empty = env.isCellVisibleToTeam(ctx, nx, ny, 2) && !env.getUnitAt(ctx, nx, ny);
      if (nc < tn.beliefMinConfidence || age > tn.beliefMaxAgeTurns || (empty && nc < emptyMaxConf)){
        nm.delete(id);
      } else {
        nm.set(id, { ...m, x: nx, y: ny, confidence: nc, advancedTurn: turn });
      }
    }
    return nm;
  }

  function railgunDangerZones(env, ctx){
    const zs = [], mine = myUnits(env, ctx), mf = mine.find(u => u.flags.has("!flagship"));
    if (!mf) return zs;
    const sp = spottedEnemies(env, ctx), ap = (ctx && ctx.ap !== undefined) ? ctx.ap : 0;
    for (let i = 0; i < sp.length; i++){
      const e = sp[i];
      if (!e.flags.has("#railgun")) continue;
      const atks = mine.filter(u => !u.flags.has("-attacked") && u.firepower > 0).slice().sort((a, b) => b.firepower - a.firepower);
      const lim = Math.min(ap, atks.length);
      let dmg = 0;
      for (let j = 0; j < lim; j++){
        dmg += (e.flags.has("+shield") && !atks[j].flags.has("#railgun")) ? 1 : atks[j].firepower;
      }
      if (dmg >= e.hp + (e.flags.has("+shield") ? 1 : 0)) continue;
      zs.push({ enemy: e, radius: e.move + Math.max(1, e.range) });
    }
    return zs;
  }

  function preservationTier(env, ctx, u){
    const p = env.priorities(ctx).preservation;
    if (u.flags.has("!flagship")) return p.tiers.flagship;
    if (u.flags.has("#capital ship")) return p.tiers.capitalShip;
    return u.cost >= p.highCostThreshold ? p.tiers.highCostHull : p.tiers.expendableHull;
  }

  function shouldRetreat(env, ctx, u){
    return (u.hp / u.maxHp) <= env.priorities(ctx).preservation.retreatHpThresholds[preservationTier(env, ctx, u)];
  }

  function fleetGap(env, ctx){
    const rf = (env.priorities(ctx) && env.priorities(ctx).reinforcement && env.priorities(ctx).reinforcement.fleetGap) || {};
    const buf = (rf.flagshipThreatRangeBuffer !== undefined) ? rf.flagshipThreatRangeBuffer : 1.0;
    const scoutScan = (rf.scoutMinScan !== undefined) ? rf.scoutMinScan : 5;
    const exclScout = rf.excludedScoutType || "Flagship Battlecruiser";
    const lrMin = (rf.longRangeMinRange !== undefined) ? rf.longRangeMinRange : 6;
    const aaMin = (rf.aaMinFirepower !== undefined) ? rf.aaMinFirepower : 4;
    const mine = myUnits(env, ctx), sp = spottedEnemies(env, ctx), fl = mine.find(u => u.flags.has("!flagship"));
    const ft = !!fl && sp.some(p => p.firepower > 0 && !p.flags.has("-attacked") && env.inRange(p, fl, Math.max(1, p.range + buf)) && env.hasLineOfSight(ctx, p.x, p.y, fl.x, fl.y, "WEAPON"));
    return {
      flagshipThreatened: ft,
      lacksScout: !mine.some(u => u.scan >= scoutScan && u.type !== exclScout),
      lacksLongRange: !mine.some(u => u.range >= lrMin && u.firepower > 0),
      lacksBoarding: !mine.some(u => u.flags.has("#space marines") && !u.flags.has("-sent boarding party")),
      lacksAA: !mine.some(u => u.firepower >= aaMin)
    };
  }

  function warpLoci(env, ctx){
    const rf = (env.priorities(ctx) && env.priorities(ctx).reinforcement) || {};
    const capMult = (rf.capitalLocusCostMultiplier !== undefined) ? rf.capitalLocusCostMultiplier : 1;
    const emRad = (rf.emergencyLocusRadius !== undefined) ? rf.emergencyLocusRadius : 3;
    const emMult = (rf.emergencyLocusCostMultiplier !== undefined) ? rf.emergencyLocusCostMultiplier : 1.5;
    const sr = (ctx && ctx.spawnRadius !== undefined) ? ctx.spawnRadius : env.spawnRadius;
    const mine = myUnits(env, ctx);
    const caps = mine.filter(u => u.flags.has("#capital ship") && env.getValidWarpCells(ctx, u, sr).length > 0);
    if (caps.length > 0) return caps.map(u => ({ unit: u, radius: sr, costMult: capMult }));
    return mine.filter(u => env.getValidWarpCells(ctx, u, emRad).length > 0).map(u => ({ unit: u, radius: emRad, costMult: emMult }));
  }

  function canEliminateAllFlagshipThreats(env, ctx){
    const mine = myUnits(env, ctx), mf = mine.find(u => u.flags.has("!flagship"));
    if (!mf) return true;
    const ths = spottedEnemies(env, ctx).filter(e => e.firepower > 0 && !e.flags.has("-attacked") && env.inRange(e, mf, e.move + Math.max(1, e.range)));
    let ap = (ctx && ctx.ap !== undefined) ? ctx.ap : 0;
    for (let t = 0; t < ths.length; t++){
      const th = ths[t];
      const atks = mine.filter(u => !u.flags.has("-attacked") && u.firepower > 0).slice().sort((a, b) => b.firepower - a.firepower);
      let need = th.hp + (th.flags.has("+shield") ? 1 : 0);
      for (let a = 0; a < atks.length; a++){
        if (ap <= 0) break;
        need -= (th.flags.has("+shield") && !atks[a].flags.has("#railgun")) ? 1 : atks[a].firepower;
        ap -= 1;
      }
      if (need > 0) return false;
    }
    return true;
  }

  function checkInvariants(env, ctx){
    const w = [];
    if (!ctx) return w;
    const mi = (env.priorities(ctx) && env.priorities(ctx).memoryAndInvariants) || {};
    const maxEntries = (mi.maxBeliefMapEntries !== undefined) ? mi.maxBeliefMapEntries : 64;
    if (ctx.ap < 0) w.push("[AI INVARIANT] AP went negative: " + ctx.ap);
    if (ctx.lastSeenEnemies && ctx.lastSeenEnemies.size > maxEntries) w.push("[AI INVARIANT] Belief map too large: " + ctx.lastSeenEnemies.size);
    if (!ctx.syncOnly && ctx.activeTeam !== 2) w.push("[AI INVARIANT] AI acting out of turn");
    return w;
  }

  AILogic._register("stateQueries", {
    myUnits,
    spottedEnemies,
    activeBeliefs,
    moveHeuristic,
    reachableCells,
    computeSyncedMemory,
    railgunDangerZones,
    preservationTier,
    shouldRetreat,
    fleetGap,
    warpLoci,
    canEliminateAllFlagshipThreats,
    checkInvariants
  });
})();
