"use strict";

// ============================================================
// aiLogic.js — job: orchestrate the AI children into one decision.
// Owner: aiTurnWorkflow.js. Holds no state.
// ============================================================

// ONE composing function. Every child below it — the five query composers,
// the belief memory, the invariant checks, the threat scorer and the two
// planners — is a classic script loaded by the central loader (the shell)
// before this function is ever called, so each child's single binding is
// visible here by name: no load handshake, no registrar.

// The AI env facade is built here and handed flat to every child: pure rules
// functions plus copied data projected from the snapshot DTO, and one guarded
// wrapper per child operation. Its member list is the children's whole
// calling surface.

function _aiThreatScorerHandle(){
  // The scorer's one function hands back its thirteen-member handle; an
  // already-built handle object (or the shell's published binding) is taken
  // as-is, so the member surface below is identical either way.
  if (typeof threatScorer !== "undefined" && threatScorer) return threatScorer;
  if (typeof aiThreatScorer === "function") return aiThreatScorer();
  if (typeof aiThreatScorer !== "undefined" && aiThreatScorer) return aiThreatScorer;
  return null;
}

function _aiResolvePrioritiesObject(aiPriorities){
  if (aiPriorities && typeof aiPriorities === "object" && !Array.isArray(aiPriorities)){
    return aiPriorities;
  }
  return {};
}

