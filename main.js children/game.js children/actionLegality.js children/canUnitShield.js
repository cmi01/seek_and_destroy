"use strict";

// ============================================================
// canUnitShield.js — job: decide whether a unit may raise its shield, from evidence.
// Owner: actionLegality.js (pure). Holds no state.
// ============================================================

// Flags are a Set on live units and an Array in the ship-spec table and test
// fixtures, so both shapes are accepted.
const canUnitShield = function (unitA, B, ev){
  function hasFlag(unit, flag){
    if (!unit || !unit.flags) return false;
    return typeof unit.flags.has === "function" ? unit.flags.has(flag) : unit.flags.includes(flag);
  }

  if (!unitA || unitA.hp <= 0 || !B) return false;
  if (typeof ev.ap === "number" && ev.ap <= 0) return false;
  if (unitA.x !== B.x || unitA.y !== B.y) return false;
  if (!hasFlag(unitA, "#shield generator")) return false;
  if (hasFlag(unitA, "+shield")) return false;
  return true;
};
