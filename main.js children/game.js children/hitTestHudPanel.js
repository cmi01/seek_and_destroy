"use strict";

// ============================================================
// hitTestHudPanel.js — job: name the HUD panel under a point (hitTestHudPanel).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const hitTestHudPanel = function (p){
  // Mirrors the historical containment predicate exactly (2-line rect test).
  function containsPoint(px, py, r){
    return Boolean(r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
  }
  const panels = p.panels;
  if (!panels) return null;
  if (p.isIntelVisible && containsPoint(p.px, p.py, panels.intelOverlay)) return "intelOverlay";
  if (containsPoint(p.px, p.py, panels.menu)) return "menu";
  if (containsPoint(p.px, p.py, panels.minimap)) return "minimap";
  if (containsPoint(p.px, p.py, panels.topBar)) return "topBar";
  if (containsPoint(p.px, p.py, panels.selectedCard)) return "selectedCard";
  if (containsPoint(p.px, p.py, panels.hoveredCard)) return "hoveredCard";
  return null;
};
