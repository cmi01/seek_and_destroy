"use strict";

// ============================================================
// adjustReputation.js — job: move one faction pair's reputation by a
// delta and return the NEW pair table.
// Owner: reputation.js (pure). Holds no state.
//
// M6 interface (roadmap-design §5.6): adjustReputation(repState, a, b,
// delta) → repState — the transform returns a NEW table (the caller
// applies it); scores clamp to the −100..200 scale. Event deltas (kills
// ±10, missions ±15, trade ±2) arrive as plain data from the caller's
// frozen rate table. The pair key is order-insensitive: the existing
// spelling is updated, and a never-seen pair starts from 0.
// ============================================================
const adjustReputation = function (repState, a, b, delta){
  const d = Math.trunc(Number(delta) || 0);
  if (!a || !b || !d) return repState || {};
  const rep = Object.assign({}, repState || {});
  const fwd = a + "|" + b, rev = b + "|" + a;
  const key = (rep[fwd] !== undefined) ? fwd : ((rep[rev] !== undefined) ? rev : fwd);
  const base = (rep[key] !== undefined) ? rep[key] : 0;
  rep[key] = Math.max(-100, Math.min(200, base + d));
  return rep;
};
// Loading convention: this file defines adjustReputation at top level; the
// owner captures it after the boot list resolves.
