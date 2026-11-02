"use strict";

// ============================================================
// canUnitShoot.js — job: decide whether a unit may fire on a cell, from evidence.
// Owner: actionLegality.js (pure). Holds no state.
// ============================================================

// ev = { inWeaponRange, occ, occSpotted, losClear } — plain evidence the
// composer fetched; this file never touches the board.
const canUnitShoot = function (unitA, B, ev){
  if (!unitA || unitA.hp <= 0) return false;
  if (unitA.firepower <= 0 || unitA.flags.has("-attacked") || unitA.range <= 0) return false;
  if (!ev.inWeaponRange) return false;
  const occ = ev.occ;
  if (!occ || occ.team === unitA.team) return false;
  if (!ev.occSpotted) return false;
  if (!ev.losClear) return false;
  return true;
};
