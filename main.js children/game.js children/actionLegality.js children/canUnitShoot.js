"use strict";

// ============================================================
// canUnitShoot.js — job: decide whether a unit may fire on a cell, from evidence.
// Owner: actionLegality.js (pure). Holds no state.
// ============================================================

// ev = { armed, inWeaponRange, occ, occSpotted, losClear } — plain evidence
// the composer fetched (M5: `armed` is the loadout seam's verdict that the
// unit mounts a weapon); this file never touches the board.
const canUnitShoot = function (unitA, B, ev){
  if (!unitA || unitA.hp <= 0) return false;
  if (ev.armed === false || unitA.flags.has("-attacked")) return false;
  if (!ev.inWeaponRange) return false;
  const occ = ev.occ;
  if (!occ || occ.team === unitA.team) return false;
  if (!ev.occSpotted) return false;
  if (!ev.losClear) return false;
  return true;
};
