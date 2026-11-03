"use strict";

// ============================================================
// ai.js — job: decide the AI team's next action for one game-state snapshot.
// Owner: game.js. Holds no state.
// ============================================================

// ONE pure function. Its children — the frozen priorities table and the turn
// workflow — are classic scripts loaded by the central loader (the shell) before
// this function is ever called, so each child's binding is visible here by
// name: no load handshake, no registrar, no transient globals.

// Deep-copies plain data so the normalized table never aliases the frozen
// priorities manifest (any write into it throws).
function _aiCopyData(v){
  if (Array.isArray(v)) return v.map(_aiCopyData);
  if (v && typeof v === "object"){
    const o = {}, ks = Object.keys(v);
    for (let i = 0; i < ks.length; i++) o[ks[i]] = _aiCopyData(v[ks[i]]);
    return o;
  }
  return v;
}

function _aiNormalizePriorities(raw, table){
  const base = table || {};
  const merge = (b, r) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) return _aiCopyData(b);
    const o = _aiCopyData(b || {}), ks = Object.keys(r);
    for (let i = 0; i < ks.length; i++){
      const k = ks[i], rv = r[k], bv = b ? b[k] : undefined;
      if (Array.isArray(rv)) o[k] = _aiCopyData(rv);
      else if (rv && typeof rv === "object") o[k] = merge(bv, rv);
      else if (rv !== undefined) o[k] = rv;
    }
    return o;
  };
  // Both merge paths deep-copy base first: `out` shares zero refs with the
  // frozen manifest, so the weights rewrite below can never assign into it.
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

function _aiPriorities(ctx){
  const table = (typeof aiPrioritiesData !== "undefined" && aiPrioritiesData) || {};
  if (ctx && ctx.aiPriorities) return _aiNormalizePriorities(ctx.aiPriorities, table);
  if (ctx && ctx.aiPrioritiesData) return _aiNormalizePriorities(ctx.aiPrioritiesData, table);
  return _aiNormalizePriorities(table, table);
}

function _aiTuning(ctx){
  return { ..._aiPriorities(ctx).tuning };
}

// Difficulty profiles come from the snapshot DTO or its rules facade.
function _aiCfg(ctx){
  const rules = (ctx && ctx.rules) || null;
  const t = (ctx && ctx.difficultyTable) || (rules && rules.difficultyProfiles) || {};
  const k = (ctx && ctx.difficulty) || (rules && rules.defaultDifficulty) || "NORMAL";
  return t[k] || t.NORMAL;
}

function _aiFallbackEvaluate(snapshot){
  const seen = (snapshot && snapshot.lastSeenEnemies) || null;
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

const decideAIAction = function (snapshot){
  // Flat rules facade: pure functions + copied data from the snapshot DTO,
  // merged straight onto the env the AI tree receives (no live Rules handle).
  const aiEnv = Object.assign(Object.create(null), snapshot && snapshot.rules, {
    priorities: _aiPriorities,
    tuning: _aiTuning,
    cfg: _aiCfg,
    fallbackEvaluate: _aiFallbackEvaluate
  });
  if (typeof evaluateTurnStep === "function"){
    return evaluateTurnStep(aiEnv, snapshot);
  }
  console.error("[S&D AI] the turn workflow is not loaded; AI is falling back to NONE.");
  return _aiFallbackEvaluate(snapshot);
};

// The core's boot hook: this file's whole subtree is loaded by the central
// loader, so the old load() edge has nothing left to do — it resolves at once.
decideAIAction.load = function(){ return Promise.resolve(); };

// Loading convention: this file defines its single function at top level; the
// owner (the parent composer) captures it after the boot list resolves.
