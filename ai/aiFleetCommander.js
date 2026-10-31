"use strict";

// ============================================================
// aiFleetCommander.js — job: decide flagship survival reflexes and warp-in actions.
// Owner: ai/aiLogic.js. Holds no state unless it is a core.
// ============================================================
(() => {
  function chooseReinforcement(env, ctx){
    const cp = env.priorities(ctx).reinforcement.counterPicks;
    const cr = (ctx && ctx.credits && ctx.credits[2]) || 0;
    const sp = (ctx && ctx.shipSpecs) || {};
    const gap = env.fleetGap(ctx);
    const aff = n => sp[n] && sp[n].flags.includes("buyable") && sp[n].cost <= cr;
    if (gap.flagshipThreatened && aff(cp.flagshipThreatened)) return cp.flagshipThreatened;
    if (gap.lacksScout && aff(cp.lacksScout)) return cp.lacksScout;
    if (gap.lacksLongRange && aff(cp.lacksLongRange)) return cp.lacksLongRange;
    if (gap.lacksBoarding && aff(cp.lacksBoarding)) return cp.lacksBoarding;
    const ord = env.doctrinePurchaseOrder(ctx && ctx.aiDoctrine).filter(aff);
    if (ord.length > 0) return ord[0];
    const all = Object.keys(sp).filter(aff).sort((a, b) => sp[b].cost - sp[a].cost);
    return all.length > 0 ? all[0] : null;
  }

  function selectFleetActionPlan(env, ctx) {
    const sCtx = ctx;
    const nb = (sCtx && sCtx.lastSeenEnemies) ? new Map(sCtx.lastSeenEnemies) : new Map();
    const mp = (env.priorities(sCtx) && env.priorities(sCtx).masterPreChecks) || {};
    const fsCfg = mp.flagshield || {}, asCfg = mp.alphaStrikeDetection || {}, flCfg = mp.fleeWhenOutgunned || {};
    const pg = (env.priorities(sCtx) && env.priorities(sCtx).planGeneration) || {};
    const rf = (env.priorities(sCtx) && env.priorities(sCtx).reinforcement) || {};
    const mine = env.myUnits(sCtx), fl = mine.find(u => u.flags.has("!flagship"));
    const ap = (sCtx && sCtx.ap !== undefined) ? sCtx.ap : 0;
    const pt = (sCtx && sCtx.aiScoreTrace) ? sCtx.aiScoreTrace.slice() : [];
    if (fsCfg.enabled !== false && fl && !fl.flags.has("+shield") && !fl.flags.has("-shielded") && fl.flags.has("#shield generator") && ap > 0){
      if (env.threatAt(sCtx, fl, { x: fl.x, y: fl.y }) > 0 || env.projectedThreatAt(sCtx, fl, { x: fl.x, y: fl.y }) > 0){
        return {
          plan: {
            unitId: fl.id,
            apCost: fsCfg.apCost !== undefined ? fsCfg.apCost : 1,
            score: fsCfg.forcedScore !== undefined ? fsCfg.forcedScore : 9999,
            steps: [{ kind: "SHIELD" }]
          },
          nextBeliefs: nb,
          aiEmergencyMode: Boolean(sCtx.aiEmergencyMode),
          aiScoreTrace: pt
        };
      }
    }
    let em = false;
    if (asCfg.enabled !== false && fl){
      const shHp = asCfg.shieldEffectiveHpBonus !== undefined ? asCfg.shieldEffectiveHpBonus : 1;
      const inc = env.spottedEnemies(sCtx)
        .filter(p => !p.flags.has("-attacked") && p.firepower > 0 && env.canShoot(sCtx, p, fl))
        .reduce((s, p) => s + p.firepower, 0);
      if (inc >= fl.hp + (fl.flags.has("+shield") ? shHp : 0)) em = true;
    }
    if (flCfg.enabled !== false && fl && !fl.flags.has("-moved") && !env.canEliminateAllFlagshipThreats(sCtx)){
      const rc = env.findSafeRetreatCell(sCtx, fl);
      const retScore = flCfg.retreatScore !== undefined ? flCfg.retreatScore : 8000;
      const minShotAp = flCfg.minApForShootBeforeRetreat !== undefined ? flCfg.minApForShootBeforeRetreat : 2;
      if (rc){
        if (ap >= minShotAp && !fl.flags.has("-attacked") && fl.firepower > 0){
          const ts = env.spottedEnemies(sCtx)
            .filter(e => !e.flags.has("+shield") && env.canShoot(sCtx, fl, e))
            .slice()
            .sort((a, b) => env.roleBaseValue(sCtx, b) - env.roleBaseValue(sCtx, a));
          if (ts.length > 0){
            return {
              plan: {
                unitId: fl.id,
                apCost: flCfg.shootThenMoveApCost !== undefined ? flCfg.shootThenMoveApCost : 2,
                score: retScore,
                steps: [{ kind: "SHOOT", target: { id: ts[0].id, x: ts[0].x, y: ts[0].y } }, { kind: "MOVE", to: rc }]
              },
              nextBeliefs: nb,
              aiEmergencyMode: em,
              aiScoreTrace: pt
            };
          }
        }
        return {
          plan: {
            unitId: fl.id,
            apCost: flCfg.singleMoveApCost !== undefined ? flCfg.singleMoveApCost : 1,
            score: retScore,
            steps: [{ kind: "MOVE", to: rc }]
          },
          nextBeliefs: nb,
          aiEmergencyMode: em,
          aiScoreTrace: pt
        };
      }
    }
    let best = null;
    const tr = [], rolls = (sCtx && Array.isArray(sCtx.rolls)) ? sCtx.rolls : [];
    for (let i = 0; i < mine.length; i++){
      const u = mine[i];
      const pl = env.planUnitTurn(sCtx, u, (i < rolls.length) ? rolls[i] : sCtx.roll);
      if (!pl || pl.apCost > ap) continue;
      tr.push({ unit: u.type, unitId: u.id, score: Math.round(pl.score), steps: pl.steps.map(s => s.kind).join(">") });
      if (!best || pl.score > best.score) best = pl;
    }
    tr.sort((a, b) => b.score - a.score);
    const maxTrace = (pg.trace && pg.trace.maxEntries !== undefined) ? pg.trace.maxEntries : 5;
    const st = tr.slice(0, maxTrace);
    const loci = env.warpLoci(sCtx), ft = env.fleetGap(sCtx).flagshipThreatened;
    const cr2 = (sCtx && sCtx.credits && sCtx.credits[2]) || 0;
    const sp = (sCtx && sCtx.shipSpecs) || env.shipSpecs || {};
    const minCr = rf.minCreditsForWarpCheck !== undefined ? rf.minCreditsForWarpCheck : 15;
    const minAp = rf.minApForWarpCheck !== undefined ? rf.minApForWarpCheck : 1;
    const compThresh = rf.competingPlanScoreThreshold !== undefined ? rf.competingPlanScoreThreshold : 350;
    if (loci.length > 0 && cr2 >= minCr && ap >= minAp && (ft || !best || best.score < compThresh)){
      const pick = chooseReinforcement(env, sCtx);
      if (pick && sp[pick]){
        const spec = sp[pick];
        const bl = loci.slice().sort((a, b) => env.getValidWarpCells(sCtx, b.unit, b.radius).length - env.getValidWarpCells(sCtx, a.unit, a.radius).length)[0];
        const hasCapitalLocus = Boolean(bl && bl.unit && bl.unit.flags && bl.unit.flags.has("#capital ship"));
        if ((hasCapitalLocus || !best) && cr2 >= Math.ceil(spec.cost * bl.costMult)){
          const ftScore = rf.flagshipThreatenedWarpScore !== undefined ? rf.flagshipThreatenedWarpScore : 400;
          const stdBase = rf.standardWarpBaseScore !== undefined ? rf.standardWarpBaseScore : 120;
          const stdMult = rf.standardWarpCostMultiplier !== undefined ? rf.standardWarpCostMultiplier : 2.0;
          const ws = ft ? ftScore : stdBase + spec.cost * stdMult;
          if (!best || ws > best.score){
            best = { unitId: bl.unit.id, apCost: 1, score: ws, steps: [{ kind: "WARP", locus: { id: bl.unit.id, x: bl.unit.x, y: bl.unit.y }, shipType: pick, radius: bl.radius, costMult: bl.costMult }] };
          }
        }
      }
    }
    return { plan: best, nextBeliefs: nb, aiEmergencyMode: em, aiScoreTrace: st };
  }
  AILogic._register("fleetCommander", selectFleetActionPlan);
})();
