"use strict";

// ============================================================
// stationAt.js — job: the station location the player fleet is docked at, or null (stationAt).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const stationAt = function (p){
  const c = p.campaign;
  const map = (c && c.map) || null;
  if (!map || map.screen !== "map" || map.pendingEncounter) return null;
  const locs = Array.isArray(map.locations) ? map.locations : [];
  for (let i = 0; i < locs.length; i++){
    if (locs[i].id === map.locationId && locs[i].kind === "station") return locs[i];
  }
  return null;
};
