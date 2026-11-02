"use strict";

// ============================================================
// buildHelpLines.js — job: build the HELP panel's raw lines — controls plus the mission briefing.
// Owner: hud.js. Holds no state.
// ============================================================

// The HELP content: controls and the mission briefing, as raw lines (the '#'
// prefix marks a section head). Pure: level list + input in, out. This file is
// just this one function; the composing parent captures the binding when it
// loads the file.
const buildHelpLines = function (deps, input) {
  // ---- private copy (this file's one function only) ---------------------
  const HELP_CONTROLS = [
    "[LMB] — select a vessel, or execute the highlighted action on a cell",
    "[SHIFT+CLICK / 'C'] — board and capture an adjacent spotted enemy",
    "[WASD] — pan the camera    [WHEEL] — zoom    minimap: drag to pan",
    "[I] (hold) — inspect: flag details for the selected vessel",
    "[ESC] — close menus and clear the selection"
  ];

  const levels = deps.campaignLevels;
  const spec = levels.find(l => l.id === input.state.levelId) || levels[0];
  const lines = ["#CONTROLS"];
  for (let i = 0; i < HELP_CONTROLS.length; i++) lines.push(HELP_CONTROLS[i]);
  if (spec && Array.isArray(spec.initialIntel)) {
    lines.push("#MISSION BRIEFING");
    for (let i = 0; i < spec.initialIntel.length; i++) lines.push(spec.initialIntel[i]);
  }
  return { title: "HELP // " + (spec ? spec.tag : "SECTOR"), lines };
};
