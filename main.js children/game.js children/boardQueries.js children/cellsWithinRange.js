"use strict";

// ============================================================
// cellsWithinRange.js — job: report whether two cells are within a range, epsilon-tolerant.
// Owner: boardQueries.js (pure). Holds no state.
// ============================================================

const cellsWithinRange = function (D, a, b, r){
  const eps = D.combatRules.rangeEpsilon || 1e-6;
  return Math.hypot(a.x - b.x, a.y - b.y) <= r + eps;
};
