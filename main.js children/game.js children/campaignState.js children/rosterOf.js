"use strict";

// ============================================================
// rosterOf.js — job: read the fleet roster out of a campaign section, with an
// optional predicate filter.
// Owner: campaignState.js (pure). Holds no state.
//
// M1 interface (roadmap-design §5.1): rosterOf(section, filter?)
// → RosterEntry[]. Never aliases the stored array: a copy is returned.
// The parameter is named section, not after the parent file: a child must
// not name its parent.
// ============================================================

const rosterOf = function (section, filter){
  const fleet = (section && Array.isArray(section.fleet)) ? section.fleet : [];
  return (typeof filter === "function") ? fleet.filter(filter) : fleet.slice();
};
