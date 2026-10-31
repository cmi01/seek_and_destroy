"use strict";

// ============================================================
// aiThreatQueries.js — job: answer the AI's danger queries over spotted enemies (railgun danger zones, flagship-threat clearance).
// Owner: ai/aiLogic.js. Holds no state unless it is a core.
// ============================================================
(() => {
  function railgunDangerZones(env, ctx){
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
  }

  function canEliminateAllFlagshipThreats(env, ctx){
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
  }

  AILogic._register("threatQueries", {
    railgunDangerZones,
    canEliminateAllFlagshipThreats
  });
})();
