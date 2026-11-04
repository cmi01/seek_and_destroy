"use strict";

// ============================================================
// resolveShootOutcome.js — job: compute a shot's damage and shield break.
// Owner: combatMath.js (pure). Holds no state.
//
// M5 adoption: damage and the shield-break rule key on the FIRING WEAPON
// (DESIGN §2.4 — a railgun-class weapon keeps full damage through the
// bubble, every other weapon is cut to the shield hit), not on a hull
// flag. `weapon` is the chosen WeaponSpec row ({class, dmg, range, …}) or
// null for an unarmed shot (0 damage — the shield-break still triggers on
// any hit, exactly as before).
// ============================================================

const resolveShootOutcome = function (D, weapon, target){
  // A mirage has no HP: any hit destroys it (DESIGN §2.8).
  if (target && target.kind === "mirage"){
    return { damageDealt: Math.max(target.hp || 1, 1), shieldStripped: false };
  }
  const shieldDmg = D.combatRules.shieldNonRailgunDamage || 1;
  const fp = (weapon && Number.isFinite(weapon.dmg)) ? weapon.dmg : 0;
  const rail = Boolean(weapon && weapon.class === "railgun");
  if (target.flags.has("+shield")){
    // Any hit breaks the bubble; only railgun-class fire keeps its full
    // damage through the break — other weapons are cut to shieldDmg.
    return { damageDealt: rail ? fp : shieldDmg, shieldStripped: true };
  }
  return { damageDealt: fp, shieldStripped: false };
};
