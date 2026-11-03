"use strict";

// ============================================================
// buildIntelRect.js — job: place the intel overlay's panel rect under the top-bar rect.
// Owner: hud.js. Holds no state.
// ============================================================

// The overlay panel rect, anchored under the top-bar rect. Height sticks
// across frames via the previous panelRects. Pure: input + view state in,
// plain rect out. This file is just this one function; the composing parent
// captures the binding when it loads the file.
const buildIntelRect = function (input, view, topBarRect) {
  if (!view.intelOverlay || !view.intelOverlay.visible) return null;
  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const pad = Math.round(10 * US);
  const ix = pad;
  const iy = topBarRect.y + topBarRect.h + Math.round(8 * US);
  const iw = Math.min(DS - pad * 2, Math.round(410 * US));
  const linesCount = Math.max(1, Array.isArray(view.intelOverlay.lines) ? view.intelOverlay.lines.length * 2 : 2);
  const ih = (view.panelRects.intelOverlay && view.panelRects.intelOverlay.h)
    ? view.panelRects.intelOverlay.h
    : (Math.round(38 * US) + linesCount * ((input.metrics.ui && input.metrics.ui.lineSm) || Math.round(12 * US)));
  return { x: ix, y: iy, w: iw, h: ih };
};
