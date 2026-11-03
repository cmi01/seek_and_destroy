"use strict";

// ============================================================
// hullPreservationTier.js — job: classify a hull into its preservation tier.
// Owner: aiPreservationQueries.js. Holds no state.
// ============================================================

const hullPreservationTier = function (env, ctx, u){
  const p = env.priorities(ctx).preservation;
  if (u.flags.has("!flagship")) return p.tiers.flagship;
  if (u.flags.has("#capital ship")) return p.tiers.capitalShip;
  return u.cost >= p.highCostThreshold ? p.tiers.highCostHull : p.tiers.expendableHull;
};
