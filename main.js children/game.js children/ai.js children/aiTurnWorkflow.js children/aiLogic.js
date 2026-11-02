"use strict";

// ============================================================
// aiLogic.js — job: orchestrate the AI children into one decision.
// Owner: aiTurnWorkflow.js. Holds no state unless it is a core.
// ============================================================
(() => {
  let Q = null;   // stateQueries (contact picture)
  let PQ = null;  // positionQueries
  let TQ = null;  // threatQueries
  let PRQ = null; // preservationQueries
  let FQ = null;  // fleetQueries
  let BM = null;  // beliefMemory
  let IC = null;  // invariantChecks
  let S = null;
  let buildUnitPlan = null;
  let selectFleetActionPlan = null;

  function _loadScripts(list){
    return Promise.allSettled(list.map(src => new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false; // force in-order execution
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error("Failed to load script: " + src));
      document.head.appendChild(s);
    }))).then(results => {
      const failures = results.filter(r => r.status === "rejected").map(r => r.reason.message);
      if (failures.length > 0) throw new Error(failures.join("\n"));
    });
  }

  // The flattened leaves expose their one function as a plain script-scope
  // binding; load() captures each one after the load, so those files carry no
  // registrar call of their own. The registrar below serves only the children
  // that still publish a module object.
  const PLAIN_KIDS = {
    beliefMemory: "computeSyncedMemory",
    invariantChecks: "checkInvariants",
    unitPlanner: "buildUnitPlan",
    fleetCommander: "selectFleetActionPlan"
  };

  // Loads this file's ten leaf children. The registrar exists ONLY while the
  // registrar-shaped ones load.
  async function load(){
    let regOpen = true;
    const kids = {
      stateQueries: null, positionQueries: null, threatQueries: null,
      preservationQueries: null, fleetQueries: null, threatScorer: null
    };
    const g = typeof window !== "undefined" ? window : globalThis;
    g.AILogic = {
      _register(name, mod){
        if (!regOpen || !(name in kids)) throw new Error("[S&D AI] Unexpected registration for " + name);
        kids[name] = mod;
      }
    };
    try {
      await _loadScripts([
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js",
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPositionQueries.js",
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatQueries.js",
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPreservationQueries.js",
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetQueries.js",
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiBeliefMemory.js",
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiInvariantChecks.js",
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatScorer.js",
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiUnitPlanner.js",
        "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetCommander.js"
      ]);
    } finally {
      regOpen = false;
      delete g.AILogic;
    }
    const plainSlots = Object.keys(PLAIN_KIDS);
    const unexposed = [];
    for (let i = 0; i < plainSlots.length; i++){
      const slot = plainSlots[i], fn = g[PLAIN_KIDS[slot]];
      if (typeof fn === "function") kids[slot] = fn;
      else unexposed.push(PLAIN_KIDS[slot]);
    }
    if (unexposed.length > 0) {
      throw new Error("These scripts loaded but did not expose their function:\n  " + unexposed.join("\n  "));
    }
    const missing = Object.keys(kids).filter(k => kids[k] === null);
    if (missing.length > 0) {
      throw new Error("These scripts loaded but did not register their module:\n  " + missing.join("\n  "));
    }
    Q = kids.stateQueries;
    PQ = kids.positionQueries;
    TQ = kids.threatQueries;
    PRQ = kids.preservationQueries;
    FQ = kids.fleetQueries;
    BM = kids.beliefMemory;
    IC = kids.invariantChecks;
    S = kids.threatScorer;
    buildUnitPlan = kids.unitPlanner;
    selectFleetActionPlan = kids.fleetCommander;
  }

  function resolvePrioritiesObject(aiPriorities){
    if (aiPriorities && typeof aiPriorities === "object" && !Array.isArray(aiPriorities)){
      return aiPriorities;
    }
    return {};
  }

  function createLogicEnv(stateVisibleToAI, aiPriorities){
    const pObj = resolvePrioritiesObject(aiPriorities);
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
      // Difficulty profiles come only from rules_DATA.js.
      cfg(ctx){
        const t = (ctx && ctx.difficultyTable) || rules.difficultyProfiles;
        const k = (ctx && ctx.difficulty) || rules.defaultDifficulty;
        return t[k] || t.NORMAL;
      },
      // ---- AIStateQueries (contact picture) ----
      myUnits(ctx){ return guard("AIStateQueries.myUnits", () => Q.myUnits(env, ctx), null) || []; },
      spottedEnemies(ctx){ return guard("AIStateQueries.spottedEnemies", () => Q.spottedEnemies(env, ctx), null) || []; },
      activeBeliefs(ctx){ return guard("AIStateQueries.activeBeliefs", () => Q.activeBeliefs(env, ctx), null) || []; },
      // ---- AIPositionQueries ----
      moveHeuristic(ctx, u, dest){ return guard("AIPositionQueries.moveHeuristic", () => PQ.moveHeuristic(env, ctx, u, dest), 0); },
      reachableCells(ctx, u, maxCells){ return guard("AIPositionQueries.reachableCells", () => PQ.reachableCells(env, ctx, u, maxCells), null) || []; },
      // ---- AIBeliefMemory ----
      computeSyncedMemory(ctx){ return guard("AIBeliefMemory.computeSyncedMemory", () => BM(env, ctx), null) || new Map(); },
      // ---- AIThreatQueries ----
      railgunDangerZones(ctx){ return guard("AIThreatQueries.railgunDangerZones", () => TQ.railgunDangerZones(env, ctx), null) || []; },
      canEliminateAllFlagshipThreats(ctx){ return Boolean(guard("AIThreatQueries.canEliminateAllFlagshipThreats", () => TQ.canEliminateAllFlagshipThreats(env, ctx), false)); },
      // ---- AIPreservationQueries ----
      preservationTier(u, ctx){ return guard("AIPreservationQueries.preservationTier", () => PRQ.preservationTier(env, ctx, u), null) || 1; },
      shouldRetreat(u, ctx){ return Boolean(guard("AIPreservationQueries.shouldRetreat", () => PRQ.shouldRetreat(env, ctx, u), false)); },
      // ---- AIFleetQueries ----
      fleetGap(ctx){ return guard("AIFleetQueries.fleetGap", () => FQ.fleetGap(env, ctx), null) || {}; },
      warpLoci(ctx){ return guard("AIFleetQueries.warpLoci", () => FQ.warpLoci(env, ctx), null) || []; },
      // ---- AIInvariantChecks ----
      checkInvariants(ctx){ return guard("AIInvariantChecks.checkInvariants", () => IC(env, ctx), null) || []; },
      // ---- AIThreatScorer (depends on the state queries directly) ----
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
      // ---- Planners ----
      planUnitTurn(ctx, u, unitRoll){ return guard("buildUnitPlan", () => buildUnitPlan(env, ctx, u, unitRoll), null); },
      selectBestPlan(ctx){ return guard("selectFleetActionPlan", () => selectFleetActionPlan(env, ctx), null); }
    });
    return env;
  }

  // One-way result shape shared by the whole AI tree. Every outcome is
  // returned as plain data — nothing is ever written onto stateVisibleToAI.
  function emptyResult(stateVisibleToAI, lastSeenEnemies){
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

  function GetAIAction(stateVisibleToAI, aiPriorities) {
    if (!stateVisibleToAI) return emptyResult(null, null);
    const env = createLogicEnv(stateVisibleToAI, aiPriorities);
    const invWarnings = env.checkInvariants(stateVisibleToAI);
    if (invWarnings && invWarnings.length){
      for (let i = 0; i < invWarnings.length; i++) console.warn(invWarnings[i]);
    }
    const syncedBeliefs = env.computeSyncedMemory(stateVisibleToAI);
    const early = emptyResult(stateVisibleToAI, syncedBeliefs);
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
  }

  AITurnWorkflow._register("logic", {
    load,
    evaluate: GetAIAction
  });
})();
