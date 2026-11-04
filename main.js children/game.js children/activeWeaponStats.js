"use strict";

// ============================================================
// activeWeaponStats.js — job: read the chosen weapon's own damage and range, 0 when unarmed (activeWeaponStats).
// Owner: game.js (pure child). Holds no state.
// ============================================================
// The chosen weapon's own damage/range — the red numbers and the SHOOT
// affordance radius show THIS weapon only (Q8), never a sum/max.
const activeWeaponStats = function (weapon){
  return { damage: weapon ? weapon.dmg : 0, range: weapon ? weapon.range : 0 };
};
