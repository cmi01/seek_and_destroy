"use strict";

// ============================================================
// combatMath.js — job: compose the combat-outcome handle over its per-decision children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const combatMath = function (D){
  return {
    computeShootOutcome(unitA, target){ return resolveShootOutcome(D, unitA, target); },
    computeCollisionOutcome(unitA, occupant){ return resolveCollisionOutcome(D, unitA, occupant); },
    isKillShot(u, target){ return isLethalShot(D, u, target); },
    shootableFrom(u, dest, target, ev){ return isShootableFrom(u, dest, target, ev); },
    crewLostFromDamage(damage, maxHp, crew){ return computeCrewLost(damage, maxHp, crew); }
  };
};
