"use strict";

// ============================================================
// pickMapPatch.js — job: the three map fields a fleet move result patches (pickMapPatch).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const pickMapPatch = function (mapState){
  return { fleets: mapState.fleets, turn: mapState.turn, locationId: mapState.locationId };
};
