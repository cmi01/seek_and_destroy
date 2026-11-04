"use strict";

// ============================================================
// reputationBand.js — job: map a reputation score to its quintile band.
// Owner: reputation.js (pure). Holds no state.
//
// M6 interface (roadmap-design §5.6): reputationBand(score) →
// "enemy" | "unfriendly" | "neutral" | "friendly" | "allied" — the five
// 60-point quintiles over −100..200 (Q10 adopted boundaries:
// [−100,−40) [−40,20) [20,80) [80,140) [140,200]). Scores clamp to the
// scale; the band boundaries are the fixed Q10 decision, cited here once.
// ============================================================
const reputationBand = function (score){
  const s = Math.max(-100, Math.min(200, Math.trunc(Number(score) || 0)));
  if (s < -40) return "enemy";
  if (s < 20) return "unfriendly";
  if (s < 80) return "neutral";
  if (s < 140) return "friendly";
  return "allied";
};
// Loading convention: this file defines reputationBand at top level; the
// owner captures it after the boot list resolves.
