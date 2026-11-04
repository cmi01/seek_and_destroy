"use strict";

// ============================================================
// indexOfReserveEntry.js — job: index the reserve entry whose hull matches a ship type, or -1 (indexOfReserveEntry).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const indexOfReserveEntry = function (p){
  const reserve = p.reserve || [];
  for (let i = 0; i < reserve.length; i++){
    if ((reserve[i].hull || reserve[i].type) === p.shipType){ return i; }
  }
  return -1;
};
