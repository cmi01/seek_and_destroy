"use strict";

// ============================================================
// actionLegality.js — job: compose the action-legality handle over its per-decision children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const actionLegality = function (){
  // Every member decides from plain evidence its caller fetched from the
  // query layer — this layer never touches the board.
  return {
    canMove(unitA, B, ev){ return canUnitMove(unitA, B, ev); },
    canCapture(unitA, B, ev){ return canUnitCapture(unitA, B, ev); },
    canShoot(unitA, B, ev){ return canUnitShoot(unitA, B, ev); },
    canShield(unitA, B, ev){ return canUnitShield(unitA, B, ev); },
    getPriorityActionAt(unitA, gx, gy, evidence, opts){
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
