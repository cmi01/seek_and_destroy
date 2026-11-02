"use strict";

// ============================================================
// occupancyKey.js — job: key a board cell for O(1) occupancy maps.
// Owner: boardQueries.js (pure). Holds no state.
// ============================================================

const occupancyKey = function (gx, gy){ return gx * 4096 + gy; };
