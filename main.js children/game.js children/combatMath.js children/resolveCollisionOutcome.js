"use strict";

// ============================================================
// resolveCollisionOutcome.js — job: compute the remainder hulls of a collision between two units.
// Owner: combatMath.js (pure). Holds no state.
// ============================================================

const resolveCollisionOutcome = function (D, unitA, occupant){
  // A ram into (or by) a mirage destroys both hulls (DESIGN §2.8).
  if ((unitA && unitA.kind === "mirage") || (occupant && occupant.kind === "mirage")){
    return {
      moverHadShield: false,
      occHadShield: false,
      moverRem: -1,
      occRem: -1
    };
  }
  const shieldBonus = D.combatRules.shieldCollisionBonus || 1;
  const moverHadShield = unitA.flags.has("+shield");
  const occHadShield = occupant.flags.has("+shield");
  const moverEff = unitA.hp + (moverHadShield ? shieldBonus : 0);
  const occEff = occupant.hp + (occHadShield ? shieldBonus : 0);
  return {
    moverHadShield,
    occHadShield,
    moverRem: moverEff - occEff,
    occRem: occEff - moverEff
  };
};
