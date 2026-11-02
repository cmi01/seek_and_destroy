"use strict";

// ============================================================
// canUnitMove.js — job: decide whether a unit may move onto a cell, from evidence.
// Owner: actionLegality.js (pure). Holds no state.
// ============================================================

// ev = { inMoveRange, losClear, occ, occSpotted } — plain evidence the
// composer fetched; this file never touches the board.
const canUnitMove = function (unitA, B, ev){
  if (!unitA || unitA.hp <= 0 || unitA.flags.has("-moved") || unitA.move <= 0) return false;
  if (!ev.inMoveRange) return false;
  if (unitA.x === B.x && unitA.y === B.y) return false;
  if (!ev.losClear) return false;
  const occ = ev.occ;
  if (occ){
    if (occ.team === unitA.team) return false;
    if (ev.occSpotted) return false;
  }
  return true;
};
