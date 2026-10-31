"use strict";

// ============================================================
// aiThreatScorer.js — job: score threats and candidate moves and shots.
// Owner: ai/aiLogic.js. Holds no state unless it is a core.
// ============================================================
(() => {

  function threatValue(env, ctx, enemy, myUnit){
    if (!enemy || !myUnit) return 0;
    const te = (env.priorities(ctx) && env.priorities(ctx).threatEvaluation) || {};
    let t = 0;
    if (enemy.firepower > 0 && !enemy.flags.has("-attacked") && env.canShoot(ctx, enemy, myUnit)){
      t += enemy.firepower * (te.directFirepowerMultiplier !== undefined ? te.directFirepowerMultiplier : 14);
    }
    if (enemy.flags.has("#railgun") && myUnit.flags.has("+shield")) t += (te.railgunVsShieldBonus !== undefined ? te.railgunVsShieldBonus : 60);
    if (enemy.flags.has("#space marines") && myUnit.cost >= (te.spaceMarinesTargetCostMin !== undefined ? te.spaceMarinesTargetCostMin : 25)){
      t += (te.spaceMarinesHighCostBonus !== undefined ? te.spaceMarinesHighCostBonus : 80);
    }
    if (enemy.flags.has("!flagship")) t += (te.enemyFlagshipThreatOffset !== undefined ? te.enemyFlagshipThreatOffset : -40);
    return t;
  }

  function threatAt(env, ctx, u, dest){
    const te = (env.priorities(ctx) && env.priorities(ctx).threatEvaluation) || {};
    const directMult = te.directFirepowerMultiplier !== undefined ? te.directFirepowerMultiplier : 14;
    const projMult = te.projectedFirepowerMultiplier !== undefined ? te.projectedFirepowerMultiplier : 14;
    const projDisc = te.projectedThreatDiscount !== undefined ? te.projectedThreatDiscount : 0.4;
    const rgShield = te.railgunVsShieldBonus !== undefined ? te.railgunVsShieldBonus : 60;
    const rgProj = te.projectedRailgunBonus !== undefined ? te.projectedRailgunBonus : 40;
    const bDist = te.beliefThreatMaxDistance !== undefined ? te.beliefThreatMaxDistance : 6;
    const bMult = te.beliefThreatConfidenceMultiplier !== undefined ? te.beliefThreatConfidenceMultiplier : 15;
    const sp = env.spottedEnemies(ctx);
    let t = 0;
    for (let i = 0; i < sp.length; i++){
      const p = sp[i];
      if (p.firepower <= 0 || p.flags.has("-attacked")) continue;
      if (env.inRange(p, dest, Math.max(1, p.range)) && env.hasLineOfSight(ctx, p.x, p.y, dest.x, dest.y, "WEAPON")){
        t += p.firepower * directMult;
        if (p.flags.has("#railgun") && u.flags.has("+shield")) t += rgShield;
      } else if (env.inRange(p, dest, p.move + Math.max(1, p.range))){
        t += p.firepower * projMult * projDisc;
        if (p.flags.has("#railgun")) t += rgProj;
      }
    }
    const bs = env.activeBeliefs(ctx);
    for (let i = 0; i < bs.length; i++){
      if (env.dist(dest, bs[i]) <= bDist) t += bMult * bs[i].confidence;
    }
    return t;
  }

  function projectedThreatAt(env, ctx, u, dest){
    const te = (env.priorities(ctx) && env.priorities(ctx).threatEvaluation) || {};
    const projMult = te.projectedFirepowerMultiplier !== undefined ? te.projectedFirepowerMultiplier : 14;
    const projDisc = te.projectedThreatDiscount !== undefined ? te.projectedThreatDiscount : 0.4;
    const rgProj = te.projectedRailgunBonus !== undefined ? te.projectedRailgunBonus : 40;
    const sp = env.spottedEnemies(ctx);
    let t = 0;
    for (let i = 0; i < sp.length; i++){
      const p = sp[i];
      if (p.firepower > 0 && env.dist(dest, p) <= p.move + Math.max(1, p.range)){
        t += p.firepower * projMult * projDisc;
        if (p.flags.has("#railgun")) t += rgProj;
      }
    }
    return t;
  }

  function roleBaseValue(env, ctx, target){
    const rv = (env.priorities(ctx) && env.priorities(ctx).roleValuation) || {};
    if (target.flags.has("!flagship")) return rv.flagshipBaseValue !== undefined ? rv.flagshipBaseValue : 600;
    const bc = target.cost * (rv.costMultiplier !== undefined ? rv.costMultiplier : 4);
    let v = bc + (rv.defaultBaseOffset !== undefined ? rv.defaultBaseOffset : 15);
    if (target.flags.has("#capital ship")) v = bc + (rv.capitalShipBaseOffset !== undefined ? rv.capitalShipBaseOffset : 60);
    if (target.scan >= (rv.scannerScanThreshold !== undefined ? rv.scannerScanThreshold : 5)){
      v = Math.max(v, bc + (rv.scannerBaseOffset !== undefined ? rv.scannerBaseOffset : 70));
    }
    if (target.flags.has("#space marines")) v = Math.max(v, bc + (rv.spaceMarinesBaseOffset !== undefined ? rv.spaceMarinesBaseOffset : 55));
    if (target.flags.has("#railgun")) v = Math.max(v, bc + (rv.railgunBaseOffset !== undefined ? rv.railgunBaseOffset : 50));
    const hf = 1 + (1 - target.hp / target.maxHp) * (rv.missingHpBonusMultiplier !== undefined ? rv.missingHpBonusMultiplier : 0.5);
    const uf = target.flags.has("-attacked")
      ? (rv.exhaustedAttackerUrgencyMultiplier !== undefined ? rv.exhaustedAttackerUrgencyMultiplier : 0.8)
      : (rv.readyAttackerUrgencyMultiplier !== undefined ? rv.readyAttackerUrgencyMultiplier : 1.3);
    v = v * hf * uf;
    if (target.flags.has("#space marines")){
      const maxD = rv.boardingCounterProximityMaxDist !== undefined ? rv.boardingCounterProximityMaxDist : 1.5;
      if (env.myUnits(ctx).some(a => !a.flags.has("!flagship") && env.dist(target, a) <= maxD)){
        v += (rv.boardingCounterUrgencyBonus !== undefined ? rv.boardingCounterUrgencyBonus : 300);
      }
    }
    return v;
  }

  function nebulaRiskAt(env, ctx, dest){
    const tn = env.tuning(ctx), bs = env.activeBeliefs(ctx);
    const te = (env.priorities(ctx) && env.priorities(ctx).threatEvaluation) || {};
    const proxR = te.nebulaBeliefProximityRadius !== undefined ? te.nebulaBeliefProximityRadius : 2;
    const confW = te.nebulaBeliefConfidenceWeight !== undefined ? te.nebulaBeliefConfidenceWeight : 0.25;
    const adjR = te.nebulaAdjacentSearchRadius !== undefined ? te.nebulaAdjacentSearchRadius : 1;
    let p = 0;
    for (let i = 0; i < bs.length; i++){
      if (env.dist(dest, bs[i]) <= proxR) p += bs[i].confidence * confW;
    }
    for (let dx = -adjR; dx <= adjR; dx++){
      for (let dy = -adjR; dy <= adjR; dy++){
        const nx = dest.x + dx, ny = dest.y + dy;
        if (env.inBounds(ctx, nx, ny) && env.terrainAt(ctx, nx, ny) === "NEBULA" && !env.isCellVisibleToTeam(ctx, nx, ny, 2)){
          p += tn.nebulaBaseP + tn.nebulaVectorP;
        }
      }
    }
    return Math.min(1, p);
  }

  function railgunKillPriority(env, enemy, myFlag){
    if (!enemy || !enemy.flags.has("#railgun") || !myFlag) return 0;
    const tp = (env.priorities() && env.priorities().targetPriorities && env.priorities().targetPriorities.railgunKillPriorityBands) || {};
    const d = env.dist(enemy, myFlag), dd = enemy.move + Math.max(1, enemy.range);
    if (d <= dd) return tp.inDangerRadiusBonus !== undefined ? tp.inDangerRadiusBonus : 1000;
    if (d <= dd + (tp.nearBandOffset !== undefined ? tp.nearBandOffset : 4)) return tp.nearBandBonus !== undefined ? tp.nearBandBonus : 600;
    if (d <= dd + (tp.midBandOffset !== undefined ? tp.midBandOffset : 8)) return tp.midBandBonus !== undefined ? tp.midBandBonus : 300;
    return tp.farBandBonus !== undefined ? tp.farBandBonus : 100;
  }

  function targetStrategicValue(env, ctx, target, attacker, actionKind, opts){
    const tn = env.tuning(ctx), o = opts || {}, us = (ctx && ctx.units) || [];
    const tp = (env.priorities(ctx) && env.priorities(ctx).targetPriorities) || {};
    const capCfg = tp.capture || {};
    const kcCfg = tp.killConfirmation || {};
    const shCfg = tp.shieldInteraction || {};
    const fdCfg = tp.flagshipDefense || {};
    const seCfg = tp.scannerElimination || {};
    let sc = roleBaseValue(env, ctx, target);
    if (target.firepower >= (tp.highFirepowerThreshold !== undefined ? tp.highFirepowerThreshold : 7)){
      sc += (tp.highFirepowerBonus !== undefined ? tp.highFirepowerBonus : 35);
    }
    if (actionKind === "CAPTURE"){
      sc += target.cost * (capCfg.costMultiplier !== undefined ? capCfg.costMultiplier : 4.0) + (capCfg.baseBonus !== undefined ? capCfg.baseBonus : 40);
      const pf = us.find(x => x.hp > 0 && x.team === 1 && x.flags.has("!flagship"));
      if (pf) sc -= (capCfg.enemyFlagshipProximityPenaltyPerCell !== undefined ? capCfg.enemyFlagshipProximityPenaltyPerCell : 60) * Math.min(capCfg.enemyFlagshipDistanceCap !== undefined ? capCfg.enemyFlagshipDistanceCap : 6, env.dist(target, pf));
      return sc;
    }
    const sh = target.flags.has("+shield"), rg = attacker && attacker.flags.has("#railgun");
    const shEffDmg = kcCfg.shieldedNonRailgunEffectiveDamage !== undefined ? kcCfg.shieldedNonRailgunEffectiveDamage : 1;
    const ed = (sh && !rg) ? shEffDmg : (attacker ? attacker.firepower : 0);
    const res = o.reserved || 0;
    const hasFocusHistory = Boolean(o.hasFocusHistory);
    if (target.hp <= ed){
      sc += (res === 0)
        ? (target.cost * (kcCfg.unreservedKillCostMultiplier !== undefined ? kcCfg.unreservedKillCostMultiplier : 6.0) + (kcCfg.unreservedKillBaseBonus !== undefined ? kcCfg.unreservedKillBaseBonus : 120))
        : tn.finisherBonus;
      if (hasFocusHistory && res === 0) sc += tn.finisherBonus;
    } else if (hasFocusHistory){
      sc += tn.finisherBonus;
    }
    const mine = env.myUnits(ctx);
    const stripMaxFp = shCfg.lowFirepowerStripperMaxFp !== undefined ? shCfg.lowFirepowerStripperMaxFp : 3;
    if (sh){
      if (rg) sc += (shCfg.railgunBypassBonus !== undefined ? shCfg.railgunBypassBonus : 110);
      else if (attacker && attacker.firepower <= stripMaxFp) sc += (shCfg.lowFirepowerStripperBonus !== undefined ? shCfg.lowFirepowerStripperBonus : 160);
      else {
        const hs = mine.some(a => attacker && a.id !== attacker.id && !a.flags.has("-attacked") && a.firepower > 0 && a.firepower <= stripMaxFp && !a.flags.has("#railgun") && env.canShoot(ctx, a, target));
        if (hs && ((ctx && ctx.ap) || 0) >= (shCfg.comboStripperMinAp !== undefined ? shCfg.comboStripperMinAp : 2)){
          sc += (shCfg.comboWithStripperAvailableBonus !== undefined ? shCfg.comboWithStripperAvailableBonus : 200);
        } else if (hs){
          sc -= (shCfg.waitForStripperPenalty !== undefined ? shCfg.waitForStripperPenalty : 140);
        }
      }
    }
    const mf = mine.find(u => u.flags.has("!flagship"));
    if (mf) sc += threatValue(env, ctx, target, mf) * (fdCfg.threatToFlagshipWeight !== undefined ? fdCfg.threatToFlagshipWeight : 0.6);
    if (mf && target.flags.has("#railgun")) sc += railgunKillPriority(env, target, mf);
    if (mf && env.railgunDangerZones(ctx).length === 0){
      const es = env.effectiveScan(ctx, target);
      if (env.dist(target, mf) <= es){
        sc += (seCfg.baseSpottingBonus !== undefined ? seCfg.baseSpottingBonus : 200) + es * (seCfg.perEffectiveScanBonus !== undefined ? seCfg.perEffectiveScanBonus : 30);
        if (target.type === (seCfg.probeTypeName || "Probe")) sc += (seCfg.probeExtraBonus !== undefined ? seCfg.probeExtraBonus : 250);
      }
    }
    if (mf && env.canShoot(ctx, target, mf)){
      const shHp = fdCfg.flagshipShieldEffectiveHpBonus !== undefined ? fdCfg.flagshipShieldEffectiveHpBonus : 1;
      if (target.firepower >= mf.hp + (mf.flags.has("+shield") ? shHp : 0)){
        sc += (fdCfg.lethalToFlagshipOverrideBonus !== undefined ? fdCfg.lethalToFlagshipOverrideBonus : 500);
      }
    }
    if (res >= target.hp + ((sh && !rg) ? shEffDmg : 0)) sc -= tn.overkillPenalty;
    return sc;
  }

  function scoreShoot(env, ctx, u, target, opts){
    const o = opts || {}, rs = (ctx && ctx.reservations) || null, r = rs ? rs.get(target.id) : null;
    const hasFocusHistory = Boolean(r && Array.isArray(r.killers) && r.killers.length > 0);
    return targetStrategicValue(env, ctx, target, u, "SHOOT", {
      reserved: r ? r.committedDmg : 0,
      hasFocusHistory,
      from: o.from
    });
  }

  function scoreCapture(env, ctx, u, target){
    return targetStrategicValue(env, ctx, target, u, "CAPTURE");
  }

  function scoreShield(env, ctx, u){
    const spCfg = (env.priorities(ctx) && env.priorities(ctx).shieldPriorities) || {};
    const buf = spCfg.threatRangeBuffer !== undefined ? spCfg.threatRangeBuffer : 1.0;
    const th = env.spottedEnemies(ctx).some(p => p.firepower > 0 && !p.flags.has("-attacked") && env.inRange(p, u, Math.max(1, p.range + buf)) && env.hasLineOfSight(ctx, p.x, p.y, u.x, u.y, "WEAPON"));
    const base = u.flags.has("!flagship")
      ? (spCfg.flagshipBaseScore !== undefined ? spCfg.flagshipBaseScore : 580)
      : u.cost * (spCfg.hullCostMultiplier !== undefined ? spCfg.hullCostMultiplier : 3.2);
    return base + (th ? (spCfg.threatenedBonus !== undefined ? spCfg.threatenedBonus : 90) : (spCfg.unthreatenedBonus !== undefined ? spCfg.unthreatenedBonus : 10));
  }

  function scoreMove(env, ctx, u, dest){
    const tn = env.tuning(ctx), W = env.doctrineWeights(ctx && ctx.aiDoctrine);
    const mp = (env.priorities(ctx) && env.priorities(ctx).movementPriorities) || {};
    const kb = mp.killBand || {}, apCfg = mp.approach || {}, aeCfg = mp.activeEscort || {};
    const trCfg = mp.tieredRetreat || {}, sbCfg = mp.standoffBand || {}, nbCfg = mp.nebulaSearchAndCover || {};
    const wgCfg = mp.warpLocusGuard || {}, hzCfg = mp.hazardsAndConstraints || {};
    const sacCfg = (env.priorities(ctx) && env.priorities(ctx).preservation && env.priorities(ctx).preservation.sacrificeOrdering) || {};
    const sp = env.spottedEnemies(ctx), mine = env.myUnits(ctx);
    const sr = (ctx && ctx.spawnRadius !== undefined) ? ctx.spawnRadius : env.spawnRadius;
    let s = 0;
    if (!u.flags.has("-attacked") && u.firepower > 0){
      for (let i = 0; i < sp.length; i++){
        if (env.shootableFrom(ctx, u, dest, sp[i])){
          s += (kb.baseBonus !== undefined ? kb.baseBonus : 95) * W.aggression;
          break;
        }
      }
    }
    const minBeliefW = apCfg.minBeliefConfidenceWeight !== undefined ? apCfg.minBeliefConfidenceWeight : 0.2;
    let objs = sp.length
      ? sp.map(p => ({ x: p.x, y: p.y, flag: p.flags.has("!flagship"), w: 1 }))
      : env.activeBeliefs(ctx).map(b => ({ x: b.x, y: b.y, flag: false, w: Math.max(minBeliefW, b.confidence) }));
    if (!objs.length){
      objs = ((ctx && ctx.units) || []).filter(p => p.hp > 0 && p.team === 1).map(p => ({ x: p.x, y: p.y, flag: p.flags.has("!flagship"), w: 1 }));
    }
    if (objs.length){
      let ba = Infinity, bb = Infinity, bf = false;
      for (let i = 0; i < objs.length; i++){
        const ob = objs[i], da = env.dist(dest, ob) * ob.w, db = env.dist(u, ob) * ob.w;
        if (da < ba){ ba = da; bb = db; bf = ob.flag; }
      }
      const distMult = apCfg.distanceDeltaMultiplier !== undefined ? apCfg.distanceDeltaMultiplier : 22;
      const flagMult = apCfg.enemyFlagshipObjectiveMultiplier !== undefined ? apCfg.enemyFlagshipObjectiveMultiplier : 3;
      const stdMult = apCfg.standardObjectiveMultiplier !== undefined ? apCfg.standardObjectiveMultiplier : 1;
      s += (bb - ba) * distMult * W.aggression * (bf ? flagMult : stdMult);
    }
    const mf = mine.find(x => x.flags.has("!flagship"));
    if (mf && mf.id !== u.id && u.firepower > 0 && !u.flags.has("-attacked")){
      for (let i = 0; i < sp.length; i++){
        const th = sp[i];
        if (th.firepower > 0 && env.inRange(th, mf, th.move + Math.max(1, th.range)) && env.shootableFrom(ctx, u, dest, th)){
          s += (aeCfg.baseBonus !== undefined ? aeCfg.baseBonus : 60) * W.screen;
          break;
        }
      }
    }
    const hr = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    if (hr <= (trCfg.triggerHpRatioMax !== undefined ? trCfg.triggerHpRatioMax : 0.75) && sp.length){
      let nb = Infinity, na = Infinity;
      for (let i = 0; i < sp.length; i++){
        const db = env.dist(u, sp[i]), da = env.dist(dest, sp[i]);
        if (db < nb) nb = db;
        if (da < na) na = da;
      }
      const rm = hr <= (trCfg.criticalHpRatioMax !== undefined ? trCfg.criticalHpRatioMax : 0.25)
        ? (trCfg.criticalRetreatMultiplier !== undefined ? trCfg.criticalRetreatMultiplier : 80)
        : (hr <= (trCfg.moderateHpRatioMax !== undefined ? trCfg.moderateHpRatioMax : 0.50)
          ? (trCfg.moderateRetreatMultiplier !== undefined ? trCfg.moderateRetreatMultiplier : 40)
          : (trCfg.lightRetreatMultiplier !== undefined ? trCfg.lightRetreatMultiplier : 20));
      const scale = W.aggression < (trCfg.defensiveAggressionThreshold !== undefined ? trCfg.defensiveAggressionThreshold : 1)
        ? (trCfg.defensiveDoctrineScale !== undefined ? trCfg.defensiveDoctrineScale : 1.2)
        : (trCfg.aggressiveDoctrineScale !== undefined ? trCfg.aggressiveDoctrineScale : 0.6);
      s += (na - nb) * rm * scale;
    }
    if (u.range > 0 && u.firepower > 0 && sp.length){
      const idl = Math.max(sbCfg.minIdealRange !== undefined ? sbCfg.minIdealRange : 1, u.range - (sbCfg.idealRangeInset !== undefined ? sbCfg.idealRangeInset : 0.5));
      let nr = Infinity;
      for (let i = 0; i < sp.length; i++){
        const d = env.dist(dest, sp[i]);
        if (d < nr) nr = d;
      }
      if (Math.abs(nr - idl) < (sbCfg.bandTolerance !== undefined ? sbCfg.bandTolerance : 1)){
        s += (sbCfg.baseBonus !== undefined ? sbCfg.baseBonus : 25) * W.standoff;
      }
    }
    let an = 0;
    for (let dx = -1; dx <= 1; dx++){
      for (let dy = -1; dy <= 1; dy++){
        const nx = dest.x + dx, ny = dest.y + dy;
        if (env.inBounds(ctx, nx, ny) && env.terrainAt(ctx, nx, ny) === "NEBULA" && !env.isCellVisibleToTeam(ctx, nx, ny, 2)) an++;
      }
    }
    s += an * (nbCfg.unspottedAdjacentNebulaBonus !== undefined ? nbCfg.unspottedAdjacentNebulaBonus : 20);
    const mc = mine.find(x => x.flags.has("#capital ship"));
    if (mc && env.dist(dest, mc) <= sr) s += (wgCfg.baseBonus !== undefined ? wgCfg.baseBonus : 15) * W.screen;
    if (env.terrainAt(ctx, dest.x, dest.y) === "NEBULA") s += (nbCfg.destinationInNebulaBonus !== undefined ? nbCfg.destinationInNebulaBonus : 12);
    const ht = threatAt(env, ctx, u, dest);
    s -= ht * (hzCfg.threatPenaltyWeight !== undefined ? hzCfg.threatPenaltyWeight : 0.5);
    s -= tn.nebulaRiskPenalty * nebulaRiskAt(env, ctx, dest);
    if (W.leash !== Infinity && sp.length === 0 && mc && env.dist(dest, mc) > W.leash){
      s -= (hzCfg.leashViolationPenalty !== undefined ? hzCfg.leashViolationPenalty : 60);
    }
    if (u.flags.has("!flagship")){
      const zs = env.railgunDangerZones(ctx);
      for (let i = 0; i < zs.length; i++){
        if (env.dist(dest, zs[i].enemy) <= zs[i].radius){
          s -= (hzCfg.flagshipRailgunDangerZonePenalty !== undefined ? hzCfg.flagshipRailgunDangerZonePenalty : 500);
        }
      }
    }
    if (env.preservationTier(u, ctx) <= (sacCfg.maxSacrificeTier !== undefined ? sacCfg.maxSacrificeTier : 1)){
      s += ht * (sacCfg.threatAcceptanceRefundWeight !== undefined ? sacCfg.threatAcceptanceRefundWeight : 0.15);
    }
    return s;
  }

  // Moved here from aiStateQueries.js: picking a retreat cell is a threat
  // evaluation (it needs threatAt), so it belongs to the scorer layer.
  function findSafeRetreatCell(env, ctx, flag){
    const re = (env.priorities(ctx) && env.priorities(ctx).retreatEvaluation) || {};
    const cs = env.reachableCells(ctx, flag, re.reachableCap !== undefined ? re.reachableCap : 96);
    let best = null, bs = -Infinity;
    const sp = env.spottedEnemies(ctx), zs = env.railgunDangerZones(ctx);
    const outBonus = re.outsideEnemyScanBonus !== undefined ? re.outsideEnemyScanBonus : 200;
    const inPen = re.insideEnemyScanPenaltyPerCell !== undefined ? re.insideEnemyScanPenaltyPerCell : 100;
    const rgCap = re.railgunZoneDistanceBonusCap !== undefined ? re.railgunZoneDistanceBonusCap : 300;
    const rgMult = re.railgunZoneDistanceMultiplier !== undefined ? re.railgunZoneDistanceMultiplier : 20;
    const thWeight = re.threatPenaltyWeight !== undefined ? re.threatPenaltyWeight : 0.5;
    for (let i = 0; i < cs.length; i++){
      const d = cs[i];
      let sc = 0;
      for (let j = 0; j < sp.length; j++){
        const e = sp[j], es = env.effectiveScan(ctx, e), dist = env.dist(d, e);
        sc += dist > es ? outBonus : -inPen * (es - dist);
      }
      for (let z = 0; z < zs.length; z++) sc += Math.min(rgCap, env.dist(d, zs[z].enemy) * rgMult);
      sc -= threatAt(env, ctx, flag, d) * thWeight;
      if (sc > bs){ bs = sc; best = d; }
    }
    return best;
  }

  function enduranceBonus(env, ctx, u, plan){
    const ep = (env.priorities(ctx) && env.priorities(ctx).endurancePriorities) || {};
    let b = 0, d = { x: u.x, y: u.y };
    for (let i = 0; i < plan.steps.length; i++){
      if (plan.steps[i].kind === "MOVE"){ d = plan.steps[i].to; break; }
    }
    if (env.spottedEnemies(ctx).some(p => env.inRange(d, p, u.range) && env.hasLineOfSight(ctx, d.x, d.y, p.x, p.y, "WEAPON"))){
      b += (ep.canStillShootNextTurnBonus !== undefined ? ep.canStillShootNextTurnBonus : 25);
    }
    if (threatAt(env, ctx, u, d) < u.hp){
      b += (ep.threatBelowCurrentHpBonus !== undefined ? ep.threatBelowCurrentHpBonus : 20);
    }
    return b;
  }

  AILogic._register("threatScorer", {
    threatValue,
    threatAt,
    projectedThreatAt,
    roleBaseValue,
    nebulaRiskAt,
    railgunKillPriority,
    targetStrategicValue,
    scoreShoot,
    scoreCapture,
    scoreShield,
    scoreMove,
    enduranceBonus,
    findSafeRetreatCell
  });
})();
