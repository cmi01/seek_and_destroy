"use strict";

// ============================================================
// boardQueries.js — job: compose the board-query handle over its seven single-purpose children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const boardQueries = function (D){
  return {
    inBounds(ctx, gx, gy){ return cellOnBoard(D, ctx, gx, gy); },
    dist(a, b){ return cellDistance(a, b); },
    inRange(a, b, r){ return cellsWithinRange(D, a, b, r); },
    terrainAt(ctx, gx, gy){ return terrainOfCell(D, ctx, gx, gy); },
    cellKey(gx, gy){ return occupancyKey(gx, gy); },
    buildUnitIndex(units){ return indexLivingUnits(units); },
    getUnitAt(ctx, gx, gy){ return unitOnCell(ctx, gx, gy); }
  };
};
