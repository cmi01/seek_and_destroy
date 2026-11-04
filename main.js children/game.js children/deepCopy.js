"use strict";

// ============================================================
// deepCopy.js — job: recursively copy a plain-data tree (deepCopy).
// Owner: game.js (pure child). Holds no state.
// ============================================================
// Plain-data deep copy (arrays and plain objects) for DTO handoffs.
const deepCopy = function (o){
  if (Array.isArray(o)) return o.map(deepCopy);
  if (o && typeof o === "object") {
    const out = {};
    const ks = Object.keys(o);
    for (let i = 0; i < ks.length; i++) out[ks[i]] = deepCopy(o[ks[i]]);
    return out;
  }
  return o;
};
