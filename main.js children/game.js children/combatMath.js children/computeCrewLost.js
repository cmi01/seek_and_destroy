"use strict";

// ============================================================
// computeCrewLost.js — job: count crew killed from a hull's lost-HP fraction.
// Owner: combatMath.js (pure). Holds no state.
//
// M2 interface (roadmap-design §5.2): computeCrewLost(damage, maxHp, crew) →
// number. DESIGN §4.5: a percentage of crew equal to half the percentage of
// HP lost is killed. Floor so a fully-crewed ship cannot go under 50% from
// a single 100% hull loss in one hit-batch (the remaining half survive).
// ============================================================
const computeCrewLost = function (damage, maxHp, crew){
  if (!(damage > 0) || !(maxHp > 0) || !(crew > 0)) return 0;
  const frac = Math.min(1, damage / maxHp);
  return Math.floor(crew * 0.5 * frac);
};
