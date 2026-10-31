"use strict";

// ============================================================
// hudIntel.js — job: build the intel/turn-report overlay model and its panel rect.
// Owner: core/hud.js. Holds no state unless it is a core.
// ============================================================
(() => {
  // The turn-report overlay content. Pure: title + lines in, plain model out.
  function buildIntelModel(title, lines) {
    return {
      visible: true,
      title: String(title || "OPERATIONAL TURN REPORT"),
      lines: Array.isArray(lines) ? lines.slice() : []
    };
  }

  // The overlay panel rect, anchored under the top-bar rect (the top-bar
  // child's fragment). Height sticks across frames via the previous
  // panelRects. Pure: input + view state in, plain rect out.
  function buildIntelRect(input, view, topBarRect) {
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
      : (Math.round(38 * US) + linesCount * Math.max(11, Math.round(12 * US)));
    return { x: ix, y: iy, w: iw, h: ih };
  }

  createHud._register("intel", {
    buildIntelModel,
    buildIntelRect
  });
})();
