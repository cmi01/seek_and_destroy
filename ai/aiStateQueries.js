"use strict";

// ============================================================
// aiStateQueries.js — job: answer the AI's contact-picture state queries (own living units, spotted enemies, active beliefs).
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

  AILogic._register("stateQueries", {
    myUnits,
    spottedEnemies,
    activeBeliefs
  });
})();
