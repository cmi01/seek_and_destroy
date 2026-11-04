"use strict";

// ============================================================
// combatMath.js — job: compose the combat-outcome handle over its per-decision children.
// Owner: game.js. Holds no state unless it is a core.
//
// M5 adoption: every damage decision takes the firing weapon's row — the
// parent resolves it from the unit's loadout through the seam.
// ============================================================
const combatMath = function (D){
  return {
    computeShootOutcome(unitA, target, weapon){ return resolveShootOutcome(D, weapon, target); },
    computeCollisionOutcome(unitA, occupant){ return resolveCollisionOutcome(D, unitA, occupant); },
    isKillShot(u, target, weapon){ return isLethalShot(D, weapon, target); },
    shootableFrom(weapon, dest, target, ev){ return isShootableFrom(weapon, dest, target, ev); },
    crewLostFromDamage(damage, maxHp, crew){ return computeCrewLost(damage, maxHp, crew); }
  };
};
