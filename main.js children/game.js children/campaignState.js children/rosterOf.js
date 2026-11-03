"use strict";

// ============================================================
// rosterOf.js — job: read the fleet roster out of a campaign state, with an
// optional predicate filter.
// Owner: campaignState.js (pure). Holds no state.
//
// M1 interface (roadmap-design §5.1): rosterOf(campaignState, filter?)
// → RosterEntry[]. Never aliases the stored array: a copy is returned.
// ============================================================

const rosterOf = function (campaignState, filter){
  const fleet = (campaignState && Array.isArray(campaignState.fleet)) ? campaignState.fleet : [];
  return (typeof filter === "function") ? fleet.filter(filter) : fleet.slice();
};
