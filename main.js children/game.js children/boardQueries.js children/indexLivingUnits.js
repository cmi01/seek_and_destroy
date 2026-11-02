"use strict";

// ============================================================
// indexLivingUnits.js — job: index the living units by cell key.
// Owner: boardQueries.js (pure). Holds no state.
// ============================================================

// O(1) occupancy lookups afterwards: callers that do many lookups against an
// unchanging board (an AI snapshot, one rendered frame) attach the result to
// their context as ctx.unitIndex.
const indexLivingUnits = function (units){
  function keyOf(gx, gy){ return gx * 4096 + gy; }

  const index = new Map();
  const us = units || [];
  for (let i = 0; i < us.length; i++){
    const u = us[i];
    if (u.hp > 0) index.set(keyOf(u.x, u.y), u);
  }
  return index;
};
