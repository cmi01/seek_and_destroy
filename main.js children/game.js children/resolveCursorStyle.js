"use strict";

// ============================================================
// resolveCursorStyle.js — job: map drag/button/modal/panel/hover evidence to the CSS cursor string (resolveCursorStyle).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const resolveCursorStyle = function (p){
  if (p.dragging) return "grabbing";
  if (p.hitBtn) return p.hitBtn.enabled !== false ? "pointer" : "not-allowed";
  if (p.modalOpen) return "default";
  if (p.hitPanel === "minimap" || p.hitPanel === "intelOverlay") return "pointer";
  if (p.hitPanel) return "default";
  return (p.hoveredHasAction || p.hoveredSpotted) ? "pointer" : "crosshair";
};
