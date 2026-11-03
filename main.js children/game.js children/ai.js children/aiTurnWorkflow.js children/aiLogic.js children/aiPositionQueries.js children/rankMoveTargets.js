"use strict";

// ============================================================
// rankMoveTargets.js — job: rank a candidate cell by closeness to the nearest contact.
// Owner: aiPositionQueries.js. Holds no state.
// ============================================================

// Ranks candidate cells by closeness to the nearest spotted enemy (or, if
// none are spotted, the nearest remembered belief or coarse sector contact).
const rankMoveTargets = function (env, ctx, u, dest){
  const sp = env.spottedEnemies(ctx);
  let objs = sp.length ? sp : env.activeBeliefs(ctx);
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
};
