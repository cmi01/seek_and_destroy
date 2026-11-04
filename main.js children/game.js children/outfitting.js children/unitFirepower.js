"use strict";

// ============================================================
// unitFirepower.js — job: total a unit's mounted weapon damage.
// Owner: outfitting.js (pure). Holds no state.
//
// Σ weapon dmg over the unit's loadout (the seam's firepower reader). A
// one-weapon loadout yields exactly that weapon's dmg, so the pre-M5
// single-weapon values read identically through here.
// ============================================================

const unitFirepower = function (unit, weapons){
  const names = (unit && Array.isArray(unit.loadout)) ? unit.loadout : [];
  const table = weapons || {};
  let total = 0;
  for (let i = 0; i < names.length; i++){
    const w = table[names[i]];
    if (w && Number.isFinite(w.dmg)) total += w.dmg;
  }
  return total;
};
