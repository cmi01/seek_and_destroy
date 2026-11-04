"use strict";

// ============================================================
// hasMapEvent.js — job: whether an event list carries an event of a given kind (hasMapEvent).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const hasMapEvent = function (p){
  return p.events.some(function (e){ return e && e.kind === p.kind; });
};
