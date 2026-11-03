"use strict";

// ============================================================
// main.js — job: create the cores and interfaces, wire them together, and run the frame loop.
// Owner: wiring root (index.html). Holds no state unless it is a core.
// ============================================================

// ============================================================
// LAYOUT METRICS — computed at boot and on every resize.
// cellPx / fontScale are getters driven by Game.getViewSpan().
// ============================================================
const LayoutMetrics = {
  displaySize: 768,   // CSS pixel side-length of the square canvas
  viewportWidth: 768,
  viewportHeight: 768,
  isWidescreen: false,
  renderScale: 1,     // devicePixelRatio, uncapped; offscreen caches have their own pixel budget
  // cellPx / fontScale are getters driven by Game.getViewSpan(). fontScale
  // scales with cell size by design: it sizes board-space labels (terrain
  // shapes, tactical glyphs, warp-arc text). The UI is a set of fixed-size
  // canvas objects in the 768x768 design grid: uiScale scales the whole grid
  // uniformly with the canvas, so the UI's size relative to the game is
  // constant at any window size and any browser zoom — the UI never changes
  // scale on its own.
  get cellPx()    { return this.displaySize / Game.getViewSpan(); },
  get fontScale() { return this.cellPx / 24; },
  get textScale() { return Math.min(this.fontScale, 2); },
  get uiScale()   { return this.displaySize / 768; },
  minimapSize: 120,          // frame outer size (CSS px); replaced from metrics.ui on layout
  minimapCanvasSize: 118,    // canvas content size (CSS px) = minimapSize − 2
  minimapDevicePx: 118,      // canvas backing store = minimapCanvasSize × renderScale
  ui: null                   // resolved design-unit tokens (CSS px); set on layout
};

// ============================================================
// MINIMAP OFFSCREEN CANVAS & HOST BRIDGE
// ============================================================
let _minimapOffscreen = null;
function getMinimapOffscreenCanvas(){
  if (!_minimapOffscreen && typeof document !== "undefined") {
    _minimapOffscreen = document.createElement("canvas");
    _minimapOffscreen.width = LayoutMetrics.minimapDevicePx;
    _minimapOffscreen.height = LayoutMetrics.minimapDevicePx;
  }
  return _minimapOffscreen;
}

const HostBridge = {
  get metrics(){ return LayoutMetrics; },
  getCellPx(){ return LayoutMetrics.cellPx; },
  getDisplaySize(){ return LayoutMetrics.displaySize; },
  getTextScale(){ return LayoutMetrics.textScale; },
  getUiScale(){ return LayoutMetrics.uiScale; },
  getBattleCanvas(){ return document.getElementById("battle-canvas"); },
  getMinimapCanvas(){ return getMinimapOffscreenCanvas(); },
  requestRender(overrides){ return requestCanvasUpdate(overrides); },
  handleResize(){
    computeLayoutMetrics();
    Game.onResize();
    // Repaint synchronously: resizing the backing store clears the canvas,
    // and without this the browser can composite one blank frame (a flash).
    requestCanvasUpdate({});
  }
};

// ============================================================
// FRAME RENDERING — Game publishes frame to GraphicsInterface;
// Audio drains AudioInterface; Graphics renders from GraphicsInterface.
// ============================================================
const _renderErrorCounts = new Map();
function reportRenderError(err){
  const key = String(err && err.stack ? err.stack : err);
  const n = (_renderErrorCounts.get(key) || 0) + 1;
  _renderErrorCounts.set(key, n);
  if (n === 1) {
    console.error("[S&D] Render error (further repeats suppressed):", err);
  } else if (n === 600) {
    console.error("[S&D] Same render error has now repeated 600 times:", err && err.message ? err.message : err);
  }
}

function requestCanvasUpdate(overrides){
  const frame = Game.publishFrame(overrides);
  if (typeof SoundEngine !== "undefined" && typeof SoundEngine.step === "function") {
    SoundEngine.step();
  }
  try {
    Graphics.step();
  } catch (err) {
    reportRenderError(err);
  }
  return frame;
}

// ============================================================
// TEST HARNESS & DEBUG HANDLE
// Each core owns its own tests (Game -> gameTests.js,
// Graphics -> graphicsTests.js); main.js only routes to them.
// ============================================================
const Harness = {
  async runAll(){
    const gameResults = await Game.runTest("runAll");
    const gfxResults = await Graphics.runTest("runAll");
    return gameResults.concat(gfxResults);
  },
  testKiting(){ return Game.runTest("testKiting"); },
  testFlagshipGuard(){ return Game.runTest("testFlagshipGuard"); },
  testFocusFire(){ return Game.runTest("testFocusFire"); },
  testDoctrine(){ return Game.runTest("testDoctrine"); },
  testFlagshipShieldAlwaysUp(){ return Game.runTest("testFlagshipShieldAlwaysUp"); },
  testRailgunAvoidance(){ return Game.runTest("testRailgunAvoidance"); },
  testFleeWhenOutgunned(){ return Game.runTest("testFleeWhenOutgunned"); },
  testRecedingHorizon(){ return Game.runTest("testRecedingHorizon"); },
  testBudgetAwarePlanning(){ return Game.runTest("testBudgetAwarePlanning"); },
  testZoomAnchor(){ return Game.runTest("testZoomAnchor"); },
  testZoomClamp(){ return Game.runTest("testZoomClamp"); },
  testBakedSpriteAtlas(){ return Graphics.runTest("testBakedSpriteAtlas"); },
  testRailgunPulseOffset(){ return Graphics.runTest("testRailgunPulseOffset"); },
  testHullFactionRead(){ return Graphics.runTest("testHullFactionRead"); },
  testWeaponFactionNeutral(){ return Graphics.runTest("testWeaponFactionNeutral"); },
  testExhaustedDistinct(){ return Graphics.runTest("testExhaustedDistinct"); }
};

