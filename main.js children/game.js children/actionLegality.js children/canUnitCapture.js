"use strict";

// ============================================================
// canUnitCapture.js — job: decide whether a unit may board an enemy ship, from evidence.
// Owner: actionLegality.js (pure). Holds no state.
// ============================================================

// ev = { inBoardRange, occ, occSpotted } — plain evidence the composer
// fetched; this file never touches the board.
const canUnitCapture = function (unitA, B, ev){
  if (!unitA || unitA.hp <= 0) return false;
  if (!unitA.flags.has("#space marines") || unitA.flags.has("-sent boarding party")) return false;
  if (!ev.inBoardRange) return false;
  const occ = ev.occ;
  if (!occ || occ.team === unitA.team) return false;
  if (!ev.occSpotted) return false;
  if (occ.flags.has("!flagship")) return false;
  return true;
};
