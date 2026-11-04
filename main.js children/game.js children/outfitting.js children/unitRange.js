"use strict";

// ============================================================
// unitRange.js — job: a unit's effective weapon range from its loadout.
// Owner: outfitting.js (pure). Holds no state.
//
// Effective range = the reach of its longest-range mounted weapon (a ship
// fires one weapon per shot — DESIGN §2.1 — so this is the radius its
// threat reaches). Unarmed loadouts read 0. A one-weapon loadout yields
// exactly that weapon's range.
// ============================================================

const unitRange = function (unit, weapons){
  const names = (unit && Array.isArray(unit.loadout)) ? unit.loadout : [];
  const table = weapons || {};
  let best = 0;
  for (let i = 0; i < names.length; i++){
    const w = table[names[i]];
    if (w && Number.isFinite(w.range) && w.range > best) best = w.range;
  }
  return best;
};