function exposeDebugHandle(){
  requestCanvasUpdate({ skipBoard: true });
  const handle = Game.createDebugHandle();
  const Sound = typeof SoundEngine !== "undefined" ? SoundEngine : null;
  Object.assign(handle, {
    Graphics,
    Sound,
    Harness,
    LayoutMetrics,
    SpriteCache: {
      key(unit, cellPx){ return Graphics.spriteKey(unit, cellPx); },
      get(unit){ return Graphics.spriteGet(unit); }
    },
    Renderer: {
      draw(now, visCache){ requestCanvasUpdate({ now, visCache, battleOnly: true }); },
      drawMinimap(now, visCache){ requestCanvasUpdate({ now, visCache, minimapOnly: true }); },
      setTheme(t){ return handle.setTheme(t); },
      getTheme(){ return handle.getTheme(); },
      drawUnitStatic(ctx, cx, cy, cellPx, unit){ Graphics.drawUnitStatic(ctx, cx, cy, cellPx, unit); },
      drawUnitDynamic(ctx, cx, cy, cellPx, unit, now){ Graphics.drawUnitDynamic(ctx, cx, cy, cellPx, unit, now); },
      drawUnitOnCanvas(ctx, cx, cy, cellPx, unit, now){ Graphics.drawUnitOnCanvas(ctx, cx, cy, cellPx, unit, now); },
      blitSprite(ctx, sprite, cx, cy, targetCellPx){ Graphics.blitSprite(ctx, sprite, cx, cy, targetCellPx); }
    },
    railgunPulseOffset(t, period){ return Graphics.railgunPulseOffset(t, period); },
    runTests(){ return Harness.runAll(); },
    runAudioTests(){ return (Sound && typeof Sound.runSelfTests === "function") ? Sound.runSelfTests() : []; }
  });
  window.SD = handle;
}

// ======================== LAYOUT & BOOT ========================
function computeLayoutMetrics() {
  const canvas = document.getElementById("battle-canvas");
  if (!canvas) return;

  // 1px CSS border is outside the content box (content-box). Reserve it so
  // the bordered element stays inside the viewport. The 200px floor is the
  // engine minimum canvas, applied once here — not a per-widget floor.
  const borderOutset = 2;
  const availW = Math.max(200, (window.innerWidth || 768) - 8 - borderOutset);
  const availH = Math.max(200, (window.innerHeight || 768) - 8 - borderOutset);
  const size   = Math.max(200, Math.floor(Math.min(availW, availH)));

  canvas.style.boxSizing = "content-box";
  canvas.style.width  = size + "px";
  canvas.style.height = size + "px";

  const renderScale = window.devicePixelRatio || 1;
  const devicePx    = Math.round(size * renderScale);

  LayoutMetrics.displaySize    = size;
  LayoutMetrics.viewportWidth  = availW;
  LayoutMetrics.viewportHeight = availH;
  LayoutMetrics.isWidescreen   = availW > availH * 1.15;
  LayoutMetrics.renderScale    = renderScale;
  LayoutMetrics.devicePx       = devicePx;
  if (typeof resolveUiMetrics === "function" && typeof uiTokensTable !== "undefined") {
    LayoutMetrics.ui = resolveUiMetrics(uiTokensTable, {
      displaySize: size,
      uiScale: size / 768,
      renderScale: renderScale
    });
  }

  if (canvas.width !== devicePx || canvas.height !== devicePx) {
    canvas.width  = devicePx;
    canvas.height = devicePx;
  }

  const minimapSize       = (LayoutMetrics.ui && LayoutMetrics.ui.minimap) || Math.round(120 * size / 768);
  const minimapCanvasSize = minimapSize - 2;
  const minimapDevicePx   = Math.round(minimapCanvasSize * renderScale);

  LayoutMetrics.minimapSize       = minimapSize;
  LayoutMetrics.minimapCanvasSize = minimapCanvasSize;
  LayoutMetrics.minimapDevicePx   = minimapDevicePx;

  const mmCanvas = getMinimapOffscreenCanvas();
  if (mmCanvas && (mmCanvas.width !== minimapDevicePx || mmCanvas.height !== minimapDevicePx)) {
    mmCanvas.width  = minimapDevicePx;
    mmCanvas.height = minimapDevicePx;
  }
}

