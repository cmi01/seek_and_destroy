"use strict";

// ============================================================
// cameraMath.js — job: resolve zoom and viewport geometry.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("cameraMath", D => {
  // Camera zoom: step the zoom ladder by whole wheel notches while keeping
  // the grid cell under the cursor anchored. Pure function of its inputs.
  // (Viewport math, not a game rule — the ladder/wheel config comes from the
  // rules data table; the parent applies the returned values to state.)
  function resolveZoom(viewX, viewY, viewSpan, mousePx, deltaY, displaySize) {
    const zoomLadder = D.zoomLadder;
    const wheelNotchPx = D.wheelNotchPx;
    const maxZoomStepsPerEvent = D.maxZoomStepsPerEvent;
    const gridSize = D.gridSize;
    const DS = displaySize;
    if (deltaY === 0) return { viewX, viewY, viewSpan, changed: false };

    const rawSteps = deltaY / wheelNotchPx;
    let steps = Math.round(rawSteps);
    steps = Math.max(-maxZoomStepsPerEvent, Math.min(maxZoomStepsPerEvent, steps));
    if (steps === 0) return { viewX, viewY, viewSpan, changed: false };

    let idx = zoomLadder.indexOf(viewSpan);
    if (idx === -1) {
      let best = 0, bestDiff = Infinity;
      for (let i = 0; i < zoomLadder.length; i++) {
        const d = Math.abs(zoomLadder[i] - viewSpan);
        if (d < bestDiff) { bestDiff = d; best = i; }
      }
      idx = best;
    }

    const newIdx = Math.max(0, Math.min(zoomLadder.length - 1, idx + steps));
    if (newIdx === idx) return { viewX, viewY, viewSpan, changed: false };

    const newSpan = zoomLadder[newIdx];
    const cellPx = DS / viewSpan;
    const anchorGX = viewX + mousePx.x / cellPx;
    const anchorGY = viewY + mousePx.y / cellPx;

    const newCellPx = DS / newSpan;
    let newViewX = Math.round(anchorGX - mousePx.x / newCellPx);
    let newViewY = Math.round(anchorGY - mousePx.y / newCellPx);

    newViewX = Math.max(0, Math.min(gridSize - newSpan, newViewX));
    newViewY = Math.max(0, Math.min(gridSize - newSpan, newViewY));

    return {
      viewX: newViewX,
      viewY: newViewY,
      viewSpan: newSpan,
      changed: (newSpan !== viewSpan || newViewX !== viewX || newViewY !== viewY)
    };
  }

  // Viewport clamping to the board bounds: returns the clamped values as
  // plain data ({viewSpan, viewX, viewY}); the parent applies them to state.
  function clampViewport(viewX, viewY, viewSpan) {
    const gridSize = D.gridSize;
    const nextSpan = Math.max(5, Math.min(32, viewSpan));
    const nextX = Math.max(0, Math.min(gridSize - nextSpan, viewX));
    const nextY = Math.max(0, Math.min(gridSize - nextSpan, viewY));
    return { viewSpan: nextSpan, viewX: nextX, viewY: nextY };
  }

  // Zoom-animation interpolation: the rendered viewport at time `now` as
  // plain data. `zoomAnim` is the read-only anim state shape (from/to span,
  // x/y, start, duration, active); `now` is a number resolved by the parent.
  function getRenderedViewport(viewX, viewY, viewSpan, zoomAnim, now, displaySize) {
    const anim = zoomAnim;
    if (anim && anim.active) {
      const t = Math.min(1, Math.max(0, (now - anim.start) / (anim.duration || 180)));
      if (t < 1) {
        const ease = 1 - Math.pow(1 - t, 3);
        const viewSpanOut = anim.fromSpan + (anim.toSpan - anim.fromSpan) * ease;
        const viewXOut = anim.fromX + (anim.toX - anim.fromX) * ease;
        const viewYOut = anim.fromY + (anim.toY - anim.fromY) * ease;
        return { viewX: viewXOut, viewY: viewYOut, viewSpan: viewSpanOut, cellPx: displaySize / viewSpanOut, active: true };
      }
    }
    return { viewX, viewY, viewSpan, cellPx: displaySize / viewSpan, active: false };
  }

  // Pixel -> grid cell under the rendered viewport (clamped to the board).
  function pixelToGrid(px, py, vp) {
    const gridSize = D.gridSize;
    return {
      x: Math.max(0, Math.min(gridSize - 1, Math.floor(vp.viewX + px / vp.cellPx))),
      y: Math.max(0, Math.min(gridSize - 1, Math.floor(vp.viewY + py / vp.cellPx)))
    };
  }

  // Grid cell -> pixel centre of that cell.
  function gridToCenter(gx, gy, cellPx) {
    return { x: (gx + 0.5) * cellPx, y: (gy + 0.5) * cellPx };
  }

  return {
    resolveZoom,
    clampViewport,
    getRenderedViewport,
    pixelToGrid,
    gridToCenter
  };
});
