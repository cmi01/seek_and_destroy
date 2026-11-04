"use strict";

// ============================================================
// isLethalShot.js — job: decide whether a shot would destroy its target this turn.
// Owner: combatMath.js (pure). Holds no state.
//
// M5 adoption: the damage model keys on the firing weapon's row (its
// damage and rail/non-rail class) — the same math as the outcome resolver.
// ============================================================

const isLethalShot = function (D, weapon, target){
  if (!target || target.hp <= 0) return false;
  if (target.kind === "mirage") return true;
  const shieldDmg = D.combatRules.shieldNonRailgunDamage || 1;
  const fp = (weapon && Number.isFinite(weapon.dmg)) ? weapon.dmg : 0;
  const rail = Boolean(weapon && weapon.class === "railgun");
  const dmg = (target.flags.has("+shield") && !rail) ? shieldDmg : fp;
  return (target.hp - dmg) <= 0;
};
