"use strict";

// ============================================================
// beginningGameState_DATA.js — job: hold the initial state template.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("beginningGameStateData", {
  version: "V58-1.0",
  schema: "seek-and-destroy.beginning-game-state",
  initialState: {
    // ---- profile: survives sector changes ----
    completedLevels: [],
    theme: "default",
    audioSettings: null,
    rng: null,
    rngSeed: null,

    // ---- match: one sector / battle ----
    levelId: 101,
    turnNumber: 1,
    activeTeam: 1,
    ap: 4,
    credits: { 1: 35, 2: 0 },
    income: { 1: 5, 2: 0 },
    terrain: [],
    exploredCells: [],
    asteroidSeeds: [],
    units: [],
    nextUnitId: 1,
    aiDoctrine: "DEFENSIVE_HOLD",
    historicalVectors: [],
    turnReportQueue: [],
    gameOver: false,

    // ---- ai: Syndicate memory & planning ----
    lastSeenEnemies: [],
    aiPlan: {
      reservations: [],
      currentPlan: null,
      stepIndex: 0
    },
    aiScoreTrace: [],
    aiEmergencyMode: false,

    // ---- camera ----
    viewX: 0,
    viewY: 0,
    viewSpan: 32,
    zoomAnim: {
      active: false,
      fromSpan: 32,
      toSpan: 32,
      fromX: 0,
      toX: 0,
      fromY: 0,
      toY: 0,
      start: 0,
      duration: 180
    },

    // ---- input / selection ----
    selectedUnitId: null,
    selectedCell: null,
    hoveredCell: null,
    buttonHovered: null,
    buttonPressed: null,
    canvasButtons: [],
    mousePx: { x: 0, y: 0 },
    inspectMode: false,
    keysDown: [],
    lastPanTime: 0,

    // ---- runtime: transient per-frame / timer plumbing (never serialized) ----
    animations: [],
    aiTimers: [],
    audioTimers: [],
    visCache: null,
    visDirty: true
  },

  lifetimes: {
    profile: ["completedLevels", "theme", "audioSettings", "rng", "rngSeed"],
    match: ["levelId", "turnNumber", "activeTeam", "ap", "credits", "income", "terrain", "exploredCells", "asteroidSeeds",
            "units", "nextUnitId", "aiDoctrine", "historicalVectors", "turnReportQueue", "gameOver"],
    ai: ["lastSeenEnemies", "aiPlan", "aiScoreTrace", "aiEmergencyMode"],
    camera: ["viewX", "viewY", "viewSpan", "zoomAnim"],
    input: ["selectedUnitId", "selectedCell", "hoveredCell", "buttonHovered", "buttonPressed", "canvasButtons",
            "mousePx", "inspectMode", "keysDown", "lastPanTime"],
    runtime: ["animations", "aiTimers", "audioTimers", "visCache", "visDirty"]
  },

  collections: {
    maps: ["lastSeenEnemies", "aiPlan.reservations"],
    sets: ["completedLevels", "keysDown"]
  }
});
