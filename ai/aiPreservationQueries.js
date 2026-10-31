"use strict";

// ============================================================
// aiPreservationQueries.js — job: answer the AI's hull-preservation queries (a hull's preservation tier and retreat threshold).
// Owner: ai/aiLogic.js. Holds no state unless it is a core.
// ============================================================
(() => {
  function preservationTier(env, ctx, u){
    const p = env.priorities(ctx).preservation;
    if (u.flags.has("!flagship")) return p.tiers.flagship;
    if (u.flags.has("#capital ship")) return p.tiers.capitalShip;
    return u.cost >= p.highCostThreshold ? p.tiers.highCostHull : p.tiers.expendableHull;
  }

  function shouldRetreat(env, ctx, u){
    return (u.hp / u.maxHp) <= env.priorities(ctx).preservation.retreatHpThresholds[preservationTier(env, ctx, u)];
  }

  AILogic._register("preservationQueries", {
    preservationTier,
    shouldRetreat
  });
})();
