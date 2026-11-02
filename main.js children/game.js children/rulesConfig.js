"use strict";

// ============================================================
// rulesConfig.js — job: compose the tactical config handle from its per-value readers.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const rulesConfig = function (D){
  return {
    get flagDescriptions(){ return getFlagDescriptions(D); },
    get gridSize(){ return getGridSize(D); },
    get spawnRadius(){ return getSpawnRadius(D); },
    get maxAp(){ return getMaxAp(D); },
    get enemyActionIntervalMs(){ return getEnemyActionIntervalMs(D); },
    get zoomLadder(){ return getZoomLadder(D); },
    get wheelNotchPx(){ return getWheelNotchPx(D); },
    get maxZoomStepsPerEvent(){ return getMaxZoomStepsPerEvent(D); },
    get defaultDifficulty(){ return getDefaultDifficulty(D); },
    get difficultyProfiles(){ return getDifficultyProfiles(D); },
    get shipSpecs(){ return getShipSpecs(D); },
    getMaxAp(){ return getMaxAp(D); },
    getGridSize(){ return getGridSize(D); },
    getSpawnRadius(){ return getSpawnRadius(D); },
    getEnemyActionIntervalMs(){ return getEnemyActionIntervalMs(D); },
    getZoomLadder(){ return getZoomLadder(D); },
    getWheelNotchPx(){ return getWheelNotchPx(D); },
    getMaxZoomStepsPerEvent(){ return getMaxZoomStepsPerEvent(D); },
    getDefaultDifficulty(){ return getDefaultDifficulty(D); },
    getDifficultyProfiles(){ return getDifficultyProfiles(D); },
    getShipSpecs(){ return getShipSpecs(D); },
    getCombatRules(){ return getCombatRules(D); }
  };
};
