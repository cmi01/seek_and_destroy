"use strict";

// ============================================================
// reservePlacement.js — job: compose the reserve-entry handle over its
// per-decision children (visible cells / deployment split).
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const reservePlacement = function (D){
  return {
    getValidWarpCells(ctx, capitalUnit, radius){ return listWarpCells(D, ctx, capitalUnit, radius); },
    splitOverflow(deployable, capacity, choice){ return planDeployment(deployable, capacity, choice); }
  };
};
