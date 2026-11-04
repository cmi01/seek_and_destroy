"use strict";

// ============================================================
// findFlagshipLocus.js — job: return the first living non-flagship unit of a team (findFlagshipLocus).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const findFlagshipLocus = function (p){
  const us = p.units || [];
  for (let i = 0; i < us.length; i++){
    const u = us[i];
    if (u.hp > 0 && u.team === p.team && u.flags.has("!flagship")){ return u; }
  }
  return null;
};
