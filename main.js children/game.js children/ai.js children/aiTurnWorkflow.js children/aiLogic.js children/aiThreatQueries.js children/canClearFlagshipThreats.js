"use strict";

// ============================================================
// canClearFlagshipThreats.js — job: decide whether this turn's AP can eliminate every flagship threat.
// Owner: aiThreatQueries.js. Holds no state.
// ============================================================

const canClearFlagshipThreats = function (env, ctx){
  const mine = env.myUnits(ctx), mf = mine.find(u => u.flags.has("!flagship"));
  if (!mf) return true;
  const ths = env.spottedEnemies(ctx).filter(e => e.firepower > 0 && !e.flags.has("-attacked") && env.inRange(e, mf, e.move + Math.max(1, e.range)));
  let ap = (ctx && ctx.ap !== undefined) ? ctx.ap : 0;
  for (let t = 0; t < ths.length; t++){
    const th = ths[t];
    const atks = mine.filter(u => !u.flags.has("-attacked") && u.firepower > 0).slice().sort((a, b) => b.firepower - a.firepower);
    let need = th.hp + (th.flags.has("+shield") ? 1 : 0);
    for (let a = 0; a < atks.length; a++){
      if (ap <= 0) break;
      need -= (th.flags.has("+shield") && !atks[a].flags.has("#railgun")) ? 1 : atks[a].firepower;
      ap -= 1;
    }
    if (need > 0) return false;
  }
  return true;
};
