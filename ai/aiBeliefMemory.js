"use strict";

// ============================================================
// aiBeliefMemory.js — job: compute the AI's next belief map (sighting sync and decay).
// Owner: ai/aiLogic.js. Holds no state unless it is a core.
// ============================================================
(() => {
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

  AILogic._register("beliefMemory", {
    computeSyncedMemory
  });
})();