function _aiCreateLogicEnv(stateVisibleToAI, aiPriorities, S){
  const pObj = _aiResolvePrioritiesObject(aiPriorities);
  // The AI uses the frozen rules facade projected onto the snapshot DTO
  // (pure functions + copied data). It is spread FLAT onto the env below, so
  // the leaves call env.canShoot(...), env.dist(...), env.shipSpecs, ...
  const rules = (stateVisibleToAI && stateVisibleToAI.rules) || null;
  const errorCounts = new Map();
  function guard(where, fn, onErrorValue){
    try {
      return fn();
    } catch (err) {
      const key = where + "|" + String(err && err.stack ? err.stack : err);
      const n = (errorCounts.get(key) || 0) + 1;
      errorCounts.set(key, n);
      if (n === 1) console.error("[S&D AI] " + where + " threw (further repeats suppressed):", err);
      return onErrorValue;
    }
  }
  const env = Object.assign(Object.create(null), rules, {
    priorities(){ return pObj; },
    tuning(){ return { ...pObj.tuning }; },
    doctrineWeights(doctrine){
      const wm = pObj.doctrines.weights, d = pObj.doctrines.defaultDoctrine;
      return wm[doctrine] || wm[d] || wm.DEFENSIVE_HOLD;
    },
    doctrinePurchaseOrder(doctrine){
      const o = pObj.doctrines.purchaseOrders, d = pObj.doctrines.defaultDoctrine;
      return (o[doctrine] || o[d] || o.DEFENSIVE_HOLD).slice();
    },
    // Difficulty profiles come only from the rules table.
    cfg(ctx){
      const t = (ctx && ctx.difficultyTable) || rules.difficultyProfiles;
      const k = (ctx && ctx.difficulty) || rules.defaultDifficulty;
      return t[k] || t.NORMAL;
    },
    // ---- contact picture ----
    myUnits(ctx){ return guard("AIStateQueries.myUnits", () => queryAIState(env, ctx, "myUnits"), null) || []; },
    spottedEnemies(ctx){ return guard("AIStateQueries.spottedEnemies", () => queryAIState(env, ctx, "spottedEnemies"), null) || []; },
    activeBeliefs(ctx){ return guard("AIStateQueries.activeBeliefs", () => queryAIState(env, ctx, "activeBeliefs"), null) || []; },
    // ---- move destinations ----
    moveHeuristic(ctx, u, dest){ return guard("AIPositionQueries.moveHeuristic", () => queryAIMoveOptions(env, ctx, "moveHeuristic", u, dest), 0); },
    reachableCells(ctx, u, maxCells){ return guard("AIPositionQueries.reachableCells", () => queryAIMoveOptions(env, ctx, "reachableCells", u, maxCells), null) || []; },
    // ---- belief memory ----
    computeSyncedMemory(ctx){ return guard("AIBeliefMemory.computeSyncedMemory", () => computeSyncedMemory(env, ctx), null) || new Map(); },
    // ---- danger ----
    railgunDangerZones(ctx){ return guard("AIThreatQueries.railgunDangerZones", () => queryAIDanger(env, ctx, "railgunDangerZones"), null) || []; },
    canEliminateAllFlagshipThreats(ctx){ return Boolean(guard("AIThreatQueries.canEliminateAllFlagshipThreats", () => queryAIDanger(env, ctx, "canEliminateAllFlagshipThreats"), false)); },
    // ---- hull preservation ----
    preservationTier(u, ctx){ return guard("AIPreservationQueries.preservationTier", () => queryAIHullPreservation(env, ctx, "preservationTier", u), null) || 1; },
    shouldRetreat(u, ctx){ return Boolean(guard("AIPreservationQueries.shouldRetreat", () => queryAIHullPreservation(env, ctx, "shouldRetreat", u), false)); },
    // ---- fleet ----
    fleetGap(ctx){ return guard("AIFleetQueries.fleetGap", () => queryAIFleet(env, ctx, "fleetGap"), null) || {}; },
    warpLoci(ctx){ return guard("AIFleetQueries.warpLoci", () => queryAIFleet(env, ctx, "warpLoci"), null) || []; },
    // ---- turn invariants ----
    checkInvariants(ctx){ return guard("AIInvariantChecks.checkInvariants", () => checkInvariants(env, ctx), null) || []; },
    // ---- threat scoring (the scorer depends on the state queries directly) ----
    findSafeRetreatCell(ctx, flag){ return guard("AIThreatScorer.findSafeRetreatCell", () => S.findSafeRetreatCell(env, ctx, flag), null); },
    threatValue(ctx, enemy, myUnit){ return guard("AIThreatScorer.threatValue", () => S.threatValue(env, ctx, enemy, myUnit), 0); },
    threatAt(ctx, u, dest){ return guard("AIThreatScorer.threatAt", () => S.threatAt(env, ctx, u, dest), 0); },
    projectedThreatAt(ctx, u, dest){ return guard("AIThreatScorer.projectedThreatAt", () => S.projectedThreatAt(env, ctx, u, dest), 0); },
    roleBaseValue(ctx, target){ return guard("AIThreatScorer.roleBaseValue", () => S.roleBaseValue(env, ctx, target), 0); },
    nebulaRiskAt(ctx, dest){ return guard("AIThreatScorer.nebulaRiskAt", () => S.nebulaRiskAt(env, ctx, dest), 0); },
    railgunKillPriority(enemy, myFlag){ return guard("AIThreatScorer.railgunKillPriority", () => S.railgunKillPriority(env, enemy, myFlag), 0); },
    targetStrategicValue(ctx, target, attacker, actionKind, opts){
      return guard("AIThreatScorer.targetStrategicValue", () => S.targetStrategicValue(env, ctx, target, attacker, actionKind, opts), 0);
    },
    scoreShoot(ctx, u, target, opts){ return guard("AIThreatScorer.scoreShoot", () => S.scoreShoot(env, ctx, u, target, opts), 0); },
    scoreCapture(ctx, u, target){ return guard("AIThreatScorer.scoreCapture", () => S.scoreCapture(env, ctx, u, target), 0); },
    scoreShield(ctx, u){ return guard("AIThreatScorer.scoreShield", () => S.scoreShield(env, ctx, u), 0); },
    scoreMove(ctx, u, dest){ return guard("AIThreatScorer.scoreMove", () => S.scoreMove(env, ctx, u, dest), 0); },
    enduranceBonus(ctx, u, plan){ return guard("AIThreatScorer.enduranceBonus", () => S.enduranceBonus(env, ctx, u, plan), 0); },
    // ---- planners ----
    planUnitTurn(ctx, u, unitRoll){ return guard("buildUnitPlan", () => buildUnitPlan(env, ctx, u, unitRoll), null); },
    selectBestPlan(ctx){ return guard("selectFleetActionPlan", () => selectFleetActionPlan(env, ctx), null); }
  });
  return env;
}

