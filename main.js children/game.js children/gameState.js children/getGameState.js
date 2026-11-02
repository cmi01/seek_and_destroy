"use strict";

// ============================================================
// getGameState.js — job: read the state the container currently holds.
// Owner: gameState.js (pure). Holds no state.
// ============================================================

// The composer guarantees the container is initialized before the read, so
// this is a plain accessor over the shell-owned box.
const getGameState = function (stateBox){
  return stateBox.current;
};
