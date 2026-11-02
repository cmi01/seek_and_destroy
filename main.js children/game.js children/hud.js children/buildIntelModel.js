"use strict";

// ============================================================
// buildIntelModel.js — job: build the intel/turn-report overlay model from a title and report lines.
// Owner: hud.js. Holds no state.
// ============================================================

// The turn-report overlay content. Pure: title + lines in, plain model out.
// This file is just this one function; the composing parent captures the
// binding when it loads the file.
const buildIntelModel = function (title, lines) {
  return {
    visible: true,
    title: String(title || "OPERATIONAL TURN REPORT"),
    lines: Array.isArray(lines) ? lines.slice() : []
  };
};