function initLayout() {
  computeLayoutMetrics();
  Game.refreshLayout();
}

function assertCanvasSetup() {
  const c = document.getElementById("battle-canvas");
  if (!c) return;
  if (c.width !== LayoutMetrics.devicePx || c.height !== LayoutMetrics.devicePx) {
    console.warn("[RENDER] canvas backing store is " + c.width + "x" + c.height +
                 ", expected " + LayoutMetrics.devicePx + "x" + LayoutMetrics.devicePx +
                 " — HTML attribute and RENDER_SCALE have drifted.");
  }
  const mm = getMinimapOffscreenCanvas();
  if (mm && (mm.width !== LayoutMetrics.minimapDevicePx || mm.height !== LayoutMetrics.minimapDevicePx)) {
    console.warn("[RENDER] minimap backing store is " + mm.width + "x" + mm.height +
                 ", expected " + LayoutMetrics.minimapDevicePx + "x" + LayoutMetrics.minimapDevicePx);
  }
}

let _dprQuery = null;
function onDprChange() {
  armDprWatch();
  HostBridge.handleResize();
}
function armDprWatch() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  if (_dprQuery && typeof _dprQuery.removeEventListener === "function") {
    _dprQuery.removeEventListener("change", onDprChange);
  }
  const dpr = window.devicePixelRatio || 1;
  _dprQuery = window.matchMedia("(resolution: " + dpr + "dppx)");
  if (_dprQuery && typeof _dprQuery.addEventListener === "function") {
    _dprQuery.addEventListener("change", onDprChange);
  }
}

function bootGame() {
  // Size the canvas before the first paint so the opening frame is not a
  // 768 default that the next resize then clears (a flash).
  computeLayoutMetrics();
  exposeDebugHandle();
  Inputs.bind();
  armDprWatch();
  initLayout();
  assertCanvasSetup();
  Game.startSector(101);
  if (typeof SoundEngine !== "undefined" && typeof SoundEngine.step === "function") {
    SoundEngine.step();
  }
  requestAnimationFrame(mainLoop);
}

// ======================== MAIN LOOP ========================
function mainLoop(now){
  const visCache = Game.stepFrame(now);
  requestCanvasUpdate({ now, visCache });
  requestAnimationFrame(mainLoop);
}

// ======================== INLINE SCRIPT LOADER ========================
// main.js is the central loader (this is an effect, so it lives here). It
// loads the 3 Unidirectional Interface Servers, the HUD's widget children and
// the 4 Core System Processes. A core that still carries its own inline loader
// loads its own children.
const INTERFACE_SCRIPTS = [
  "main.js children/inputInterface.js",
  "main.js children/graphicsInterface.js",
  "main.js children/audioInterface.js"
];
// The HUD composer is one pure function, so its children's loading is an effect
// that belongs here. They are loaded BEFORE the process scripts so each child
// binding exists by the time Game.load() asks the composer to run.
const HUD_WIDGET_SCRIPTS = [
  "main.js children/game.js children/hud.js children/buildLevelTag.js",
  "main.js children/game.js children/hud.js children/buildTopBarChrome.js",
  "main.js children/game.js children/hud.js children/buildTelemetryModels.js",
  "main.js children/game.js children/hud.js children/buildTelemetryCardRects.js",
  "main.js children/game.js children/hud.js children/buildHelpLines.js",
  "main.js children/game.js children/hud.js children/buildHelpPanel.js",
  "main.js children/game.js children/hud.js children/buildReserveModel.js",
  "main.js children/game.js children/hud.js children/buildReserveButtons.js",
  "main.js children/game.js children/hud.js children/buildDeploymentModel.js",
  "main.js children/game.js children/hud.js children/buildDeploymentButtons.js",
  "main.js children/game.js children/hud.js children/buildCampaignCards.js",
  "main.js children/game.js children/hud.js children/buildCampaignLayout.js",
  "main.js children/game.js children/hud.js children/buildEndgameModel.js",
  "main.js children/game.js children/hud.js children/buildEndgameButtons.js",
  "main.js children/game.js children/hud.js children/buildIntelModel.js",
  "main.js children/game.js children/hud.js children/buildIntelRect.js",
  "main.js children/game.js children/hud.js children/hudMenu.js",
  "main.js children/game.js children/hud.js children/hudMinimap.js",
  "main.js children/game.js children/hud.js children/hudBanner.js"
];
// The AI subtree is one function per file too, so its loading is an effect
// that belongs here: every file below ai.js (its children, their children and
// the query composers' leaves) is a classic script loaded BEFORE the process
// scripts, so each binding exists by the time game.js loads ai.js and asks it
// for a decision. Leaves first, composers after.
const AI_TREE_SCRIPTS = [
  "main.js children/game.js children/ai.js children/aiPriorities_DATA.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/computeUpdatedReservations.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js children/listMyUnits.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js children/listSpottedEnemies.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js children/listActiveBeliefs.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPositionQueries.js children/rankMoveTargets.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPositionQueries.js children/listReachableCells.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPositionQueries.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatQueries.js children/listRailgunDangerZones.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatQueries.js children/canClearFlagshipThreats.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatQueries.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPreservationQueries.js children/hullPreservationTier.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPreservationQueries.js children/shouldHullRetreat.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPreservationQueries.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetQueries.js children/assessFleetGap.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetQueries.js children/listWarpLoci.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetQueries.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiBeliefMemory.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiInvariantChecks.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatScorer.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiUnitPlanner.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetCommander.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js",
  "main.js children/game.js children/ai.js children/aiTurnWorkflow.js"
];

