"use strict";

// ============================================================
// buildEndgameModel.js — job: build the endgame modal model — verdict title and body.
// Owner: hud.js. Holds no state.
// ============================================================

// The endgame model: verdict title + body. Pure: input in, plain model out.
// This file is just this one function; the composing parent captures the
// binding when it loads the file.
const buildEndgameModel = function (input, isVictory) {
  if (isVictory) {
    return {
      isVictory: true,
      title: "SECTOR SECURED // !FLAGSHIP ELIMINATED",
      body: `All hostile Syndicate !flagship command vessels in Sector ${input.state.levelId} have been destroyed in ${input.state.turnNumber} turns.`
    };
  }
  return {
    isVictory: false,
    title: "CRITICAL DEFEAT // !FLAGSHIP LOST",
    body: "All friendly !flagship command vessels have been destroyed. Command locus severed."
  };
};
