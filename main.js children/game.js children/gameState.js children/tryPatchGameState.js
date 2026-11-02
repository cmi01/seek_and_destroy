"use strict";

// ============================================================
// tryPatchGameState.js — job: validate a state delta and apply it to the container.
// Owner: gameState.js (pure). Holds no state.
// ============================================================

const tryPatchGameState = function (DATA, stateBox, delta){
  const allowedKeys = new Set(Object.keys(DATA.initialState));

  function isValidDelta(d){
    if (!d || typeof d !== "object" || Array.isArray(d)) return false;
    const keys = Object.keys(d);
    if (keys.length === 0) return false;

    for (let i = 0; i < keys.length; i++){
      const k = keys[i];
      if (!allowedKeys.has(k)) return false;
      const v = d[k];

      if (k === "activeTeam"){
        if (v !== 1 && v !== 2) return false;
      } else if (k === "ap"){
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return false;
      } else if (k === "turnNumber" || k === "nextUnitId"){
        if (typeof v !== "number" || !Number.isFinite(v) || v < 1) return false;
      } else if (k === "levelId" || k === "viewX" || k === "viewY" || k === "lastPanTime"){
        if (typeof v !== "number" || !Number.isFinite(v)) return false;
      } else if (k === "viewSpan"){
        if (typeof v !== "number" || !Number.isFinite(v) || v < 5 || v > 32) return false;
      } else if (k === "selectedUnitId"){
        if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) return false;
      } else if (k === "gameOver" || k === "inspectMode" || k === "aiEmergencyMode" || k === "visDirty"){
        if (typeof v !== "boolean") return false;
      } else if (k === "buttonHovered" || k === "buttonPressed"){
        if (v !== null && typeof v !== "string") return false;
      } else if (k === "theme"){
        if (typeof v !== "string") return false;
      } else if (k === "credits" || k === "income" || k === "mousePx" || k === "zoomAnim" || k === "aiPlan"){
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
      } else if (
        k === "terrain" ||
        k === "exploredCells" ||
        k === "asteroidSeeds" ||
        k === "units" ||
        k === "historicalVectors" ||
        k === "animations" ||
        k === "turnReportQueue" ||
        k === "aiTimers" ||
        k === "audioTimers" ||
        k === "aiScoreTrace" ||
        k === "canvasButtons"
      ){
        if (!Array.isArray(v)) return false;
      } else if (k === "lastSeenEnemies"){
        if (!(v instanceof Map)) return false;
      } else if (k === "completedLevels" || k === "keysDown"){
        if (!(v instanceof Set)) return false;
      }
    }
    return true;
  }

  // The composer initializes the container before any patch reaches here.
  if (!isValidDelta(delta)) return false;
  Object.assign(stateBox.current, delta);
  return stateBox.current;
};
