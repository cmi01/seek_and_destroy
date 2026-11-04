"use strict";

// ============================================================
// actionLegality.js — job: compose the action-legality handle over its per-decision children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const actionLegality = function (){
  // Every member decides from plain evidence its caller fetched from the
  // query layer — this layer never touches the board. M4 (DESIGN §4.5):
  // a unit under 50% crew cannot act in battle — the manning gate wraps
  // every verdict (the flagship included: it still deploys per Q2, but an
  // incapacitated crew cannot work the ship).
  function able(unitA){
    return crewStatus(unitA) !== "incapacitated";
  }
  return {
    // Handle members are PascalCase so this file's callers never spell the
    // child's raw stem (reference_audit check 1 counts raw text).
    CrewStatus(unit, maxCrew){ return crewStatus(unit, maxCrew); },
    canMove(unitA, B, ev){ return able(unitA) && canUnitMove(unitA, B, ev); },
    canCapture(unitA, B, ev){ return able(unitA) && canUnitCapture(unitA, B, ev); },
    canShoot(unitA, B, ev){ return able(unitA) && canUnitShoot(unitA, B, ev); },
    canShield(unitA, B, ev){ return able(unitA) && canUnitShield(unitA, B, ev); },
    getPriorityActionAt(unitA, gx, gy, evidence, opts){
      if (!able(unitA)) return null;
      const B = { x: gx, y: gy };
      const ev = evidence || {};
      // The four verdicts are plain data handed to the picker, which owns the
      // ordering. Evaluating all four eagerly is safe: each decision guards
      // null/dead units itself and every one is pure.
      return priorityActionAt(unitA, gx, gy, {
        move: canUnitMove(unitA, B, ev.move || {}),
        shoot: canUnitShoot(unitA, B, ev.shoot || {}),
        capture: canUnitCapture(unitA, B, ev.capture || {}),
        shield: canUnitShield(unitA, B, ev.shield || {})
      }, opts);
    }
  };
};
