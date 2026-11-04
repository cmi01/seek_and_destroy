"use strict";

// ============================================================
// defaultLoadoutOf.js — job: derive a hull's default loadout from its spec.
// Owner: outfitting.js (pure). Holds no state.
//
// DESIGN §3.3: each hull's capacity equals the slot total of its default
// loadout; unarmed hulls carry none. Returns a fresh copy with only names
// the frozen weapon table can mount (a corrupt row cannot leak past here).
// ============================================================

const defaultLoadoutOf = function (hull, weapons){
  const declared = (hull && Array.isArray(hull.defaultLoadout)) ? hull.defaultLoadout : [];
  const table = weapons || {};
  const out = [];
  for (let i = 0; i < declared.length; i++){
    const name = declared[i];
    if (table[name]) out.push(name);
  }
  return out;
};
