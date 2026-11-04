"use strict";

// ============================================================
// buildAISnapshot.js — job: assemble and deep-freeze the one-way AI snapshot DTO (buildAISnapshot).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const buildAISnapshot = function (p){
  // Mirrors the tree-copy / tree-freeze semantics and the living-unit cell
  // index exactly (the sibling utilities are not reachable from a child).
  function indexByCell(units){
    function keyOf(gx, gy){ return gx * 4096 + gy; }
    const index = new Map();
    const us = units || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0) index.set(keyOf(u.x, u.y), u);
    }
    return index;
  }
  function copyTree(o){
    if (Array.isArray(o)) return o.map(copyTree);
    if (o && typeof o === "object") {
      const out = {};
      const ks = Object.keys(o);
      for (let i = 0; i < ks.length; i++) out[ks[i]] = copyTree(o[ks[i]]);
      return out;
    }
    return o;
  }
  function freezeTree(o){
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.values(o).forEach(freezeTree);
    }
    return o;
  }
  const st = p.state;
  const k = p.consts;
  const clonedUnits = Array.isArray(st.units)
    ? st.units.map(u => ({ ...u, flags: new Set(u.flags) }))
    : [];
  const clonedTerrain = Array.isArray(st.terrain)
    ? st.terrain.map(col => Array.isArray(col) ? col.slice() : [])
    : [];
  const snap = {
    gridSize: k.gridSize,
    spawnRadius: k.spawnRadius,
    difficulty: k.difficulty,
    difficultyTable: k.difficultyTable,
    shipSpecs: k.shipSpecs,
    aiDoctrine: st.aiDoctrine,
    // M6(a): the battle's faction identity and its scorer multipliers,
    // delivered as plain data (the scorer folds them over the profile).
    aiFaction: st.faction || null,
    aiFactionWeights: p.aiFactionWeights,
    turnNumber: st.turnNumber,
    activeTeam: st.activeTeam,
    ap: st.ap,
    credits: st.credits ? { ...st.credits } : { 1: 0, 2: 0 },
    terrain: clonedTerrain,
    units: clonedUnits,
    // O(1) getUnitAt during planning (the board does not change while
    // the AI evaluates a beat; a new snapshot is built every beat).
    unitIndex: indexByCell(clonedUnits),
    lastSeenEnemies: new Map(st.lastSeenEnemies),
    reservations: (st.aiPlan && st.aiPlan.reservations) ? new Map(st.aiPlan.reservations) : new Map(),
    aiEmergencyMode: st.aiEmergencyMode,
    aiScoreTrace: copyTree(st.aiScoreTrace),
    gameOver: st.gameOver,
    rolls: p.rolls,
    roll: p.roll,
    syncOnly: p.syncOnly,
    rules: p.rules
  };
  // One-way boundary: the DTO is deep-frozen, so the AI tree can only read
  // it — it returns a result object instead of decorating the snapshot.
  return freezeTree(snap);
};
