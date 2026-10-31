"use strict";

// ============================================================
// combatMath.js — job: compute combat outcomes.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("combatMath", D => {
  function computeShootOutcome(unitA, target){
    const shieldDmg = D.combatRules.shieldNonRailgunDamage || 1;
    if (target.flags.has("+shield")){
      // Any hit breaks the bubble; only #railgun fire keeps its full
      // firepower through the break — other weapons are cut to shieldDmg.
      const dmg = unitA.flags.has("#railgun") ? unitA.firepower : shieldDmg;
      return { damageDealt: dmg, shieldStripped: true };
    }
    return { damageDealt: unitA.firepower, shieldStripped: false };
  }

  function computeCollisionOutcome(unitA, occupant){
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
  }

  function isKillShot(u, target){
    if (!target || target.hp <= 0) return false;
    const shieldDmg = D.combatRules.shieldNonRailgunDamage || 1;
    const dmg = (target.flags.has("+shield") && !u.flags.has("#railgun")) ? shieldDmg : u.firepower;
    return (target.hp - dmg) <= 0;
  }

  // Decides from plain evidence the parent fetched ({ inRange, spotted,
  // losClear }) — this file never touches the board.
  function shootableFrom(u, dest, target, ev){
    if (!target || target.hp <= 0 || u.firepower <= 0 || u.range <= 0) return false;
    if (!ev.inRange || !ev.spotted) return false;
    return Boolean(ev.losClear);
  }

  return {
    computeShootOutcome,
    computeCollisionOutcome,
    isKillShot,
    shootableFrom
  };
});
