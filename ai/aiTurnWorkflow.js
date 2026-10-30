"use strict";

// ============================================================
// AI TURN WORKFLOW — reservation updates & delegation to aiLogic.js.
// Referenced exclusively by ai.js; loads and delegates to aiLogic.js
// via the temporary AITurnWorkflow._register registrar.
// ============================================================
(() => {
  let _logic = null;

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

  // Loads this file's only child (aiLogic.js). The registrar exists ONLY while
  // that child loads.
  async function load(){
    let regOpen = true;
    const g = typeof window !== "undefined" ? window : globalThis;
    g.AITurnWorkflow = {
      _register(name, mod){
        if (!regOpen || name !== "logic") throw new Error("[S&D AI] Unexpected registration for " + name);
        _logic = mod;
      }
    };
    try {
      await _loadScripts(["ai/aiLogic.js"]);
    } finally {
      regOpen = false;
      delete g.AITurnWorkflow;
    }
    if (!_logic) throw new Error("ai/aiLogic.js loaded but did not register its module.");
    await _logic.load();
  }

  function computeUpdatedReservations(ctx, plan, focusFireEnabled){
    const pv = (ctx && ctx.reservations) || new Map();
    const nx = new Map();
    const es = Array.from(pv.entries());
    for (let i = 0; i < es.length; i++){
      nx.set(es[i][0], { committedDmg: es[i][1].committedDmg, killers: es[i][1].killers.slice() });
    }
    if (!plan || !focusFireEnabled) return nx;
    const st0 = plan.steps[0];
    const st1 = plan.steps[1];
    const u = ((ctx && ctx.units) || []).find(x => x.id === plan.unitId);
    if (st0 && st0.kind === "SHOOT" && st0.target){
      // Immediate SHOOT resolves on this beat (reducing target.hp directly),
      // so record the attacker in killers for focus-fire follow-up without
      // double-counting already-applied damage in committedDmg.
      const cur = nx.get(st0.target.id) || { committedDmg: 0, killers: [] };
      const prevPending = cur.killers.includes(plan.unitId)
        ? ((st0.target.flags && st0.target.flags.has("+shield") && u && !u.flags.has("#railgun")) ? 1 : (u ? u.firepower : 0))
        : 0;
      nx.set(st0.target.id, {
        committedDmg: Math.max(0, cur.committedDmg - prevPending),
        killers: cur.killers.includes(plan.unitId) ? cur.killers.slice() : cur.killers.concat([plan.unitId])
      });
    } else if (st0 && st0.kind === "MOVE" && st1 && st1.kind === "SHOOT" && st1.target){
      const cur = nx.get(st1.target.id) || { committedDmg: 0, killers: [] };
      const effDmg = (st1.target.flags && st1.target.flags.has("+shield") && u && !u.flags.has("#railgun")) ? 1 : (u ? u.firepower : 0);
      nx.set(st1.target.id, {
        committedDmg: cur.committedDmg + effDmg,
        killers: cur.killers.includes(plan.unitId) ? cur.killers.slice() : cur.killers.concat([plan.unitId])
      });
    }
    return nx;
  }

  function evaluateTurnStep(env, gameStateSnapshot){
    if (!gameStateSnapshot) return ["NONE", [-1, -1]];
    const prioritiesObj = env && env.priorities ? env.priorities(gameStateSnapshot) : null;
    const stateVisibleToAI = gameStateSnapshot;
    if (env && env.rules){
      stateVisibleToAI._rulesAdapter = env.rules;
    }
    if (prioritiesObj){
      stateVisibleToAI._prioritiesObj = prioritiesObj;
    }

    let tuple = null;
    try {
      tuple = _logic.evaluate(stateVisibleToAI, prioritiesObj);
    } catch (err) {
      // Keep the AI turn alive (fallback below), but never hide the cause.
      console.error("[S&D AI] GetAIAction threw; using fallback action:", err);
      tuple = null;
    }

    if (tuple && Array.isArray(tuple)){
      const cfg = env && env.cfg ? env.cfg(stateVisibleToAI) : { focusFire: true };
      if (stateVisibleToAI.selectedPlan){
        stateVisibleToAI.reservations = computeUpdatedReservations(
          stateVisibleToAI,
          stateVisibleToAI.selectedPlan,
          Boolean(cfg && cfg.focusFire)
        );
        if (stateVisibleToAI.decision){
          stateVisibleToAI.decision.reservations = stateVisibleToAI.reservations;
        }
      }
      return tuple;
    }

    if (env && typeof env.fallbackEvaluate === "function"){
      return env.fallbackEvaluate(gameStateSnapshot);
    }
    return ["NONE", [-1, -1]];
  }

  getAIAction._register("turnWorkflow", {
    load,
    computeUpdatedReservations,
    evaluateTurnStep
  });
})();
