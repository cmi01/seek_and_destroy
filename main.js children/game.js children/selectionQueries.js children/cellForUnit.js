"use strict";

// ============================================================
// cellForUnit.js — job: return the selection mirror cell (the unit's position).
// Owner: selectionQueries.js (pure). Holds no state.
// ============================================================

const cellForUnit = function (unit) {
  return unit ? { x: unit.x, y: unit.y } : null;
};
