"use strict";

// ============================================================
// listSpottedEnemies.js — job: list the living enemy units the AI team has spotted.
// Owner: aiStateQueries.js. Holds no state.
// ============================================================

const listSpottedEnemies = function (env, ctx){
  return ((ctx && ctx.units) || []).filter(u => u.hp > 0 && u.team === 1 && env.isUnitSpottedByTeam(ctx, u, 2));
};
