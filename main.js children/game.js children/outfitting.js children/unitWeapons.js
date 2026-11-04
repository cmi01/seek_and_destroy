"use strict";

// ============================================================
// unitWeapons.js — job: resolve a unit's loadout to weapon specs.
// Owner: outfitting.js (pure). Holds no state.
//
// Returns one plain row per mounted weapon: { name, class, dmg, range,
// slots } — fresh copies with the mount name attached, so per-shot weapon
// choice (DESIGN §2.1, the Q8 ruling) carries its stats as data. Names the
// frozen table cannot resolve are skipped.
// ============================================================

const unitWeapons = function (unit, weapons){
  const names = (unit && Array.isArray(unit.loadout)) ? unit.loadout : [];
  const table = weapons || {};
  const out = [];
  for (let i = 0; i < names.length; i++){
    const name = names[i];
    const w = table[name];
    if (!w) continue;
    out.push({
      name,
      class: w.class,
      dmg: Number.isFinite(w.dmg) ? w.dmg : 0,
      range: Number.isFinite(w.range) ? w.range : 0,
      slots: Number.isFinite(w.slots) ? w.slots : 0
    });
  }
  return out;
};
