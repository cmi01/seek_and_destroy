"use strict";

// ============================================================
// resolveShootOutcome.js — job: compute a shot's damage and shield break.
// Owner: combatMath.js (pure). Holds no state.
// ============================================================

const resolveShootOutcome = function (D, unitA, target){
  const shieldDmg = D.combatRules.shieldNonRailgunDamage || 1;
  if (target.flags.has("+shield")){
    // Any hit breaks the bubble; only #railgun fire keeps its full
    // firepower through the break — other weapons are cut to shieldDmg.
    const dmg = unitA.flags.has("#railgun") ? unitA.firepower : shieldDmg;
    return { damageDealt: dmg, shieldStripped: true };
  }
  return { damageDealt: unitA.firepower, shieldStripped: false };
};
