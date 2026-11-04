"use strict";

// ============================================================
// stanceBetween.js — job: read one faction pair's reputation and return
// its three-value relation.
// Owner: reputation.js (pure). Holds no state.
//
// M6 interface (roadmap-design §5.6): stanceBetween(repState, a, b) →
// "hostile" | "neutral" | "allied" — the frozen three-argument spelling is
// the interface and the stem injects the band reader as the optional
// trailing deps ({ band }), so this file never names a sibling. Band-driven
// (DESIGN §4.8): the enemy band fights on sight ("hostile"); unfriendly and
// neutral are cold peace ("neutral"); friendly and allied are cooperative
// ("allied"). Strictly pairwise — the pair table is read directly, never
// through a third party, so A↔B and B↔C alliances give no A↔C relation
// (DESIGN §2.7). The pair key is order-insensitive: either "a|b" or "b|a"
// is accepted.
// ============================================================
const stanceBetween = function (repState, a, b, deps){
  const rep = repState || {};
  const d = deps || {};
  const score = (rep[a + "|" + b] !== undefined) ? rep[a + "|" + b]
    : ((rep[b + "|" + a] !== undefined) ? rep[b + "|" + a] : 0);
  const band = (typeof d.band === "function") ? d.band(score) : null;
  if (band === "enemy") return "hostile";
  if (band === "friendly" || band === "allied") return "allied";
  return "neutral";
};
// Loading convention: this file defines stanceBetween at top level; the
// owner captures it after the boot list resolves.
