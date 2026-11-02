"use strict";

// ============================================================
// unitOnCell.js — job: return the living unit standing on a cell.
// Owner: boardQueries.js (pure). Holds no state.
// ============================================================

const unitOnCell = function (ctx, gx, gy){
  function keyOf(x, y){ return x * 4096 + y; }

  // Fast path: an index built for an unchanging board, otherwise a scan.
  if (ctx && ctx.unitIndex) return ctx.unitIndex.get(keyOf(gx, gy)) || null;
  const us = (ctx && ctx.units) || [];
  for (let i = 0; i < us.length; i++){
    const u = us[i];
    if (u.hp > 0 && u.x === gx && u.y === gy) return u;
  }
  return null;
};
