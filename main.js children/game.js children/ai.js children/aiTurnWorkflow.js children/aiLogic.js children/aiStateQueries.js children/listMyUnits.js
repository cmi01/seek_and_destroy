"use strict";

// ============================================================
// listMyUnits.js — job: list the AI team's living units from a state snapshot.
// Owner: aiStateQueries.js. Holds no state.
// ============================================================

const listMyUnits = function (env, ctx){
  return ((ctx && ctx.units) || []).filter(u => u.hp > 0 && u.team === 2);
};
