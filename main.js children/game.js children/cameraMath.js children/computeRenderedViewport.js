"use strict";

// ============================================================
// computeRenderedViewport.js — job: interpolate the viewport actually rendered at a given clock time.
// Owner: cameraMath.js (pure). Holds no state.
// ============================================================

// Zoom-animation interpolation: the rendered viewport at time `now` as
// plain data. `zoomAnim` is the read-only anim state shape (from/to span,
// x/y, start, duration, active); `now` is a number resolved by the parent.
const computeRenderedViewport = function (viewX, viewY, viewSpan, zoomAnim, now, displaySize) {
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
};
