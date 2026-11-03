"use strict";

// ============================================================
// listActiveBeliefs.js — job: list the remembered enemy beliefs still above the confidence floor.
// Owner: aiStateQueries.js. Holds no state.
// ============================================================

const listActiveBeliefs = function (env, ctx){
  const mc = env.tuning(ctx).beliefMinConfidence;
  const map = (ctx && ctx.lastSeenEnemies) || new Map();
  return Array.from(map.values()).filter(b => b.confidence >= mc);
};
