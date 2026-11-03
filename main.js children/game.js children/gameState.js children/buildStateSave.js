"use strict";

// ============================================================
// buildStateSave.js — job: build the plain save payload from the persistent state lifetimes.
// Owner: gameState.js (pure). Holds no state.
// ============================================================

// Only the persistent lifetimes are written; input/runtime fields (timers,
// hit boxes, caches, the live RNG closure) are rebuilt fresh on load.
const buildStateSave = function (DATA, stateBox){
  const PERSISTENT_LIFETIMES = ["campaign", "profile", "match", "ai", "camera"];
  const LIFETIMES = DATA.lifetimes;

  function toPlain(v){
    if (v instanceof Map) return { __map: Array.from(v.entries()).map(([k, val]) => [k, toPlain(val)]) };
    if (v instanceof Set) return { __set: Array.from(v.values()).map(toPlain) };
    if (Array.isArray(v)) return v.map(toPlain);
    if (v && typeof v === "object") {
      const o = {};
      Object.keys(v).forEach(k => { o[k] = toPlain(v[k]); });
      return o;
    }
    return typeof v === "function" ? undefined : v;
  }

  const st = stateBox.current;
  const out = { schema: DATA.schema, version: DATA.version, state: {} };
  PERSISTENT_LIFETIMES.forEach(lt => LIFETIMES[lt].forEach(k => {
    if (k === "rng") return; // live closure; restored from rngSeed
    out.state[k] = toPlain(st[k]);
  }));
  return out;
};
