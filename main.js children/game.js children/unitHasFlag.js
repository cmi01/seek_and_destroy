"use strict";

// ============================================================
// unitHasFlag.js — job: report whether a unit's flag collection contains a flag (unitHasFlag).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const unitHasFlag = function (unit, flag){
  if (!unit || !unit.flags) return false;
  return typeof unit.flags.has === "function" ? unit.flags.has(flag) : unit.flags.includes(flag);
};
