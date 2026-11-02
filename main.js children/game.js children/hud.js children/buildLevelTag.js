"use strict";

// ============================================================
// buildLevelTag.js — job: build the top-bar level tag from the current campaign level.
// Owner: hud.js. Holds no state.
// ============================================================

// The level tag text: the current campaign level's tag (first level as the
// boot fallback). Pure: level list + input state in, string out. This file is
// just this one function; the composing parent captures the binding when it
// loads the file.
const buildLevelTag = function (deps, input) {
  const levels = deps.campaignLevels;
  const spec = levels.find(l => l.id === input.state.levelId) || levels[0];
  return spec.tag;
};
