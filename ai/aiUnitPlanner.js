"use strict";

// ============================================================
// AI UNIT PLANNER — 1-AP, 2-AP & 3-AP lookahead plan search per unit.
// Privately registered with its parent (aiLogic.js); exposes zero globals.
// ============================================================
(() => {
  function buildUnitPlan(env, ctx, u, unitRoll) {
    if (!u || u.hp <= 0) return null;
    const tn = env.tuning(ctx), cfg = env.cfg(ctx), sc = cfg.seqCost, plans = [];
    const pg = (env.priorities(ctx) && env.priorities(ctx).planGeneration) || {};
    const smCfg = pg.singleMove || {}, msCfg = pg.compositeMoveShoot || {};
    const mcCfg = pg.compositeMoveCapture || {}, smsCfg = pg.compositeShootMoveShoot || {};
    const mfCfg = pg.mistakeFilter || {};
    const sp = env.spottedEnemies(ctx), bg = (ctx && ctx.ap !== undefined) ? ctx.ap : 0;
    if (bg >= 1){
      for (let i = 0; i < sp.length; i++){
        const p = sp[i];
        if (env.canShoot(ctx, u, p)){
          plans.push({ unitId: u.id, apCost: 1, steps: [{ kind: "SHOOT", target: p }], score: env.scoreShoot(ctx, u, p) });
        }
        if (env.canCapture(ctx, u, p)){
          plans.push({ unitId: u.id, apCost: 1, steps: [{ kind: "CAPTURE", target: p }], score: env.scoreCapture(ctx, u, p) });
        }
      }
      if (env.canShield(ctx, u, u)){
        plans.push({ unitId: u.id, apCost: 1, steps: [{ kind: "SHIELD" }], score: env.scoreShield(ctx, u) });
      }
      if (!u.flags.has("-moved") && u.move > 0){
        const flagCap = smCfg.flagshipReachableCap !== undefined ? smCfg.flagshipReachableCap : 96;
        const stdCap = smCfg.standardReachableCap !== undefined ? smCfg.standardReachableCap : 12;
        const fbCount = smCfg.flagshipLeastThreatFallbackCount !== undefined ? smCfg.flagshipLeastThreatFallbackCount : 3;
        let cs = env.reachableCells(ctx, u, u.flags.has("!flagship") ? flagCap : stdCap);
        if (u.flags.has("!flagship")){
          const eh = u.hp + (u.flags.has("+shield") ? 1 : 0);
          const sf = cs.filter(d => env.threatAt(ctx, u, d) < eh);
          cs = sf.length > 0
            ? sf
            : env.reachableCells(ctx, u, flagCap).slice().sort((a, b) => env.threatAt(ctx, u, a) - env.threatAt(ctx, u, b)).slice(0, fbCount);
        }
        // A bare MOVE plan that ends within the mover's weapon range of a
        // spotted enemy attacks nothing this turn — penalize idling in
        // firing range. Paired attacks arrive as composite MOVE->SHOOT
        // plans, which are not penalized.
        const noAtkPen = smCfg.moveInRangeNoAttackPenalty !== undefined ? smCfg.moveInRangeNoAttackPenalty : 0;
        for (let i = 0; i < cs.length; i++){
          let score = env.scoreMove(ctx, u, cs[i]);
          if (noAtkPen > 0 && u.firepower > 0 && u.range > 0){
            for (let j = 0; j < sp.length; j++){
              if (env.inRange(cs[i], sp[j], u.range)){ score -= noAtkPen; break; }
            }
          }
          plans.push({ unitId: u.id, apCost: 1, steps: [{ kind: "MOVE", to: cs[i] }], score });
        }
      }
    }
    const msDepth = msCfg.minLookaheadDepth !== undefined ? msCfg.minLookaheadDepth : 2;
    if (bg >= tn.compositeApCost && cfg.lookaheadDepth >= msDepth && !u.flags.has("-moved") && !u.flags.has("-attacked") && u.firepower > 0 && u.move > 0){
      const ds = env.reachableCells(ctx, u, msCfg.maxDestinations !== undefined ? msCfg.maxDestinations : tn.moveShootMaxDests);
      const maxT = msCfg.maxTargets !== undefined ? msCfg.maxTargets : tn.maxTargets;
      const ts = sp.slice().sort((a, b) => env.targetStrategicValue(ctx, b, u, "SHOOT") - env.targetStrategicValue(ctx, a, u, "SHOOT")).slice(0, maxT);
      for (let i = 0; i < ds.length; i++){
        const d = ds[i];
        if (u.flags.has("!flagship") && env.threatAt(ctx, u, d) >= u.hp + (u.flags.has("+shield") ? 1 : 0)) continue;
        for (let j = 0; j < ts.length; j++){
          const p = ts[j];
          if (env.canShoot(ctx, u, p)) continue;
          if (!env.shootableFrom(ctx, u, d, p)) continue;
          plans.push({
            unitId: u.id,
            apCost: tn.compositeApCost,
            steps: [{ kind: "MOVE", to: d }, { kind: "SHOOT", target: p }],
            score: env.scoreMove(ctx, u, d) + env.scoreShoot(ctx, u, p, { from: d }) - sc + (env.isKillShot(u, p) ? tn.killBonus : 0)
          });
        }
      }
    }
    const mcDepth = mcCfg.minLookaheadDepth !== undefined ? mcCfg.minLookaheadDepth : 2;
    if (bg >= tn.compositeApCost && cfg.lookaheadDepth >= mcDepth && !u.flags.has("-moved") && u.move > 0 && u.flags.has("#space marines") && !u.flags.has("-sent boarding party")){
      const ds = env.reachableCells(ctx, u, mcCfg.reachableCap !== undefined ? mcCfg.reachableCap : 16);
      const capRng = mcCfg.captureRange !== undefined ? mcCfg.captureRange : 1.0;
      for (let i = 0; i < ds.length; i++){
        const d = ds[i];
        for (let j = 0; j < sp.length; j++){
          const p = sp[j];
          if (p.team === u.team || p.flags.has("!flagship") || !env.isUnitSpottedByTeam(ctx, p, u.team) || !env.inRange(d, p, capRng)) continue;
          plans.push({
            unitId: u.id,
            apCost: tn.compositeApCost,
            steps: [{ kind: "MOVE", to: d }, { kind: "CAPTURE", target: p }],
            score: env.scoreMove(ctx, u, d) + env.scoreCapture(ctx, u, p) - sc
          });
        }
      }
    }
    const smsMinBg = smsCfg.minBudget !== undefined ? smsCfg.minBudget : 3;
    const smsDepth = smsCfg.minLookaheadDepth !== undefined ? smsCfg.minLookaheadDepth : 2;
    if (bg >= smsMinBg && cfg.lookaheadDepth >= smsDepth && !u.flags.has("-moved") && !u.flags.has("-attacked") && u.firepower > 0 && u.move > 0){
      const smsMaxT = smsCfg.maxTargets !== undefined ? smsCfg.maxTargets : tn.maxTargets;
      const smsCap = smsCfg.reachableCap !== undefined ? smsCfg.reachableCap : 12;
      const smsAp = smsCfg.apCost !== undefined ? smsCfg.apCost : 3;
      const smsSeqMult = smsCfg.seqCostMultiplier !== undefined ? smsCfg.seqCostMultiplier : 2;
      for (let i = 0; i < sp.length && i < smsMaxT; i++){
        const p1 = sp[i];
        if (!env.canShoot(ctx, u, p1)) continue;
        const ds = env.reachableCells(ctx, u, smsCap);
        for (let d = 0; d < ds.length; d++){
          const dst = ds[d];
          for (let j = 0; j < sp.length && j < smsMaxT; j++){
            const p2 = sp[j];
            if (p2.id === p1.id || !env.shootableFrom(ctx, u, dst, p2)) continue;
            plans.push({
              unitId: u.id,
              apCost: smsAp,
              steps: [{ kind: "SHOOT", target: p1 }, { kind: "MOVE", to: dst }, { kind: "SHOOT", target: p2 }],
              score: env.scoreShoot(ctx, u, p1) + env.scoreMove(ctx, u, dst) + env.scoreShoot(ctx, u, p2) - sc * smsSeqMult
            });
          }
        }
      }
    }
    if (cfg.lookaheadDepth >= 2){
      for (let i = 0; i < plans.length; i++) plans[i].score += env.enduranceBonus(ctx, u, plans[i]);
    }
    if (!plans.length) return null;
    plans.sort((a, b) => b.score - a.score);
    const rv = (typeof unitRoll === "number") ? unitRoll : (ctx && typeof ctx.roll === "number" ? ctx.roll : 1);
    const critFloor = mfCfg.criticalScoreFloor !== undefined ? mfCfg.criticalScoreFloor : 5000;
    const fbIdx = mfCfg.fallbackPlanIndex !== undefined ? mfCfg.fallbackPlanIndex : 1;
    if (plans.length > 1 && rv < cfg.mistakeChance){
      const nc = plans.filter(p => p.score < critFloor);
      if (nc.length > fbIdx) return nc[fbIdx];
    }
    return plans[0];
  }
  AILogic._register("unitPlanner", buildUnitPlan);
})();
