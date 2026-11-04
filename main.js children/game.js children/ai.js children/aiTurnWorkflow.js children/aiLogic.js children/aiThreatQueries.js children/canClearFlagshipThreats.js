"use strict";

// ============================================================
// canClearFlagshipThreats.js — job: decide whether this turn's AP can eliminate every flagship threat.
// Owner: aiThreatQueries.js. Holds no state.
// ============================================================

const canClearFlagshipThreats = function (env, ctx){
  const mine = env.myUnits(ctx), mf = mine.find(u => u.flags.has("!flagship"));
  if (!mf) return true;
  const ths = env.spottedEnemies(ctx).filter(e => env.fpOf(e) > 0 && !e.flags.has("-attacked") && env.inRange(e, mf, e.move + Math.max(1, env.rngOf(e))));
  let ap = (ctx && ctx.ap !== undefined) ? ctx.ap : 0;
  for (let t = 0; t < ths.length; t++){
    const th = ths[t];
    const atks = mine.filter(u => !u.flags.has("-attacked") && env.fpOf(u) > 0).slice().sort((a, b) => env.fpOf(b) - env.fpOf(a));
    let need = th.hp + (th.flags.has("+shield") ? 1 : 0);
    for (let a = 0; a < atks.length; a++){
      if (ap <= 0) break;
      need -= (th.flags.has("+shield") && !env.railOf(atks[a])) ? 1 : env.fpOf(atks[a]);
      ap -= 1;
    }
    if (need > 0) return false;
  }
  return true;
};
