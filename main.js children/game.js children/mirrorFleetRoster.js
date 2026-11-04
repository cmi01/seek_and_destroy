"use strict";

// ============================================================
// mirrorFleetRoster.js — job: write the campaign roster onto the player's map fleet as ship records (mirrorFleetRoster).
// Owner: game.js (pure child). Holds no state.
// ============================================================
// The map fleet mirrors the post-trade roster (same shape the battle fold
// uses): hull records carry crew/maxCrew/speed/flagship and the movement
// rules read them directly.
const mirrorFleetRoster = function (p){
  const s = p.state;
  const specs = p.shipSpecs;
  if (!s || !s.map || !Array.isArray(s.map.fleets)) return s;
  const ships = (Array.isArray(s.fleet) ? s.fleet : []).map(function (e){
    const spec = specs[e.hull] || {};
    return {
      hull: e.hull,
      crew: (typeof e.crew === "number") ? e.crew : 0,
      maxCrew: (typeof e.maxCrew === "number") ? e.maxCrew : ((typeof spec.crew === "number") ? spec.crew : 0),
      speed: (typeof spec.move === "number") ? spec.move : 1,
      flagship: Boolean(e.flagship) || (Array.isArray(spec.flags) && spec.flags.indexOf("!flagship") !== -1)
    };
  });
  return Object.assign({}, s, {
    map: Object.assign({}, s.map, {
      fleets: s.map.fleets.map(function (f){
        return f.faction === "player" ? Object.assign({}, f, { ships: ships }) : f;
      })
    })
  });
};
