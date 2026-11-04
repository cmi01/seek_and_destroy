"use strict";

// ============================================================
// isShootableFrom.js — job: decide from plain evidence whether a unit can shoot a target from a destination.
// Owner: combatMath.js (pure). Holds no state.
// ============================================================

// Decides from plain evidence the parent fetched ({ inRange, spotted,
// losClear }) plus the firing weapon row — this file never touches the
// board. An unarmed shot (no weapon row) never fires.
const isShootableFrom = function (weapon, dest, target, ev){
  if (!target || target.hp <= 0 || !weapon) return false;
  if (!ev.inRange || !ev.spotted) return false;
  return Boolean(ev.losClear);
};
