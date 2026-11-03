"use strict";

// ============================================================
// listRailgunDangerZones.js — job: list the spotted railgun enemies whose next volley would hurt the flagship.
// Owner: aiThreatQueries.js. Holds no state.
// ============================================================

const listRailgunDangerZones = function (env, ctx){
  const zs = [], mine = env.myUnits(ctx), mf = mine.find(u => u.flags.has("!flagship"));
  if (!mf) return zs;
  const sp = env.spottedEnemies(ctx), ap = (ctx && ctx.ap !== undefined) ? ctx.ap : 0;
  for (let i = 0; i < sp.length; i++){
    const e = sp[i];
    if (!e.flags.has("#railgun")) continue;
    const atks = mine.filter(u => !u.flags.has("-attacked") && u.firepower > 0).slice().sort((a, b) => b.firepower - a.firepower);
    const lim = Math.min(ap, atks.length);
    let dmg = 0;
    for (let j = 0; j < lim; j++){
      dmg += (e.flags.has("+shield") && !atks[j].flags.has("#railgun")) ? 1 : atks[j].firepower;
    }
    if (dmg >= e.hp + (e.flags.has("+shield") ? 1 : 0)) continue;
    zs.push({ enemy: e, radius: e.move + Math.max(1, e.range) });
  }
  return zs;
};
