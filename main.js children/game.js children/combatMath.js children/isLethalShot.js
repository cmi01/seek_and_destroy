"use strict";

// ============================================================
// isLethalShot.js — job: decide whether a shot would destroy its target this turn.
// Owner: combatMath.js (pure). Holds no state.
// ============================================================

const isLethalShot = function (D, u, target){
  if (!target || target.hp <= 0) return false;
  const shieldDmg = D.combatRules.shieldNonRailgunDamage || 1;
  const dmg = (target.flags.has("+shield") && !u.flags.has("#railgun")) ? shieldDmg : u.firepower;
  return (target.hp - dmg) <= 0;
};
