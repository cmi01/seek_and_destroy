"use strict";

// ============================================================
// aiInvariantChecks.js — job: check the AI turn state's invariants.
// Owner: ai/aiLogic.js. Holds no state unless it is a core.
// ============================================================
(() => {
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

  AILogic._register("invariantChecks", {
    checkInvariants
  });
})();
