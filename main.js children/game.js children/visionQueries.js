"use strict";

// ============================================================
// visionQueries.js — job: compose the scan/visibility/spotting handle over its query children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const visionQueries = function (D){
  // Private: the occupant of a cell (an index when the caller attached one,
  // otherwise a scan). The composer needs it as plain data to hand the
  // spotting child, and a file never calls another file.
  function occupantAt(c, gx, gy){
    if (c && c.unitIndex) return c.unitIndex.get(gx * 4096 + gy) || null;
    const us = (c && c.units) || [];
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0 && u.x === gx && u.y === gy) return u;
    }
    return null;
  }

  return {
    effectiveScan(ctx, unit){ return unitScanRange(D, ctx, unit); },
    isCellVisibleToTeam(ctx, gx, gy, team){ return cellVisibleToTeam(D, ctx, gx, gy, team); },
    isUnitSpottedByTeam(ctx, targetUnit, observerTeam){ return unitSpottedByTeam(D, ctx, targetUnit, observerTeam); },
    getSpottedEnemyAt(ctx, gx, gy, observerTeam){
      const u = occupantAt(ctx, gx, gy);
      if (!u || u.team === observerTeam) return null;
      return unitSpottedByTeam(D, ctx, u, observerTeam) ? u : null;
    }
  };
};