const SCALE_SCRIPTS = [
  "main.js children/uiTokens_DATA.js",
  "main.js children/resolveUiMetrics.js"
];
const PROCESS_SCRIPTS = [
  "main.js children/game.js",
  "main.js children/graphics.js",
  "main.js children/inputs.js",
  "main.js children/sounds.js"
];
const TOP_LEVEL_SCRIPTS = INTERFACE_SCRIPTS.concat(PROCESS_SCRIPTS);

function _loadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false; // dynamic scripts default to async; force in-order execution
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error("Failed to load script: " + src));
    document.head.appendChild(s);
  });
}

function _loadScripts(list, optionalSet){
  const optional = optionalSet || new Set();
  return Promise.allSettled(list.map(src => _loadScript(src))).then(results => {
    const failures = [];
    results.forEach((r, i) => {
      if (r.status !== "rejected") return;
      if (optional.has(list[i])) {
        console.error("[S&D] Optional script failed to load; continuing without it:", r.reason.message);
      } else {
        failures.push(r.reason.message);
      }
    });
    if (failures.length > 0) throw new Error(failures.join("\n"));
  });
}

function _verifyLoaded(checks, optionalSet){
  const optional = optionalSet || new Set();
  const missing = [];
  for (const [label, check] of checks) {
    let ok = false;
    try { ok = Boolean(check()); } catch (err) { ok = false; }
    if (ok) continue;
    if (optional.has(label)) {
      console.error("[S&D] Optional module " + label + " is unavailable; continuing with degraded capability.");
    } else {
      missing.push(label);
    }
  }
  if (missing.length > 0) {
    throw new Error("These scripts loaded but did not register their module (see earlier errors):\n  " + missing.join("\n  "));
  }
}

// Frozen at receipt: a data table handed to a pure function is frozen here,
// so any later write into it throws instead of silently corrupting it.
function _freezeTree(value){
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.keys(value).forEach(function(key){ _freezeTree(value[key]); });
  }
  return value;
}

function wantsTestsAtBoot(){
  return new URLSearchParams(window.location.search).has("test");
}

function reportBootFailure(err){
  console.error("[S&D] BOOT FAILED:", err);
  const pre = document.createElement("pre");
  pre.style.cssText = "position:fixed;left:16px;top:16px;right:16px;padding:12px;background:#1a0508;" +
    "color:#fb7185;border:1px solid #fb7185;font:12px monospace;white-space:pre-wrap;z-index:10;";
  pre.textContent = "SEEK & DESTROY failed to start.\n\n" + (err && err.message ? err.message : String(err));
  document.body.appendChild(pre);
}

