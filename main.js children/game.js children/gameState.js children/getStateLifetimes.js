"use strict";

// ============================================================
// getStateLifetimes.js — job: return a copy of the state-key lifetime map.
// Owner: gameState.js (pure). Holds no state.
// ============================================================

const getStateLifetimes = function (DATA){
  function deepClone(v){
    if (Array.isArray(v)) return v.map(deepClone);
    if (v && typeof v === "object") {
      const o = {};
      Object.keys(v).forEach(k => { o[k] = deepClone(v[k]); });
      return o;
    }
    return v;
  }

  // Callers may mutate the returned map; it must not alias the frozen table.
  return deepClone(DATA.lifetimes);
};
