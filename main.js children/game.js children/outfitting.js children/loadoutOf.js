"use strict";

// ============================================================
// loadoutOf.js — job: read a unit's mounted weapon names as a fresh copy.
// Owner: outfitting.js (pure). Holds no state.
//
// The loadout array is the unit's weapon truth (M5); this reader is the
// only sanctioned way to take it off the unit. A unit without one (an
// unmigrated record) reads as unarmed.
// ============================================================

const loadoutOf = function (unit){
  return (unit && Array.isArray(unit.loadout)) ? unit.loadout.slice() : [];
};
