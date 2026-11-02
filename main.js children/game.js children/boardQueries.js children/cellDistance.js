"use strict";

// ============================================================
// cellDistance.js — job: measure the euclidean distance between two cells.
// Owner: boardQueries.js (pure). Holds no state.
// ============================================================

const cellDistance = function (a, b){
  return Math.hypot(a.x - b.x, a.y - b.y);
};
