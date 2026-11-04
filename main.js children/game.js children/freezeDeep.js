"use strict";

// ============================================================
// freezeDeep.js — job: recursively freeze a data tree (freezeDeep).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const freezeDeep = function (o){
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(freezeDeep);
  }
  return o;
};