// Game leaf scripts (v102: closed boot list). game.js loads ONLY its direct
// children; these leaf grandchildren load here, in the central shell, before
// Game.load() runs its composers. main.js is the exempt central loader
// (REFERENCE_POLICY §4.1), so the leaf inbounds stay within their owners.
const GAME_LEAF_SCRIPTS = [
  "main.js children/game.js children/gameState.js children/initializeGameState.js",
  "main.js children/game.js children/gameState.js children/getGameState.js",
  "main.js children/game.js children/gameState.js children/tryPatchGameState.js",
  "main.js children/game.js children/gameState.js children/getStateLifetimes.js",
  "main.js children/game.js children/gameState.js children/buildStateSave.js",
  "main.js children/game.js children/gameState.js children/restoreStateSave.js",
  "main.js children/game.js children/themes.js children/themeTables.js",
  "main.js children/game.js children/themes.js children/normalizeThemeKey.js",
  "main.js children/game.js children/themes.js children/nextTheme.js",
  "main.js children/game.js children/themes.js children/themePalette.js",
  "main.js children/game.js children/themes.js children/remapColor.js",
  "main.js children/game.js children/rulesConfig.js children/getFlagDescriptions.js",
  "main.js children/game.js children/rulesConfig.js children/getGridSize.js",
  "main.js children/game.js children/rulesConfig.js children/getSpawnRadius.js",
  "main.js children/game.js children/rulesConfig.js children/getMaxAp.js",
  "main.js children/game.js children/rulesConfig.js children/getEnemyActionIntervalMs.js",
  "main.js children/game.js children/rulesConfig.js children/getZoomLadder.js",
  "main.js children/game.js children/rulesConfig.js children/getWheelNotchPx.js",
  "main.js children/game.js children/rulesConfig.js children/getMaxZoomStepsPerEvent.js",
  "main.js children/game.js children/rulesConfig.js children/getDefaultDifficulty.js",
  "main.js children/game.js children/rulesConfig.js children/getDifficultyProfiles.js",
  "main.js children/game.js children/rulesConfig.js children/getShipSpecs.js",
  "main.js children/game.js children/rulesConfig.js children/getCombatRules.js",
  "main.js children/game.js children/boardQueries.js children/cellOnBoard.js",
  "main.js children/game.js children/boardQueries.js children/cellDistance.js",
  "main.js children/game.js children/boardQueries.js children/cellsWithinRange.js",
  "main.js children/game.js children/boardQueries.js children/terrainOfCell.js",
  "main.js children/game.js children/boardQueries.js children/occupancyKey.js",
  "main.js children/game.js children/boardQueries.js children/indexLivingUnits.js",
  "main.js children/game.js children/boardQueries.js children/unitOnCell.js",
  "main.js children/game.js children/visionQueries.js children/unitScanRange.js",
  "main.js children/game.js children/visionQueries.js children/cellVisibleToTeam.js",
  "main.js children/game.js children/visionQueries.js children/unitSpottedByTeam.js",
  "main.js children/game.js children/actionLegality.js children/canUnitMove.js",
  "main.js children/game.js children/actionLegality.js children/canUnitCapture.js",
  "main.js children/game.js children/actionLegality.js children/canUnitShoot.js",
  "main.js children/game.js children/actionLegality.js children/canUnitShield.js",
  "main.js children/game.js children/actionLegality.js children/priorityActionAt.js",
  "main.js children/game.js children/combatMath.js children/resolveShootOutcome.js",
  "main.js children/game.js children/combatMath.js children/resolveCollisionOutcome.js",
  "main.js children/game.js children/combatMath.js children/isLethalShot.js",
  "main.js children/game.js children/combatMath.js children/isShootableFrom.js",
  "main.js children/game.js children/combatMath.js children/computeCrewLost.js",
  "main.js children/game.js children/reservePlacement.js children/listWarpCells.js",
  "main.js children/game.js children/reservePlacement.js children/planDeployment.js",
  "main.js children/game.js children/cameraMath.js children/resolveZoomStep.js",
  "main.js children/game.js children/cameraMath.js children/clampViewportToBoard.js",
  "main.js children/game.js children/cameraMath.js children/computeRenderedViewport.js",
  "main.js children/game.js children/cameraMath.js children/pixelToCell.js",
  "main.js children/game.js children/cameraMath.js children/computeCellCentre.js",
  "main.js children/game.js children/selectionQueries.js children/getSelectedUnit.js",
  "main.js children/game.js children/selectionQueries.js children/cellForUnit.js",
  "main.js children/game.js children/sectorGenerator.js children/buildUnitRecord.js",
  "main.js children/game.js children/sectorGenerator.js children/buildSectorData.js",
  "main.js children/game.js children/campaignState.js children/initializeCampaignState.js",
  "main.js children/game.js children/campaignState.js children/tryPatchCampaignState.js",
  "main.js children/game.js children/campaignState.js children/rosterOf.js",
  "main.js children/game.js children/campaignState.js children/beginBattle.js",
  "main.js children/game.js children/campaignState.js children/applyBattleResult.js",
  "main.js children/game.js children/campaignState.js children/buildEncounterFromLevel.js",
  "main.js children/game.js children/campaignState.js children/collectBattleResult.js",
  "main.js children/game.js children/campaignMap.js children/buildMapState.js",
  "main.js children/game.js children/campaignMap.js children/fuelCost.js",
  "main.js children/game.js children/campaignMap.js children/merchantOffer.js",
  "main.js children/game.js children/campaignMap.js children/moveFleet.js",
  "main.js children/game.js children/campaignMap.js children/hyperspaceJump.js",
  "main.js children/game.js children/campaignMap.js children/mapFrame.js"
];

