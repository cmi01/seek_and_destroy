"use strict";
// ============================================================
// terrainTileIndex.js — job: index terrain-cache tiles for a viewport.
// Owner: graphics.js. Holds no state.
// ============================================================

const terrainTileIndex = function (input) {
  const src = input || {};
  const gridSize = Math.max(1, src.gridSize | 0);
  const cellPx = (typeof src.cellPx === "number" && src.cellPx > 0) ? src.cellPx : 1;
  const rs = (typeof src.renderScale === "number" && src.renderScale > 0) ? src.renderScale : 1;
  const maxSide = (typeof src.maxTileSide === "number" && src.maxTileSide > 0) ? src.maxTileSide : 2048;
  const budgetPx = (typeof src.budgetPx === "number" && src.budgetPx > 0) ? src.budgetPx : 67108864;
  const clamp = function (v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  };
  const dx0 = src.dx0 | 0;
  const dx1 = src.dx1 | 0;
  const dy0 = src.dy0 | 0;
  const dy1 = src.dy1 | 0;
  const x0 = clamp(dx0 < dx1 ? dx0 : dx1, 0, gridSize);
  const x1 = clamp(dx0 < dx1 ? dx1 : dx0, 0, gridSize);
  const y0 = clamp(dy0 < dy1 ? dy0 : dy1, 0, gridSize);
  const y1 = clamp(dy0 < dy1 ? dy1 : dy0, 0, gridSize);

  let density = rs;
  let paintCP = cellPx * density;
  let cellsPerTile;
  if (paintCP > maxSide) {
    density = maxSide / cellPx;
    paintCP = maxSide;
    cellsPerTile = 1;
  } else {
    cellsPerTile = Math.max(1, Math.floor(maxSide / paintCP));
  }
  const tilePx = Math.max(1, Math.ceil(cellsPerTile * paintCP));
  const tilesAcross = Math.max(1, Math.ceil(gridSize / cellsPerTile));

  const tileOf = function (cell) {
    return Math.floor(clamp(cell, 0, gridSize - 1) / cellsPerTile);
  };
  const specAt = function (tx, ty) {
    const gx0 = tx * cellsPerTile;
    const gy0 = ty * cellsPerTile;
    const cellsX = Math.min(cellsPerTile, gridSize - gx0);
    const cellsY = Math.min(cellsPerTile, gridSize - gy0);
    return {
      tx: tx,
      ty: ty,
      gx0: gx0,
      gy0: gy0,
      cellsX: cellsX,
      cellsY: cellsY,
      key: tx + ":" + ty,
      pxW: Math.max(1, Math.ceil(cellsX * paintCP)),
      pxH: Math.max(1, Math.ceil(cellsY * paintCP))
    };
  };

  const visTx0 = tileOf(x0);
  const visTx1 = tileOf(Math.max(x0, x1 - 1));
  const visTy0 = tileOf(y0);
  const visTy1 = tileOf(Math.max(y0, y1 - 1));
  const visible = [];
  for (let ty = visTy0; ty <= visTy1; ty++) {
    for (let tx = visTx0; tx <= visTx1; tx++) {
      visible.push(specAt(tx, ty));
    }
  }

  const keepTx0 = Math.max(0, visTx0 - 1);
  const keepTx1 = Math.min(tilesAcross - 1, visTx1 + 1);
  const keepTy0 = Math.max(0, visTy0 - 1);
  const keepTy1 = Math.min(tilesAcross - 1, visTy1 + 1);
  const keep = [];
  const seen = {};
  for (let i = 0; i < visible.length; i++) seen[visible[i].key] = true;
  for (let ty = keepTy0; ty <= keepTy1; ty++) {
    for (let tx = keepTx0; tx <= keepTx1; tx++) {
      const spec = specAt(tx, ty);
      if (seen[spec.key]) continue;
      keep.push(spec);
      seen[spec.key] = true;
    }
  }

  return {
    density: density,
    cellsPerTile: cellsPerTile,
    tilePx: tilePx,
    paintCP: paintCP,
    tilesAcross: tilesAcross,
    budgetPx: budgetPx,
    visible: visible,
    keep: keep
  };
};

globalThis.terrainTileIndex = terrainTileIndex;
