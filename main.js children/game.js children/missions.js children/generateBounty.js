"use strict";

// ============================================================
// generateBounty.js — job: return the next fixed contract posted at a
// location.
// Owner: missions.js (pure). Holds no state.
//
// M6 interface (roadmap-design §5.6): generateBounty(location,
// marketState, rng) → Mission — the frozen three-argument spelling is the
// interface and the stem injects the authored contract table and the
// progress section as the optional trailing deps, so this file never
// names a sibling. Q9 default: fixed station contracts first — the table
// is authored data, the rng stays in the signature for the procedural
// tiers that may follow. A contract is available when it is posted at the
// location and neither accepted nor done.
// ============================================================
const generateBounty = function (location, marketState, rng, deps){
  const d = deps || {};
  const table = Array.isArray(d.contracts) ? d.contracts : [];
  const progress = d.progress || {};
  const active = Array.isArray(progress.active) ? progress.active : [];
  const done = Array.isArray(progress.done) ? progress.done : [];
  const locId = (location && typeof location === "object") ? location.id : location;
  for (let i = 0; i < table.length; i++){
    const m = table[i];
    if (!m || m.locationId !== locId) continue;
    if (active.indexOf(m.id) !== -1 || done.indexOf(m.id) !== -1) continue;
    return {
      id: m.id,
      title: m.title,
      kind: m.kind,
      faction: m.faction,
      locationId: m.locationId,
      brief: m.brief,
      target: Object.assign({}, m.target || {}),
      payout: m.payout,
      next: (m.next === undefined) ? null : m.next,
      final: Boolean(m.final)
    };
  }
  return null;
};
// Loading convention: this file defines generateBounty at top level; the
// owner captures it after the boot list resolves.
