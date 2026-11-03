"use strict";

// ============================================================
// listReachableCells.js — job: list the cells one unit can move to, ranked toward contacts.
// Owner: aiPositionQueries.js. Holds no state.
// ============================================================

// Private mirror of the ranking semantics the contact-ranking query applies:
// children never call each other, so this file carries its own copy.
function _rankDest(env, ctx, u, dest){
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
}

const listReachableCells = function (env, ctx, u, maxCells){
  const pg = (env.priorities(ctx) && env.priorities(ctx).planGeneration) || {};
  const cap = (maxCells === undefined) ? (pg.defaultReachableCap || 48) : maxCells;
  if (!u || u.hp <= 0 || u.flags.has("-moved") || u.move <= 0) return [];
  const s = (ctx && ctx.gridSize) || env.gridSize;
  const r = Math.ceil(u.move);
  const out = [];
  for (let gx = Math.max(0, u.x - r); gx <= Math.min(s - 1, u.x + r); gx++){
    for (let gy = Math.max(0, u.y - r); gy <= Math.min(s - 1, u.y + r); gy++){
      const d = { x: gx, y: gy };
      if (env.canMove(ctx, u, d)) out.push(d);
    }
  }
  out.sort((a, b) => _rankDest(env, ctx, u, b) - _rankDest(env, ctx, u, a));
  return out.slice(0, cap);
};
