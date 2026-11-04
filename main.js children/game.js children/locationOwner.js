"use strict";

// ============================================================
// locationOwner.js — job: the faction that speaks for a map location, or null (locationOwner).
// Owner: game.js (pure child). Holds no state.
// ============================================================
// M6(b): the faction that speaks for a map location (the row's `owner`),
// else null — the trade/mission reputation counterparty.
const locationOwner = function (p){
  const locs = p.locations || [];
  for (let i = 0; i < locs.length; i++){
    if (locs[i].id === p.locId) return locs[i].owner || null;
  }
  return null;
};
