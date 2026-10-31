"use strict";

// ============================================================
// MAIN.JS — Supervisor & Wiring Root (V69).
// Initializes the 3 Unidirectional Interface Servers (InputInterface,
// GraphicsInterface, AudioInterface) and the 4 Core System Processes
// (Game, Graphics, Inputs, SoundEngine) and steps the frame loop.
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
  renderScale: 2,     // min(devicePixelRatio, 2)
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
  minimapSize: 120,          // frame outer size (CSS px, includes border)
  minimapCanvasSize: 118,    // canvas content size (CSS px) = minimapSize − 2
  minimapDevicePx: 236       // canvas backing store = minimapCanvasSize × renderScale
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
// Each core owns its own tests (Game -> tests/gameTests.js,
// Graphics -> tests/graphicsTests.js); main.js only routes to them.
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

  const availW = Math.max(200, (window.innerWidth || 768) - 8);
  const availH = Math.max(200, (window.innerHeight || 768) - 8);
  const size   = Math.max(200, Math.floor(Math.min(availW, availH)));

  canvas.style.width  = size + "px";
  canvas.style.height = size + "px";

  const renderScale = Math.min(window.devicePixelRatio || 1, 2);
  const devicePx    = Math.round(size * renderScale);

  LayoutMetrics.displaySize    = size;
  LayoutMetrics.viewportWidth  = availW;
  LayoutMetrics.viewportHeight = availH;
  LayoutMetrics.isWidescreen   = availW > availH * 1.15;
  LayoutMetrics.renderScale    = renderScale;
  LayoutMetrics.devicePx       = devicePx;

  if (canvas.width !== devicePx || canvas.height !== devicePx) {
    canvas.width  = devicePx;
    canvas.height = devicePx;
  }

  const minimapSize       = Math.round(120 * size / 768); // fixed design-grid size (120), scaled with the canvas
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

function bootGame() {
  exposeDebugHandle();
  Inputs.bind();
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
// main.js loads ONLY its own direct children: the 3 Unidirectional Interface
// Servers and the 4 Core System Processes. Every other parent carries its own
// inline loader for its own children.
const INTERFACE_SCRIPTS = [
  "interfaces/inputInterface.js",
  "interfaces/graphicsInterface.js",
  "interfaces/audioInterface.js"
];
const PROCESS_SCRIPTS = [
  "core/game.js",
  "graphics/graphics.js",
  "core/inputs.js",
  "audio/sounds.js"
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

async function startGame(){
  try {
    await _loadScripts(INTERFACE_SCRIPTS);
    _verifyLoaded([
      ["interfaces/inputInterface.js",    () => typeof InputInterface !== "undefined" && typeof InputInterface.create === "function"],
      ["interfaces/graphicsInterface.js", () => typeof GraphicsInterface !== "undefined" && typeof GraphicsInterface.create === "function"],
      ["interfaces/audioInterface.js",    () => typeof AudioInterface !== "undefined" && typeof AudioInterface.create === "function"]
    ]);

    await _loadScripts(PROCESS_SCRIPTS, new Set(["audio/sounds.js"]));
    _verifyLoaded([
      ["core/game.js",         () => typeof Game !== "undefined" && typeof Game.load === "function"],
      ["graphics/graphics.js", () => typeof Graphics !== "undefined" && typeof Graphics.load === "function"],
      ["core/inputs.js",       () => typeof Inputs !== "undefined"],
      ["audio/sounds.js",      () => typeof SoundEngine !== "undefined" && typeof SoundEngine.load === "function"]
    ], new Set(["audio/sounds.js"]));

    const inputChannel = InputInterface.create();
    const graphicsChannel = GraphicsInterface.create();
    const audioChannel = AudioInterface.create();

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
