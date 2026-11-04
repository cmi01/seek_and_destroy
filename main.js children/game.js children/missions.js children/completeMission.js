"use strict";

// ============================================================
// completeMission.js — job: settle one accepted contract — pay its payout
// into the wallet, mark it done, and flag campaign-complete on the final
// contract of the chain.
// Owner: missions.js (pure). Holds no state.
//
// M6 interface (roadmap-design §5.6): completeMission(state, missionId) →
// { state, payout } — the frozen two-argument spelling is the interface
// and the stem injects the authored contract table as the optional
// trailing deps, so this file never names a sibling. The transform
// returns NEW state; completion requires the contract to be accepted and
// its target met (progress counts advance via the tracking child). The
// reputation event for the offering faction is the caller's hook (the
// relation seam is a sibling domain). Q9: finishing the final contract of
// the authored chain sets the campaign-complete state.
// ============================================================
const completeMission = function (state, missionId, deps){
  const d = deps || {};
  const table = Array.isArray(d.contracts) ? d.contracts : [];
  const s = state || {};
  const prog = s.contracts || {};
  const active = Array.isArray(prog.active) ? prog.active : [];
  const done = Array.isArray(prog.done) ? prog.done : [];
  if (!missionId || active.indexOf(missionId) === -1 || done.indexOf(missionId) !== -1){
    return { state: s, payout: 0, completed: false, final: false };
  }
  let row = null;
  for (let i = 0; i < table.length; i++){
    if (table[i] && table[i].id === missionId){ row = table[i]; break; }
  }
  if (!row) return { state: s, payout: 0, completed: false, final: false };
  const made = (prog.progress && prog.progress[missionId]) || {};
  const target = row.target || {};
  for (const k of Object.keys(target)){
    if ((Number(made[k]) || 0) < (Number(target[k]) || 0)){
      return { state: s, payout: 0, completed: false, final: false };
    }
  }
  const isFinal = Boolean(row.final);
  const nextProg = Object.assign({}, prog.progress || {});
  delete nextProg[missionId];
  return {
    state: Object.assign({}, s, {
      wallet: (typeof s.wallet === "number") ? s.wallet + (row.payout || 0) : (row.payout || 0),
      contracts: {
        active: active.filter(function (id){ return id !== missionId; }),
        done: done.concat([missionId]),
        progress: nextProg,
        campaignComplete: Boolean(prog.campaignComplete) || isFinal
      }
    }),
    payout: row.payout || 0,
    completed: true,
    final: isFinal
  };
};
// Loading convention: this file defines completeMission at top level; the
// owner captures it after the boot list resolves.
