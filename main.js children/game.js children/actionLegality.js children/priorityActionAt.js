"use strict";

// ============================================================
// priorityActionAt.js — job: pick the highest-priority action from per-action verdicts.
// Owner: actionLegality.js (pure). Holds no state.
// ============================================================

// verdicts = { move, shoot, capture, shield } — the composer's decisions for
// the same cell, already evaluated. Order is the contract: a plain move wins,
// then the preferred action, then capture, shoot, shield.
const priorityActionAt = function (unitA, gx, gy, verdicts, opts){
  if (!unitA || unitA.hp <= 0) return null;
  if (verdicts.move) return "MOVE";
  if (opts && opts.preferShoot && verdicts.shoot) return "SHOOT";
  if (opts && opts.preferCapture && verdicts.capture) return "CAPTURE";
  if (verdicts.capture) return "CAPTURE";
  if (verdicts.shoot) return "SHOOT";
  if (verdicts.shield) return "SHIELD";
  return null;
};
