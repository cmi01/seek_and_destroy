"use strict";

// ============================================================
// rulesConfig.js — job: expose the tactical config values from the rules data table.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("rulesConfig", D => {
  function getMaxAp(){ return D.maxAp; }
  function getGridSize(){ return D.gridSize; }
  function getSpawnRadius(){ return D.spawnRadius; }
  function getEnemyActionIntervalMs(){ return D.enemyActionIntervalMs; }
  function getZoomLadder(){ return D.zoomLadder; }
  function getWheelNotchPx(){ return D.wheelNotchPx; }
  function getMaxZoomStepsPerEvent(){ return D.maxZoomStepsPerEvent; }
  function getDefaultDifficulty(){ return D.defaultDifficulty; }
  function getDifficultyProfiles(){ return D.difficultyProfiles; }
  function getShipSpecs(){ return D.shipSpecs; }
  function getCombatRules(){ return D.combatRules; }

  return {
    get flagDescriptions(){ return D.flagDescriptions || {}; },
    get gridSize(){ return getGridSize(); },
    get spawnRadius(){ return getSpawnRadius(); },
    get maxAp(){ return getMaxAp(); },
    get enemyActionIntervalMs(){ return getEnemyActionIntervalMs(); },
    get zoomLadder(){ return getZoomLadder(); },
    get wheelNotchPx(){ return getWheelNotchPx(); },
    get maxZoomStepsPerEvent(){ return getMaxZoomStepsPerEvent(); },
    get defaultDifficulty(){ return getDefaultDifficulty(); },
    get difficultyProfiles(){ return getDifficultyProfiles(); },
    get shipSpecs(){ return getShipSpecs(); },
    getMaxAp,
    getGridSize,
    getSpawnRadius,
    getEnemyActionIntervalMs,
    getZoomLadder,
    getWheelNotchPx,
    getMaxZoomStepsPerEvent,
    getDefaultDifficulty,
    getDifficultyProfiles,
    getShipSpecs,
    getCombatRules
  };
});
