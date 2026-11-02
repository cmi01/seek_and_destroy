"use strict";

// ============================================================
// resolveZoomStep.js — job: step the zoom ladder by whole wheel notches while keeping the cell under the cursor anchored.
// Owner: cameraMath.js (pure). Holds no state.
// ============================================================

// Camera zoom: pure function of its inputs. (Viewport math, not a game rule —
// the ladder/wheel config comes from the rules data table; the parent applies
// the returned values to state.)
const resolveZoomStep = function (D, viewX, viewY, viewSpan, mousePx, deltaY, displaySize) {
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
};
