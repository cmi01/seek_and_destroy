"use strict";

// ============================================================
// resolveWeaponFxType.js — job: map a weapon row to its historical FX/audio key (resolveWeaponFxType).
// Owner: game.js (pure child). Holds no state.
// ============================================================
// Render/audio style key for a weapon row: the animation and audio channels
// keep their historical pdc/missile/railgun spelling.
const resolveWeaponFxType = function (weapon){
  if (!weapon) return "pdc";
  return weapon.class === "cannon" ? "pdc" : weapon.class;
};
