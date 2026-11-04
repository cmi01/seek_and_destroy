"use strict";

// ============================================================
// tryPatchCampaignState.js — job: guarded pure patch of the campaign section.
// Owner: campaignState.js (pure). Holds no state.
//
// M1 interface (roadmap-design §5.1): tryPatchCampaignState(state, patch)
// → { state }. Only the known CampaignState keys may be patched; any unknown
// key, missing state or non-object patch yields { state: null } and the
// caller keeps the previous state. No in-place mutation: the result is a new
// shallow copy that shares untouched subtrees.
// ============================================================

const tryPatchCampaignState = function (state, patch){
  const KNOWN_KEYS = ["fleet", "wallet", "cargo", "reputation", "clock", "map", "market"];
  if (!state || !patch || typeof patch !== "object" || Array.isArray(patch)) return { state: null };
  for (let i = 0; i < Object.keys(patch).length; i++){
    if (!KNOWN_KEYS.includes(Object.keys(patch)[i])) return { state: null };
  }
  const next = {};
  KNOWN_KEYS.forEach(k => { if (state[k] !== undefined) next[k] = state[k]; });
  Object.keys(patch).forEach(k => { next[k] = patch[k]; });
  return { state: next };
};