async function startGame(){
  try {
    await _loadScripts(SCALE_SCRIPTS);
    _verifyLoaded([
      ["main.js children/uiTokens_DATA.js", () => typeof uiTokensTable === "object" && uiTokensTable !== null],
      ["main.js children/resolveUiMetrics.js", () => typeof resolveUiMetrics === "function"]
    ]);
    if (typeof uiTokensTable !== "undefined") _freezeTree(uiTokensTable);

    await _loadScripts(INTERFACE_SCRIPTS);
    _verifyLoaded([
      ["main.js children/inputInterface.js",    () => typeof createInputInterface === "function"],
      ["main.js children/graphicsInterface.js", () => typeof createGraphicsInterface === "function"],
      ["main.js children/audioInterface.js",    () => typeof createAudioInterface === "function"]
    ]);

    await _loadScripts(HUD_WIDGET_SCRIPTS);
    _verifyLoaded([
      ["main.js children/game.js children/hud.js children/buildLevelTag.js",         () => typeof buildLevelTag === "function"],
      ["main.js children/game.js children/hud.js children/buildTopBarChrome.js",     () => typeof buildTopBarChrome === "function"],
      ["main.js children/game.js children/hud.js children/buildTelemetryModels.js",  () => typeof buildTelemetryModels === "function"],
      ["main.js children/game.js children/hud.js children/buildTelemetryCardRects.js", () => typeof buildTelemetryCardRects === "function"],
      ["main.js children/game.js children/hud.js children/buildHelpLines.js",        () => typeof buildHelpLines === "function"],
      ["main.js children/game.js children/hud.js children/buildHelpPanel.js",        () => typeof buildHelpPanel === "function"],
      ["main.js children/game.js children/hud.js children/buildReserveModel.js",  () => typeof buildReserveModel === "function"],
      ["main.js children/game.js children/hud.js children/buildReserveButtons.js", () => typeof buildReserveButtons === "function"],
      ["main.js children/game.js children/hud.js children/buildDeploymentModel.js", () => typeof buildDeploymentModel === "function"],
      ["main.js children/game.js children/hud.js children/buildDeploymentButtons.js", () => typeof buildDeploymentButtons === "function"],
      ["main.js children/game.js children/hud.js children/buildCampaignCards.js",    () => typeof buildCampaignCards === "function"],
      ["main.js children/game.js children/hud.js children/buildCampaignLayout.js",   () => typeof buildCampaignLayout === "function"],
      ["main.js children/game.js children/hud.js children/buildEndgameModel.js",     () => typeof buildEndgameModel === "function"],
      ["main.js children/game.js children/hud.js children/buildEndgameButtons.js",   () => typeof buildEndgameButtons === "function"],
      ["main.js children/game.js children/hud.js children/buildIntelModel.js",       () => typeof buildIntelModel === "function"],
      ["main.js children/game.js children/hud.js children/buildIntelRect.js",        () => typeof buildIntelRect === "function"],
      ["main.js children/game.js children/hud.js children/hudMenu.js",               () => typeof buildMenuModel === "function"],
      ["main.js children/game.js children/hud.js children/hudMinimap.js",            () => typeof buildMinimapModel === "function"],
      ["main.js children/game.js children/hud.js children/hudBanner.js",             () => typeof buildPriorityBanner === "function"]
    ]);

    // The priorities table is a plain script-scope binding. The shell freezes
    // it and republishes the frozen object under the name consumers already
    // read, so no AI file names a parent binding and none is left behind.
    await _loadScripts(AI_TREE_SCRIPTS);
    window.aiPrioritiesData = _freezeTree(
      (typeof aiPrioritiesTable !== "undefined" && aiPrioritiesTable) || {}
    );
    _verifyLoaded([
      ["main.js children/game.js children/ai.js children/aiPriorities_DATA.js", () => typeof aiPrioritiesData === "object" && aiPrioritiesData !== null],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/computeUpdatedReservations.js", () => typeof computeUpdatedReservations === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js children/listMyUnits.js", () => typeof listMyUnits === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js children/listSpottedEnemies.js", () => typeof listSpottedEnemies === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js children/listActiveBeliefs.js", () => typeof listActiveBeliefs === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js", () => typeof queryAIState === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPositionQueries.js children/rankMoveTargets.js", () => typeof rankMoveTargets === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPositionQueries.js children/listReachableCells.js", () => typeof listReachableCells === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPositionQueries.js", () => typeof queryAIMoveOptions === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatQueries.js children/listRailgunDangerZones.js", () => typeof listRailgunDangerZones === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatQueries.js children/canClearFlagshipThreats.js", () => typeof canClearFlagshipThreats === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatQueries.js", () => typeof queryAIDanger === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPreservationQueries.js children/hullPreservationTier.js", () => typeof hullPreservationTier === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPreservationQueries.js children/shouldHullRetreat.js", () => typeof shouldHullRetreat === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPreservationQueries.js", () => typeof queryAIHullPreservation === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetQueries.js children/assessFleetGap.js", () => typeof assessFleetGap === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetQueries.js children/listWarpLoci.js", () => typeof listWarpLoci === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetQueries.js", () => typeof queryAIFleet === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiBeliefMemory.js", () => typeof computeSyncedMemory === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiInvariantChecks.js", () => typeof checkInvariants === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatScorer.js",
       () => typeof aiThreatScorer === "function" || (typeof threatScorer !== "undefined" && Boolean(threatScorer))],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiUnitPlanner.js", () => typeof buildUnitPlan === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetCommander.js", () => typeof selectFleetActionPlan === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js", () => typeof evaluateAITurn === "function"],
      ["main.js children/game.js children/ai.js children/aiTurnWorkflow.js", () => typeof evaluateTurnStep === "function"]
    ]);

    await _loadScripts(PROCESS_SCRIPTS, new Set(["main.js children/sounds.js"]));
    _verifyLoaded([
      ["main.js children/game.js",         () => typeof Game !== "undefined" && typeof Game.load === "function"],
      ["main.js children/graphics.js", () => typeof Graphics !== "undefined" && typeof Graphics.load === "function"],
      ["main.js children/inputs.js",       () => typeof Inputs !== "undefined"],
      ["main.js children/sounds.js",      () => typeof SoundEngine !== "undefined" && typeof SoundEngine.load === "function"]
    ], new Set(["main.js children/sounds.js"]));

    const inputChannel = createInputInterface();
    const graphicsChannel = createGraphicsInterface();
    const audioChannel = createAudioInterface();

    // Load the game leaf grandchildren (v102 closed boot list) BEFORE
    // Game.load() composes them: game.js awaits only its direct children.
    await _loadScripts(GAME_LEAF_SCRIPTS);
    _verifyLoaded([
      ["main.js children/game.js children/gameState.js children/initializeGameState.js", () => typeof initializeGameState === "function"],
      ["main.js children/game.js children/gameState.js children/getGameState.js",        () => typeof getGameState === "function"],
      ["main.js children/game.js children/gameState.js children/tryPatchGameState.js",   () => typeof tryPatchGameState === "function"],
      ["main.js children/game.js children/gameState.js children/getStateLifetimes.js",   () => typeof getStateLifetimes === "function"],
      ["main.js children/game.js children/gameState.js children/buildStateSave.js",      () => typeof buildStateSave === "function"],
      ["main.js children/game.js children/gameState.js children/restoreStateSave.js",    () => typeof restoreStateSave === "function"],
      ["main.js children/game.js children/themes.js children/themeTables.js",            () => typeof themeTables === "function"],
      ["main.js children/game.js children/themes.js children/normalizeThemeKey.js",      () => typeof normalizeThemeKey === "function"],
      ["main.js children/game.js children/themes.js children/nextTheme.js",              () => typeof nextTheme === "function"],
      ["main.js children/game.js children/themes.js children/themePalette.js",           () => typeof themePalette === "function"],
      ["main.js children/game.js children/themes.js children/remapColor.js",             () => typeof remapColor === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getFlagDescriptions.js", () => typeof getFlagDescriptions === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getGridSize.js",       () => typeof getGridSize === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getSpawnRadius.js",    () => typeof getSpawnRadius === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getMaxAp.js",          () => typeof getMaxAp === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getEnemyActionIntervalMs.js", () => typeof getEnemyActionIntervalMs === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getZoomLadder.js",     () => typeof getZoomLadder === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getWheelNotchPx.js",   () => typeof getWheelNotchPx === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getMaxZoomStepsPerEvent.js", () => typeof getMaxZoomStepsPerEvent === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getDefaultDifficulty.js", () => typeof getDefaultDifficulty === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getDifficultyProfiles.js", () => typeof getDifficultyProfiles === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getShipSpecs.js",      () => typeof getShipSpecs === "function"],
      ["main.js children/game.js children/rulesConfig.js children/getCombatRules.js",    () => typeof getCombatRules === "function"],
      ["main.js children/game.js children/boardQueries.js children/cellOnBoard.js",      () => typeof cellOnBoard === "function"],
      ["main.js children/game.js children/boardQueries.js children/cellDistance.js",     () => typeof cellDistance === "function"],
      ["main.js children/game.js children/boardQueries.js children/cellsWithinRange.js", () => typeof cellsWithinRange === "function"],
      ["main.js children/game.js children/boardQueries.js children/terrainOfCell.js",    () => typeof terrainOfCell === "function"],
      ["main.js children/game.js children/boardQueries.js children/occupancyKey.js",     () => typeof occupancyKey === "function"],
      ["main.js children/game.js children/boardQueries.js children/indexLivingUnits.js", () => typeof indexLivingUnits === "function"],
      ["main.js children/game.js children/boardQueries.js children/unitOnCell.js",       () => typeof unitOnCell === "function"],
      ["main.js children/game.js children/visionQueries.js children/unitScanRange.js",   () => typeof unitScanRange === "function"],
      ["main.js children/game.js children/visionQueries.js children/cellVisibleToTeam.js", () => typeof cellVisibleToTeam === "function"],
      ["main.js children/game.js children/visionQueries.js children/unitSpottedByTeam.js", () => typeof unitSpottedByTeam === "function"],
      ["main.js children/game.js children/actionLegality.js children/canUnitMove.js",    () => typeof canUnitMove === "function"],
      ["main.js children/game.js children/actionLegality.js children/canUnitCapture.js", () => typeof canUnitCapture === "function"],
      ["main.js children/game.js children/actionLegality.js children/canUnitShoot.js",   () => typeof canUnitShoot === "function"],
      ["main.js children/game.js children/actionLegality.js children/canUnitShield.js",  () => typeof canUnitShield === "function"],
      ["main.js children/game.js children/actionLegality.js children/priorityActionAt.js", () => typeof priorityActionAt === "function"],
      ["main.js children/game.js children/combatMath.js children/resolveShootOutcome.js", () => typeof resolveShootOutcome === "function"],
      ["main.js children/game.js children/combatMath.js children/resolveCollisionOutcome.js", () => typeof resolveCollisionOutcome === "function"],
      ["main.js children/game.js children/combatMath.js children/isLethalShot.js",       () => typeof isLethalShot === "function"],
      ["main.js children/game.js children/combatMath.js children/isShootableFrom.js",    () => typeof isShootableFrom === "function"],
      ["main.js children/game.js children/combatMath.js children/computeCrewLost.js",    () => typeof computeCrewLost === "function"],
      ["main.js children/game.js children/reservePlacement.js children/listWarpCells.js", () => typeof listWarpCells === "function"],
      ["main.js children/game.js children/reservePlacement.js children/planDeployment.js", () => typeof planDeployment === "function"],
      ["main.js children/game.js children/cameraMath.js children/resolveZoomStep.js",    () => typeof resolveZoomStep === "function"],
      ["main.js children/game.js children/cameraMath.js children/clampViewportToBoard.js", () => typeof clampViewportToBoard === "function"],
      ["main.js children/game.js children/cameraMath.js children/computeRenderedViewport.js", () => typeof computeRenderedViewport === "function"],
      ["main.js children/game.js children/cameraMath.js children/pixelToCell.js",        () => typeof pixelToCell === "function"],
      ["main.js children/game.js children/cameraMath.js children/computeCellCentre.js",  () => typeof computeCellCentre === "function"],
      ["main.js children/game.js children/selectionQueries.js children/getSelectedUnit.js", () => typeof getSelectedUnit === "function"],
      ["main.js children/game.js children/selectionQueries.js children/cellForUnit.js",  () => typeof cellForUnit === "function"],
      ["main.js children/game.js children/sectorGenerator.js children/buildUnitRecord.js", () => typeof buildUnitRecord === "function"],
      ["main.js children/game.js children/sectorGenerator.js children/buildSectorData.js", () => typeof buildSectorData === "function"],
      ["main.js children/game.js children/campaignState.js children/initializeCampaignState.js", () => typeof initializeCampaignState === "function"],
      ["main.js children/game.js children/campaignState.js children/tryPatchCampaignState.js", () => typeof tryPatchCampaignState === "function"],
      ["main.js children/game.js children/campaignState.js children/rosterOf.js", () => typeof rosterOf === "function"],
      ["main.js children/game.js children/campaignState.js children/beginBattle.js", () => typeof beginBattle === "function"],
      ["main.js children/game.js children/campaignState.js children/applyBattleResult.js", () => typeof applyBattleResult === "function"],
      ["main.js children/game.js children/campaignState.js children/buildEncounterFromLevel.js", () => typeof buildEncounterFromLevel === "function"],
      ["main.js children/game.js children/campaignState.js children/collectBattleResult.js", () => typeof collectBattleResult === "function"],
      ["main.js children/game.js children/campaignMap.js children/buildMapState.js", () => typeof buildMapState === "function"],
      ["main.js children/game.js children/campaignMap.js children/fuelCost.js", () => typeof fuelCost === "function"],
      ["main.js children/game.js children/campaignMap.js children/merchantOffer.js", () => typeof merchantOffer === "function"],
      ["main.js children/game.js children/campaignMap.js children/moveFleet.js", () => typeof moveFleet === "function"],
      ["main.js children/game.js children/campaignMap.js children/hyperspaceJump.js", () => typeof hyperspaceJump === "function"],
      ["main.js children/game.js children/campaignMap.js children/mapFrame.js", () => typeof mapFrame === "function"]
    ]);

    await Game.load();
    await Graphics.load();
    if (typeof SoundEngine !== "undefined" && typeof SoundEngine.load === "function") {
      await SoundEngine.load();
    }

    Inputs.bindInterface(inputChannel.producer);
    Game.bindInterfaces({
      host: HostBridge,
      input: inputChannel.consumer,
      graphics: graphicsChannel.producer,
      audio: audioChannel.producer
    });
    Graphics.bindInterface(graphicsChannel.consumer, {
      getBattleCanvas: () => document.getElementById("battle-canvas"),
      getMinimapCanvas: () => getMinimapOffscreenCanvas()
    });
    if (typeof SoundEngine !== "undefined" && typeof SoundEngine.bindInterface === "function") {
      SoundEngine.bindInterface(audioChannel.consumer);
    }

    Game.init();
    inputChannel.setOnPush(() => {
      Game.processInputs();
      requestCanvasUpdate();
    });
    if (wantsTestsAtBoot()) {
      await Game.loadTests();
      await Graphics.loadTests();
    }
    await Graphics.whenReady();
  } catch (err) {
    reportBootFailure(err);
    return;
  }
  bootGame();
}

startGame();