// One-way result shape shared by the whole AI tree. Every outcome is
// returned as plain data — nothing is ever written onto stateVisibleToAI.
function _aiEmptyResult(stateVisibleToAI, lastSeenEnemies){
  return {
    action: "NONE",
    coord: [-1, -1],
    decision: null,
    selectedPlan: null,
    reservations: (stateVisibleToAI && stateVisibleToAI.reservations) ? new Map(stateVisibleToAI.reservations) : new Map(),
    lastSeenEnemies: lastSeenEnemies || new Map(),
    aiEmergencyMode: false,
    aiScoreTrace: []
  };
}

const evaluateAITurn = function (stateVisibleToAI, aiPriorities){
  if (!stateVisibleToAI) return _aiEmptyResult(null, null);
  const S = _aiThreatScorerHandle();
  if (!S) throw new Error("[S&D AI] the threat-scorer surface is not loaded; the AI cannot score.");
  const env = _aiCreateLogicEnv(stateVisibleToAI, aiPriorities, S);
  const invWarnings = env.checkInvariants(stateVisibleToAI);
  if (invWarnings && invWarnings.length){
    for (let i = 0; i < invWarnings.length; i++) console.warn(invWarnings[i]);
  }
  const syncedBeliefs = env.computeSyncedMemory(stateVisibleToAI);
  const early = _aiEmptyResult(stateVisibleToAI, syncedBeliefs);
  if (
    stateVisibleToAI.syncOnly ||
    stateVisibleToAI.gameOver ||
    stateVisibleToAI.activeTeam !== 2 ||
    (stateVisibleToAI.ap !== undefined && stateVisibleToAI.ap <= 0)
  ){
    return early;
  }
  const res = env.selectBestPlan(stateVisibleToAI);
  if (!res) return early;
  const out = {
    action: "NONE",
    coord: [-1, -1],
    decision: null,
    selectedPlan: res.plan || null,
    reservations: early.reservations,
    lastSeenEnemies: res.nextBeliefs,
    aiEmergencyMode: Boolean(res.aiEmergencyMode),
    aiScoreTrace: res.aiScoreTrace
  };
  if (!res.plan) return out;

  const st = res.plan.steps[0];
  if (!st) return out;
  const buildDecision = (action, coord, from, to, warpOpts) => ({
    action,
    coord,
    unitId: res.plan.unitId,
    from: from || null,
    to: to || null,
    apCost: res.plan.apCost,
    steps: res.plan.steps.slice(),
    warpOpts: warpOpts || null,
    score: res.plan.score,
    plan: res.plan
  });
  const finish = (decision, warpOpts) => {
    out.action = decision.action;
    out.coord = decision.coord;
    out.decision = decision;
    if (warpOpts) out.warpOpts = warpOpts;
    return out;
  };

  if (st.kind === "WARP"){
    const cx = Math.round(st.locus.x), cy = Math.round(st.locus.y);
    const warpOpts = { radius: st.radius, costMult: st.costMult };
    return finish(buildDecision("WARP:" + st.shipType, [cx, cy], { x: cx, y: cy }, { x: cx, y: cy }, warpOpts), warpOpts);
  }
  const us = stateVisibleToAI.units || [], u = us.find(x => x.id === res.plan.unitId && x.hp > 0);
  if (!u) return out;
  const ux = Math.round(u.x), uy = Math.round(u.y);
  if (st.kind === "MOVE"){
    const tx = Math.round(st.to.x), ty = Math.round(st.to.y);
    return finish(buildDecision("MOVE", [tx, ty], { x: ux, y: uy }, { x: tx, y: ty }, null));
  }
  if (st.kind === "SHOOT"){
    const t = us.find(x => x.id === st.target.id && x.hp > 0);
    if (!t) return out;
    const tx = Math.round(t.x), ty = Math.round(t.y);
    return finish(buildDecision("SHOOT", [tx, ty], { x: ux, y: uy }, { x: tx, y: ty }, null));
  }
  if (st.kind === "CAPTURE"){
    const t = us.find(x => x.id === st.target.id && x.hp > 0);
    if (!t) return out;
    const tx = Math.round(t.x), ty = Math.round(t.y);
    return finish(buildDecision("CAPTURE", [tx, ty], { x: ux, y: uy }, { x: tx, y: ty }, null));
  }
  if (st.kind === "SHIELD"){
    return finish(buildDecision("SHIELD", [ux, uy], { x: ux, y: uy }, { x: ux, y: uy }, null));
  }
  return out;
};
