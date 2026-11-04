"use strict";

// ============================================================
// findPlayerFleet.js — job: the player's fleet record in a map fleet list (findPlayerFleet).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const findPlayerFleet = function (p){
  return p.fleets.find(function (f){ return f.faction === "player"; });
};
