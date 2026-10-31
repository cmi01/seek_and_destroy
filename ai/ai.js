"use strict";

// ============================================================
// ai.js — job: expose the single AI decision entry point and load its children.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("ai", (() => {
  const _aiModules = {
    prioritiesData: null,
    turnWorkflow: null
  };
  let _regOpen = true;
  let _loadPromise = null;

  // Deep-copies plain data so the normalized table never aliases the frozen
  // priorities manifest (any write into it throws since v74).
  function deepCopy(v){
    if (Array.isArray(v)) return v.map(deepCopy);
    if (v && typeof v === "object"){
      const o = {}, ks = Object.keys(v);
      for (let i = 0; i < ks.length; i++) o[ks[i]] = deepCopy(v[ks[i]]);
      return o;
    }
    return v;
  }

  function aiNormalizePriorities(raw){
    const base = _aiModules.prioritiesData || {};
    const merge = (b, r) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) return deepCopy(b);
      const o = deepCopy(b || {}), ks = Object.keys(r);
      for (let i = 0; i < ks.length; i++){
        const k = ks[i], rv = r[k], bv = b ? b[k] : undefined;
        if (Array.isArray(rv)) o[k] = deepCopy(rv);
        else if (rv && typeof rv === "object") o[k] = merge(bv, rv);
        else if (rv !== undefined) o[k] = rv;
      }
      return o;
    };
    // Both merge paths deep-copy base first: `out` shares zero refs with
    // _aiModules.prioritiesData, so the weights rewrite below can never
    // assign into the frozen manifest.
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

  // Difficulty profiles come from the snapshot DTO or its rules facade.
  function aiCfg(ctx){
    const rules = (ctx && ctx.rules) || null;
    const t = (ctx && ctx.difficultyTable) || (rules && rules.difficultyProfiles) || {};
    const k = (ctx && ctx.difficulty) || (rules && rules.defaultDifficulty) || "NORMAL";
    return t[k] || t.NORMAL;
  }

  function fallbackEvaluate(gameStateSnapshot){
    const seen = (gameStateSnapshot && gameStateSnapshot.lastSeenEnemies) || null;
    return {
      action: "NONE",
      coord: [-1, -1],
      decision: null,
      selectedPlan: null,
      reservations: new Map(),
      lastSeenEnemies: new Map(seen instanceof Map ? seen : Object.entries(seen || {})),
      aiEmergencyMode: false,
      aiScoreTrace: []
    };
  }

  function getAIAction(gameStateSnapshot) {
    // Flat rules facade: pure functions + copied data from the snapshot DTO,
    // merged straight onto the env the AI tree receives (no live Rules handle).
    const aiEnv = Object.assign(Object.create(null), gameStateSnapshot && gameStateSnapshot.rules, {
      priorities: aiPriorities,
      tuning: aiTuning,
      cfg: aiCfg,
      fallbackEvaluate
    });
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

  // The priorities manifest is deep-frozen at receipt; a normalize/merge pass
  // that aliases into it now throws loudly instead of silently corrupting it.
  function deepFreeze(o){
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.values(o).forEach(deepFreeze);
    }
    return o;
  }

  // Registrar exposed ONLY while this file's direct children load.
  getAIAction._register = function(name, mod){
    if (!_regOpen || !(name in _aiModules)) throw new Error("[S&D AI] Unexpected registration for " + name);
    if (name === "prioritiesData") mod = deepFreeze(mod);
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
