"use strict";

// ============================================================
// missions.js — job: compose the missions handle over its fixed-contract
// children (post / settle / progress tracking).
// Owner: game.js. Holds no state unless it is a core.
//
// M6 (roadmap-design §4.6, Q9): the station-contract seam — the authored
// chain arrives as the frozen contract table the parent injects; the
// progress section travels inside the campaign section the transforms
// receive. Payouts land in the wallet inside the settling child; the
// reputation event and the campaign-complete end state surface through the
// caller's hooks.
// ============================================================
const missions = function (config){
  const table = (config && Array.isArray(config.contracts)) ? config.contracts : [];

  function progressOf(state){ return (state && state.contracts) || {}; }

  return {
    Table(){ return table.map(function (m){ return Object.assign({}, m); }); },
    NextAt(location, state, rng){
      return generateBounty(location, null, rng, { contracts: table, progress: progressOf(state) });
    },
    Accept(state, missionId){
      const s = state || {};
      const prog = progressOf(s);
      const active = Array.isArray(prog.active) ? prog.active : [];
      const done = Array.isArray(prog.done) ? prog.done : [];
      if (!missionId || active.indexOf(missionId) !== -1 || done.indexOf(missionId) !== -1) return s;
      let known = false;
      for (let i = 0; i < table.length; i++){ if (table[i] && table[i].id === missionId){ known = true; break; } }
      if (!known) return s;
      return Object.assign({}, s, {
        contracts: Object.assign({}, prog, { active: active.concat([missionId]) })
      });
    },
    Complete(state, missionId){ return completeMission(state, missionId, { contracts: table }); },
    Advance(state, kind, amount){ return advanceContracts(state, kind, amount); }
  };
};
// Loading convention: this file defines missions at top level; the owner
// captures it after the boot list resolves.
