"use strict";

// ============================================================
// shouldHullRetreat.js — job: decide whether a hull has fallen to its retreat threshold.
// Owner: aiPreservationQueries.js. Holds no state.
// ============================================================

// Private mirror of the tier classification semantics the sibling query
// applies: children never call each other, so this file carries its own copy.
function _tierOf(env, ctx, u){
  const p = env.priorities(ctx).preservation;
  if (u.flags.has("!flagship")) return p.tiers.flagship;
  if (u.flags.has("#capital ship")) return p.tiers.capitalShip;
  return u.cost >= p.highCostThreshold ? p.tiers.highCostHull : p.tiers.expendableHull;
}

const shouldHullRetreat = function (env, ctx, u){
  return (u.hp / u.maxHp) <= env.priorities(ctx).preservation.retreatHpThresholds[_tierOf(env, ctx, u)];
};
