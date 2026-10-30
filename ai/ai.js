"use strict";

// ============================================================
// AI ENGINE — Stateless pure-function AI entry point (getAIAction)
// Privately registered with Game (core/game.js); loads data/aiPriorities_DATA.js &
// ai/aiTurnWorkflow.js (which cascades into aiLogic.js and its 4
// leaf modules) via temporary private registration.
// Signature: tuple<string_action, tuple_coordinate<intx, inty>>(object_gamestate_snapshot)
// ============================================================
Game._registerModule("ai", (() => {
  const _aiModules = {
    prioritiesData: null,
    turnWorkflow: null
  };
  let _regOpen = true;
  let _loadPromise = null;

  function aiNormalizePriorities(raw){
    const base = _aiModules.prioritiesData || {};
    const merge = (b, r) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) return b;
      const o = { ...(b || {}) }, ks = Object.keys(r);
      for (let i = 0; i < ks.length; i++){
        const k = ks[i], rv = r[k], bv = b ? b[k] : undefined;
        if (Array.isArray(rv)) o[k] = rv.slice();
        else if (rv && typeof rv === "object") o[k] = merge(bv, rv);
        else if (rv !== undefined) o[k] = rv;
      }
      return o;
    };
    const out = (raw && raw !== base) ? merge(base, raw) : merge({}, base);
    out.source = "aiPriorities_DATA.js";
    if (out.doctrines && out.doctrines.weights){
      const wm = out.doctrines.weights, ks = Object.keys(wm);
      for (let i = 0; i < ks.length; i++){
        const k = ks[i], w = wm[k];
        if (!w || typeof w !== "object") continue;
        const unb = Boolean(w.unboundedLeash) || w.leash === null || w.leash === Infinity || w.leash === "Infinity";
        wm[k] = {leash:unb ? Infinity : Number(w.leash), unboundedLeash:unb, aggression:Number(w.aggression), screen:Number(w.screen), standoff:Number(w.standoff)};
      }
    }
    return out;
  }

  function aiPriorities(ctx){
    if (ctx && ctx.aiPriorities) return aiNormalizePriorities(ctx.aiPriorities);
    if (ctx && ctx.aiPrioritiesData) return aiNormalizePriorities(ctx.aiPrioritiesData);
    return aiNormalizePriorities(_aiModules.prioritiesData || {});
  }

  function aiTuning(ctx){
    return { ...aiPriorities(ctx).tuning };
  }

  // Difficulty profiles come from the snapshot DTO or ctx.rules.
  function aiCfg(ctx){
    const rules = (ctx && (ctx.rules || ctx._rulesAdapter)) || null;
    const t = (ctx && ctx.difficultyTable) || (rules && rules.difficultyProfiles) || {};
    const k = (ctx && ctx.difficulty) || (rules && rules.defaultDifficulty) || "NORMAL";
    return t[k] || t.NORMAL;
  }

  function fallbackEvaluate(){
    return ["NONE", [-1, -1]];
  }

  function getAIAction(gameStateSnapshot) {
    const aiEnv = {
      rules: (gameStateSnapshot && (gameStateSnapshot.rules || gameStateSnapshot._rulesAdapter)) || null,
      priorities: aiPriorities,
      tuning: aiTuning,
      cfg: aiCfg,
      fallbackEvaluate
    };
    if (_aiModules.turnWorkflow){
      return _aiModules.turnWorkflow.evaluateTurnStep(aiEnv, gameStateSnapshot);
    }
    console.error("[S&D AI] aiTurnWorkflow.js is not loaded; AI is falling back to NONE.");
    return fallbackEvaluate(gameStateSnapshot);
  }

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

  // Registrar exposed ONLY while this file's direct children load.
  getAIAction._register = function(name, mod){
    if (!_regOpen || !(name in _aiModules)) throw new Error("[S&D AI] Unexpected registration for " + name);
    _aiModules[name] = mod;
  };

  getAIAction.load = async function(){
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
      const g = typeof window !== "undefined" ? window : globalThis;
      g.getAIAction = getAIAction;
      try {
        await _loadScripts([
          "data/aiPriorities_DATA.js",
          "ai/aiTurnWorkflow.js"
        ]);
      } finally {
        delete g.getAIAction;
        _regOpen = false;
        delete getAIAction._register;
      }
      const missing = Object.keys(_aiModules).filter(k => _aiModules[k] === null);
      if (missing.length > 0) {
        throw new Error("These scripts loaded but did not register their module:\n  " + missing.join("\n  "));
      }
      await _aiModules.turnWorkflow.load();
    })();
    return _loadPromise;
  };
  return getAIAction;
})());
