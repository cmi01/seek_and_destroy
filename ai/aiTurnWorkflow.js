"use strict";

// ============================================================
// aiTurnWorkflow.js — job: sequence the AI turn's action beats.
// Owner: ai/ai.js. Holds no state unless it is a core.
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
      // Plan steps carry {id,x,y} snapshots; resolve the unit for flag reads.
      const tgt = ((ctx && ctx.units) || []).find(x => x.id === st0.target.id) || st0.target;
      // Immediate SHOOT resolves on this beat (reducing target.hp directly),
      // so record the attacker in killers for focus-fire follow-up without
      // double-counting already-applied damage in committedDmg.
      const cur = nx.get(st0.target.id) || { committedDmg: 0, killers: [] };
      const prevPending = cur.killers.includes(plan.unitId)
        ? ((tgt.flags && tgt.flags.has("+shield") && u && !u.flags.has("#railgun")) ? 1 : (u ? u.firepower : 0))
        : 0;
      nx.set(st0.target.id, {
        committedDmg: Math.max(0, cur.committedDmg - prevPending),
        killers: cur.killers.includes(plan.unitId) ? cur.killers.slice() : cur.killers.concat([plan.unitId])
      });
    } else if (st0 && st0.kind === "MOVE" && st1 && st1.kind === "SHOOT" && st1.target){
      const tgt = ((ctx && ctx.units) || []).find(x => x.id === st1.target.id) || st1.target;
      const cur = nx.get(st1.target.id) || { committedDmg: 0, killers: [] };
      const effDmg = (tgt.flags && tgt.flags.has("+shield") && u && !u.flags.has("#railgun")) ? 1 : (u ? u.firepower : 0);
      nx.set(st1.target.id, {
        committedDmg: cur.committedDmg + effDmg,
        killers: cur.killers.includes(plan.unitId) ? cur.killers.slice() : cur.killers.concat([plan.unitId])
      });
    }
    return nx;
  }

  // One-way boundary: nothing is written onto gameStateSnapshot. evaluate's
  // plain result flows up with reservations recomputed here.
  function evaluateTurnStep(env, gameStateSnapshot){
    const fallback = () => (env && typeof env.fallbackEvaluate === "function")
      ? env.fallbackEvaluate(gameStateSnapshot)
      : {
          action: "NONE", coord: [-1, -1], decision: null, selectedPlan: null,
          reservations: new Map(), lastSeenEnemies: new Map(),
          aiEmergencyMode: false, aiScoreTrace: []
        };
    if (!gameStateSnapshot) return fallback();
    const prioritiesObj = env && env.priorities ? env.priorities(gameStateSnapshot) : null;

    let result = null;
    try {
      result = _logic.evaluate(gameStateSnapshot, prioritiesObj);
    } catch (err) {
      // Keep the AI turn alive (fallback below), but never hide the cause.
      console.error("[S&D AI] GetAIAction threw; using fallback action:", err);
      result = null;
    }

    if (result && typeof result === "object"){
      const cfg = env && env.cfg ? env.cfg(gameStateSnapshot) : { focusFire: true };
      result.reservations = computeUpdatedReservations(
        gameStateSnapshot,
        result.selectedPlan,
        Boolean(cfg && cfg.focusFire)
      );
      return result;
    }
    return fallback();
  }

  getAIAction._register("turnWorkflow", {
    load,
    computeUpdatedReservations,
    evaluateTurnStep
  });
})();
