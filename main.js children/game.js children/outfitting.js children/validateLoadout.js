"use strict";

// ============================================================
// validateLoadout.js — job: decide whether a loadout fits a hull's capacity.
// Owner: outfitting.js (pure). Holds no state.
//
// DESIGN §3.3: a loadout is valid when the sum of its weapons' slot sizes
// is within the hull's capacity. Over capacity, unknown weapon names and
// non-array loadouts are rejected with a reason. Siblings never call each
// other, so the slot-size function travels in as data (4th argument, bound
// by the composer).
// ============================================================

const validateLoadout = function (loadout, hull, weapons, slotsOf){
  const capacity = (hull && Number.isFinite(hull.capacity)) ? hull.capacity : 0;
  const out = { ok: false, reason: "", usedSlots: 0, capacity };
  if (!Array.isArray(loadout)){
    out.reason = "loadout must be an array";
    return out;
  }
  const table = weapons || {};
  const sizeOf = (typeof slotsOf === "function") ? slotsOf : function (){ return 0; };
  let used = 0;
  for (let i = 0; i < loadout.length; i++){
    const name = loadout[i];
    const w = table[name];
    if (!w){
      out.reason = "unknown weapon: " + String(name);
      out.usedSlots = used;
      return out;
    }
    used += sizeOf(w);
  }
  out.usedSlots = used;
  if (used > capacity){
    out.reason = "over capacity: " + used + " > " + capacity;
    return out;
  }
  out.ok = true;
  return out;
};
