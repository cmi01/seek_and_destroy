"use strict";

// ============================================================
// isShootableFrom.js — job: decide from plain evidence whether a unit can shoot a target from a destination.
// Owner: combatMath.js (pure). Holds no state.
// ============================================================

// Decides from plain evidence the parent fetched ({ inRange, spotted,
// losClear }) — this file never touches the board.
const isShootableFrom = function (u, dest, target, ev){
  if (!target || target.hp <= 0 || u.firepower <= 0 || u.range <= 0) return false;
  if (!ev.inRange || !ev.spotted) return false;
  return Boolean(ev.losClear);
};
