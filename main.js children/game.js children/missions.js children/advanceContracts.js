"use strict";

// ============================================================
// advanceContracts.js — job: credit one kind of progress event to every
// accepted contract and return the NEW campaign section.
// Owner: missions.js (pure). Holds no state.
//
// M6: contract targets count post-accept events ("destroy" = enemy ships
// destroyed, "patrol"/"turn" = map turns elapsed); the battle fold and the
// map clock are the callers' hook points. Transforms return NEW state.
// ============================================================
const advanceContracts = function (state, kind, amount){
  const s = state || {};
  const n = Math.trunc(Number(amount) || 0);
  const prog = s.contracts || {};
  const active = Array.isArray(prog.active) ? prog.active : [];
  if (!kind || !n || active.length === 0) return s;
  // Event kinds map onto the target keys the authored rows count.
  const key = (kind === "destroy") ? "kills"
    : ((kind === "patrol" || kind === "turn") ? "turns" : kind);
  const nextProg = Object.assign({}, prog.progress || {});
  for (let i = 0; i < active.length; i++){
    const id = active[i];
    const cur = Object.assign({}, nextProg[id] || {});
    cur[key] = (Number(cur[key]) || 0) + n;
    nextProg[id] = cur;
  }
  return Object.assign({}, s, {
    contracts: Object.assign({}, prog, { progress: nextProg })
  });
};
// Loading convention: this file defines advanceContracts at top level; the
// owner captures it after the boot list resolves.
