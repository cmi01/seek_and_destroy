"use strict";

// ============================================================
// computeSlotSize.js — job: compute a weapon's slot size from its stats.
// Owner: outfitting.js (pure). Holds no state.
//
// DESIGN §3.2: slot size = damage × range, ×1.5 for railguns, rounded to
// the nearest integer. The frozen weapon table carries the same number as
// plain data; this formula is the rule's single implementation (the table
// field is a mirror, pinned by test).
// ============================================================

const computeSlotSize = function (weapon){
  const dmg = (weapon && Number.isFinite(weapon.dmg)) ? weapon.dmg : 0;
  const range = (weapon && Number.isFinite(weapon.range)) ? weapon.range : 0;
  const railFactor = (weapon && weapon.class === "railgun") ? 1.5 : 1;
  return Math.round(dmg * range * railFactor);
};
