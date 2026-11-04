"use strict";

// ============================================================
// sharesSensors.js — job: decide whether one relation's band shares
// sensor data in a given place.
// Owner: reputation.js (pure). Holds no state.
//
// M6 (DESIGN §2.7, roadmap-design §5.6): allied-only sharing OUT of
// battle; friendly and allied share raw sensor vision IN battle; never in
// hyperspace and never across different solar systems. Sharing is
// pairwise (the caller asks per pair), so it is not transitive by
// construction. `where` is plain data: { inBattle, inHyperspace,
// sameSystem } — an explicit false is required to deny; a missing place
// reads as out-of-battle, same system, not hyperspace.
// ============================================================
const sharesSensors = function (band, where){
  const w = where || {};
  if (w.sameSystem === false) return false;
  if (w.inHyperspace) return false;
  if (!band) return false;
  if (w.inBattle) return band === "friendly" || band === "allied";
  return band === "allied";
};
// Loading convention: this file defines sharesSensors at top level; the
// owner captures it after the boot list resolves.
