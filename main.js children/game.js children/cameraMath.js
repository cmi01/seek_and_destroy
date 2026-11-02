"use strict";

// ============================================================
// cameraMath.js — job: compose the zoom and viewport geometry handle over its per-operation children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const cameraMath = function (D){
  return {
    resolveZoom(viewX, viewY, viewSpan, mousePx, deltaY, displaySize){
      return resolveZoomStep(D, viewX, viewY, viewSpan, mousePx, deltaY, displaySize);
    },
    clampViewport(viewX, viewY, viewSpan){ return clampViewportToBoard(D, viewX, viewY, viewSpan); },
    getRenderedViewport: computeRenderedViewport,
    pixelToGrid(px, py, vp){ return pixelToCell(D, px, py, vp); },
    gridToCenter: computeCellCentre
  };
};
