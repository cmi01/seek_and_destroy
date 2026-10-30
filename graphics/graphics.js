"use strict";

// ============================================================
// GRAPHICS ORCHESTRATOR — Palette management & render pipeline coordinator.
// Owns and privately loads its four rendering layers (backgroundRenderer.js,
// objectRenderer.js, vfx.js, uiRenderer.js) via Graphics.load(). None of the
// child renderers are exposed on the global scope.
//
// Public API (Graphics):
//   load()                        — load & verify private rendering layers + atlases
//   render(frame)                 — draw one frame (minimap + battle canvas)
//   whenReady()                   — Promise resolved when sprite atlases decode
//   setTheme(t) / getTheme()      — active sprite/palette theme
//   railgunPulseOffset(t, period) — triangle-wave helper used by sprites
//   spriteKey(unit, cellPx) / spriteGet(unit)
//   blitSprite / drawUnitStatic / drawUnitDynamic / drawUnitOnCanvas
// ============================================================
const Graphics = (() => {
  const GRAPHICS_CHILDREN = [
    "graphics/backgroundRenderer.js",
    "graphics/objectRenderer.js",
    "graphics/vfx.js",
    "graphics/uiRenderer.js",
    "assets/graphics.pak"
  ];
  const GRAPHICS_TEST_CHILD = "tests/graphicsTests.js";

  const _layers = {
    background: null,
    object: null,
    vfx: null,
    ui: null,
    assets: null,
    tests: null
  };

  let _registrationOpen = true;
  let _loadPromise = null;
  let _graphicsBridge = null;
  let _activeTheme = "default";
  let _atlasesInitialized = false;
  let _missingChildrenReported = false;
  let _stylesInjected = false;
  const _terrainCache = { canvas: null, key: "", ref: null };
  const _atlasState = { images: {}, readyPromises: [] };
  let _themesData = null;
  const _colorCaches = {};
  const RGB_RE = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

  function _getThemesData() {
    if (_themesData) return _themesData;
    if (_graphicsConsumer && typeof _graphicsConsumer.getStaticConfig === "function") {
      const cfg = _graphicsConsumer.getStaticConfig();
      if (cfg && cfg.themesData) {
        _themesData = cfg.themesData;
        return _themesData;
      }
    }
    return null;
  }

  function _normalizeTheme(raw) {
    const td = _getThemesData();
    const order = (td && Array.isArray(td.order)) ? td.order : ["default", "retro", "alien"];
    const aliases = (td && td.aliases) ? td.aliases : { b: "default", iron_dusk: "default" };
    const key = String(raw == null ? "" : raw).trim().toLowerCase();
    if (order.includes(key)) return key;
    if (Object.prototype.hasOwnProperty.call(aliases, key)) return aliases[key];
    return order[0];
  }

  function _remapLiteral(lit, map) {
    const s = String(lit).trim();
    if (s[0] === "#") {
      const hit = map[s.toLowerCase()];
      return hit || s;
    }
    const m = RGB_RE.exec(s);
    if (!m) return s;
    const hit = map[m[1] + "," + m[2] + "," + m[3]];
    if (!hit) return s;
    return m[4] !== undefined ? `rgba(${hit.split(",").join(", ")}, ${m[4]})` : `rgb(${hit.split(",").join(", ")})`;
  }

  function _themeColor(lit) {
    if (_activeTheme === "default") return lit;
    const td = _getThemesData();
    const map = (td && td.colorRemap) ? td.colorRemap[_activeTheme] : null;
    if (!map) return lit;
    const cache = _colorCaches[_activeTheme] || (_colorCaches[_activeTheme] = new Map());
    let out = cache.get(lit);
    if (out === undefined) {
      out = _remapLiteral(lit, map);
      cache.set(lit, out);
    }
    return out;
  }

  function _spriteConfig() {
    const td = _getThemesData();
    return (td && td.spriteAtlas) ? td.spriteAtlas : null;
  }

  // Inline loader: this file loads ONLY its own direct children.
  function _loadScripts(list, optional) {
    return Promise.allSettled(list.map(src => new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false; // force in-order execution
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error("Failed to load script: " + src));
      document.head.appendChild(s);
    }))).then(results => {
      const failures = [];
      results.forEach(r => {
        if (r.status !== "rejected") return;
        if (optional) console.error("[S&D graphics] Optional script failed to load; continuing without it:", r.reason.message);
        else failures.push(r.reason.message);
      });
      if (failures.length > 0) throw new Error(failures.join("\n"));
    });
  }

  function _registerLayer(name, api) {
    if (!_registrationOpen || !(name in _layers)) return;
    _layers[name] = api;
  }

  function _ensureCanvasStyles() {
    if (_stylesInjected || typeof document === "undefined" || !document.head) return;
    _stylesInjected = true;
    const styleEl = document.createElement("style");
    styleEl.textContent = [
      ":root{--bg-void:#06080e;--t1-cyan:#38bdf8;--warp-violet:#c084fc;--font-mono:'JetBrains Mono','Share Tech Mono','Consolas','Courier New',monospace;}",
      "body[data-theme='retro']{--bg-void:#020a05;--t1-cyan:#4ade80;--warp-violet:#38bdf8;}",
      "body[data-theme='alien']{--bg-void:#070312;--t1-cyan:#2dd4bf;--warp-violet:#e879f9;}",
      "*{box-sizing:border-box;margin:0;padding:0;user-select:none;}",
      "body{background-color:#030407;color:#e2e8f0;font-family:var(--font-mono);display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;overflow:hidden;padding:0;}",
      "#battle-canvas{display:block;border:1px solid rgba(56,189,248,0.35);background:var(--bg-void);box-shadow:0 0 24px rgba(0,0,0,0.9);cursor:crosshair;}",
      "#battle-canvas.warp-anomaly{border-color:#a855f7;box-shadow:0 0 18px rgba(168,85,247,0.45),inset 0 0 12px rgba(168,85,247,0.35);}"
    ].join("\n");
    document.head.appendChild(styleEl);
  }

  function _getBattleCanvas() {
    if (_canvasProvider && typeof _canvasProvider.getBattleCanvas === "function") {
      return _canvasProvider.getBattleCanvas();
    }
    if (_graphicsBridge && typeof _graphicsBridge.getBattleCanvas === "function") {
      return _graphicsBridge.getBattleCanvas();
    }
    return typeof document !== "undefined" ? document.getElementById("battle-canvas") : null;
  }

  function _getMinimapCanvas() {
    if (_canvasProvider && typeof _canvasProvider.getMinimapCanvas === "function") {
      return _canvasProvider.getMinimapCanvas();
    }
    if (_graphicsBridge && typeof _graphicsBridge.getMinimapCanvas === "function") {
      return _graphicsBridge.getMinimapCanvas();
    }
    return null;
  }

  function _cFont(weight, sizePx) {
    const s = (_graphicsBridge && _graphicsBridge.metrics) ? _graphicsBridge.metrics.textScale : 1;
    const size = Math.min(16, Math.max(5, Math.round(sizePx * s)));
    return `${weight ? weight + " " : ""}${size}px monospace`;
  }

  function _worldFont(weight, sizePx) {
    const s = (_graphicsBridge && _graphicsBridge.metrics) ? _graphicsBridge.metrics.fontScale : 1;
    const size = Math.max(5, Math.round(sizePx * s));
    return `${weight ? weight + " " : ""}${size}px monospace`;
  }

  function _uiFont(weight, sizePx) {
    const us = (_graphicsBridge && _graphicsBridge.metrics && _graphicsBridge.metrics.uiScale)
      ? _graphicsBridge.metrics.uiScale
      : 1;
    const size = Math.max(8, Math.min(20, Math.round(sizePx * 1.45 * us)));
    return `${weight ? weight + " " : ""}${size}px monospace`;
  }

  function _boardPalette() {
    const td = _getThemesData();
    if (td && td.palettes && td.palettes[_activeTheme]) {
      return td.palettes[_activeTheme];
    }
    return (td && td.palettes && td.palettes.default) ? td.palettes.default : {};
  }

  function _areChildrenReady() {
    return Boolean(
      _layers.background &&
      _layers.object &&
      _layers.vfx &&
      _layers.ui
    );
  }

  function _ensureAtlases() {
    if (!_areChildrenReady()) {
      if (!_missingChildrenReported) {
        _missingChildrenReported = true;
        console.error("[S&D graphics] One or more child renderers (backgroundRenderer.js, objectRenderer.js, vfx.js, uiRenderer.js) are not loaded; the board cannot be drawn.");
      }
      return;
    }
    if (_atlasesInitialized) return;
    _atlasesInitialized = true;
    _layers.object.initAtlases(_atlasState, _layers.assets);
  }

  const Renderer = {
    setTheme(theme) {
      _activeTheme = _normalizeTheme(theme);
      return _activeTheme;
    },

    getTheme() {
      return _activeTheme;
    },

    spriteKey(unit, cellPx) {
      return _layers.object.spriteKey(unit, cellPx, _activeTheme);
    },

    spriteGet(unit) {
      return _layers.object.getSpriteSlice(unit, _activeTheme, _atlasState.images, _spriteConfig());
    },

    blitSprite(ctx, sprite, cx, cy, targetCellPx) {
      _layers.object.blitSprite(ctx, sprite, cx, cy, targetCellPx);
    },

    drawUnitStatic(ctx, cx, cy, cellPx, unit) {
      _layers.object.drawUnitStatic(ctx, cx, cy, cellPx, unit, _activeTheme, _atlasState.images, _spriteConfig());
    },

    drawUnitDynamic(ctx, cx, cy, cellPx, unit, now) {
      const shipSpecs = (_graphicsBridge && _graphicsBridge.SHIP_SPECS) ? _graphicsBridge.SHIP_SPECS : null;
      _layers.object.drawUnitDynamic(ctx, cx, cy, cellPx, unit, now || 0, _boardPalette(), shipSpecs, cellPx, _themeColor);
    },

    drawUnitOnCanvas(ctx, cx, cy, cellPx, unit, now) {
      this.drawUnitStatic(ctx, cx, cy, cellPx, unit, now);
      this.drawUnitDynamic(ctx, cx, cy, cellPx, unit, now);
    },

    draw(now, visCache) {
      if (!_graphicsBridge || !_areChildrenReady()) return;
      const state = _graphicsBridge.state || _graphicsBridge.State;
      if (!state) return;
      const canvas = _getBattleCanvas();
      if (!canvas) return;
      if (_graphicsBridge.cursor && canvas.style.cursor !== _graphicsBridge.cursor) {
        canvas.style.cursor = _graphicsBridge.cursor;
      }
      const ctx = canvas.getContext("2d");
      const metrics = _graphicsBridge.metrics;
      const CP = metrics.cellPx;
      const DS = metrics.displaySize;
      const FS = metrics.fontScale;
      const TS = metrics.textScale;
      const US = metrics.uiScale || 1;
      const VX = state.viewX;
      const VY = state.viewY;
      const VS = state.viewSpan;
      const RS = metrics.renderScale;
      const gridSize = _graphicsBridge.GRID_SIZE || 32;

      let RVS = VS, RVX = VX, RVY = VY;
      let DX0 = VX, DX1 = VX + VS, DY0 = VY, DY1 = VY + VS;

      if (_graphicsBridge.viewport) {
        const vp = _graphicsBridge.viewport;
        RVS = vp.renderViewSpan;
        RVX = vp.renderViewX;
        RVY = vp.renderViewY;
        DX0 = vp.dx0;
        DX1 = vp.dx1;
        DY0 = vp.dy0;
        DY1 = vp.dy1;
      } else if (state.zoomAnim && state.zoomAnim.active) {
        const anim = state.zoomAnim;
        const t = Math.min(1, Math.max(0, (now - anim.start) / anim.duration));
        const ease = 1 - Math.pow(1 - t, 3);

        RVS = anim.fromSpan + (anim.toSpan - anim.fromSpan) * ease;
        RVX = anim.fromX + (anim.toX - anim.fromX) * ease;
        RVY = anim.fromY + (anim.toY - anim.fromY) * ease;
        DX0 = Math.max(0, Math.floor(Math.min(anim.fromX, anim.toX)));
        DX1 = Math.min(gridSize, Math.ceil(Math.max(anim.fromX + anim.fromSpan, anim.toX + anim.toSpan)));
        DY0 = Math.max(0, Math.floor(Math.min(anim.fromY, anim.toY)));
        DY1 = Math.min(gridSize, Math.ceil(Math.max(anim.fromY + anim.fromSpan, anim.toY + anim.toSpan)));
      }

      const bp = _boardPalette();

      // Clear whole canvas in screen space
      ctx.setTransform(RS, 0, 0, RS, 0, 0);
      ctx.fillStyle = bp.bg;
      ctx.fillRect(0, 0, DS, DS);

      const uiHud = _graphicsBridge.uiHud || null;
      const isOpaqueFullModal = Boolean(uiHud && (uiHud.activeModal === "bridge" || uiHud.activeModal === "campaign"));
      const unitsList = Array.isArray(state.units) ? state.units : [];
      const getUnitAt = (gx, gy) => unitsList.find(u => u && u.hp > 0 && u.x === gx && u.y === gy) || null;
      const canShieldFn = () => Boolean(state.canShieldSelected);

      // Skip world-space board rendering when an opaque full-screen modal is open (ISS-030).
      if (isOpaqueFullModal) {
        _layers.ui.drawHud({
          ctx, now, state, bp, theme: _activeTheme,
          DS, TS, FS, US,
          metrics: _graphicsBridge.metrics,
          minimapCanvas: null,
          uiHud,
          getUnitAt,
          canShield: canShieldFn,
          drawUnitStatic: (c, cx, cy, cp, u) => Renderer.drawUnitStatic(c, cx, cy, cp, u, now),
          drawUnitOnCanvas: (c, cx, cy, cp, u) => Renderer.drawUnitOnCanvas(c, cx, cy, cp, u, now),
          fontHelper: _uiFont,
          TC: _themeColor
        });
        return;
      }

      // World transform with zoom interpolation
      const RCP = DS / RVS;
      const a = VS / RVS;
      const scale = RS * a;
      ctx.setTransform(scale, 0, 0, scale, -RS * RVX * RCP, -RS * RVY * RCP);

      const visMatrix = visCache || Array.from({ length: gridSize }, () => Array(gridSize).fill(true));
      const gridToCenter = (gx, gy) => ({ x: (gx + 0.5) * CP, y: (gy + 0.5) * CP });
      const isUnitSpottedByTeam = (u, team) => Boolean(u && (u.team === team || u.spottedByPlayer));
      const getEffectiveScan = u => (u && typeof u.effectiveScan === "number") ? u.effectiveScan : (u ? (u.scan || 0) : 0);

      // 1. Background grid & procedural terrain
      _layers.background.drawBattleGridAndTerrain({
        ctx, visMatrix, state, theme: _activeTheme, bp, gridSize,
        CP, FS, DX0, DX1, DY0, DY1,
        gridToCenter,
        terrainCache: _terrainCache,
        TC: _themeColor
      });

      // 2. Warp perimeter arcs
      _layers.object.drawBattleWarpArcs({
        ctx, state, CP, TS, DX0, DX1, DY0, DY1,
        spawnRadius: _graphicsBridge.SPAWN_RADIUS,
        gridToCenter, isUnitSpottedByTeam,
        fontHelper: _cFont,
        TC: _themeColor
      });

      // CLIP for visible cells (Layers 2 & 3 & VFX)
      ctx.save();
      ctx.beginPath();
      for (let gx = DX0; gx < DX1; gx++) {
        for (let gy = DY0; gy < DY1; gy++) {
          if (visMatrix[gx] && visMatrix[gx][gy]) ctx.rect(gx * CP, gy * CP, CP, CP);
        }
      }
      ctx.clip();

      // 3. Sensor circles, radar wedge, historical vectors & ships
      _layers.object.drawBattleObjects({
        ctx, now, state, bp, theme: _activeTheme,
        shipSpecs: _graphicsBridge.SHIP_SPECS,
        CP, lodCellPx: RCP, DX0, DX1, DY0, DY1,
        gridToCenter, getUnitAt, getEffectiveScan, isUnitSpottedByTeam,
        atlasImages: _atlasState.images,
        spriteConfig: _spriteConfig(),
        TC: _themeColor
      });

      // 4. Active VFX animations
      _layers.vfx.drawBattleAnimations({
        ctx, now, state, CP, TS,
        gridToCenter, isUnitSpottedByTeam,
        fontHelper: _cFont,
        getSprite: (u, cp) => Renderer.spriteGet(u, cp),
        blitSprite: (c, sp, x, y, cp) => Renderer.blitSprite(c, sp, x, y, cp),
        drawUnitDynamic: (c, x, y, cp, u, t) => Renderer.drawUnitDynamic(c, x, y, cp, u, t),
        TC: _themeColor
      });

      ctx.restore(); // Remove clip

      // 5. Fog of War
      _layers.background.drawBattleFog({
        ctx, visMatrix, state, bp, CP, DX0, DX1, DY0, DY1,
        TC: _themeColor
      });

      // 6. Tactical overlays (Move/Shoot/Capture/Shield indicators)
      _layers.object.drawBattleTacticalOverlays({
        ctx, state, bp, CP, FS, TS,
        gridToCenter,
        fontHelper: _worldFont,
        TC: _themeColor
      });

      // 7. World-space UI reticles (Selection brackets & Hovered cell brackets)
      _layers.ui.drawBattleWorldReticles({
        ctx, now, state, bp, CP, FS, TS, DX0, DX1, DY0, DY1,
        gridToCenter, getUnitAt, isUnitSpottedByTeam, getEffectiveScan,
        fontHelper: _worldFont,
        TC: _themeColor
      });

      // 8. Screen-space HUD, Minimap, Telemetry, Intel, Modals & Canvas Buttons (driven by state.buttonHovered)
      ctx.setTransform(RS, 0, 0, RS, 0, 0);
      _layers.ui.drawHud({
        ctx, now, state, bp, theme: _activeTheme,
        DS, TS, FS, US,
        metrics: _graphicsBridge.metrics,
        minimapCanvas: _getMinimapCanvas(),
        uiHud: _graphicsBridge.uiHud || null,
        getUnitAt,
        canShield: canShieldFn,
        drawUnitStatic: (c, cx, cy, cp, u) => Renderer.drawUnitStatic(c, cx, cy, cp, u, now),
        drawUnitOnCanvas: (c, cx, cy, cp, u) => Renderer.drawUnitOnCanvas(c, cx, cy, cp, u, now),
        fontHelper: _uiFont,
        TC: _themeColor
      });
    },

    drawMinimap(now, visCache) {
      if (!_graphicsBridge || !_areChildrenReady()) return;
      const state = _graphicsBridge.state || _graphicsBridge.State;
      if (!state) return;
      const canvas = _getMinimapCanvas();
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const metrics = _graphicsBridge.metrics;
      const mmSize = metrics.minimapCanvasSize;
      const gridSize = _graphicsBridge.GRID_SIZE || 32;
      const cellPx = mmSize / gridSize;
      const RS = metrics.renderScale;

      ctx.setTransform(RS, 0, 0, RS, 0, 0);

      const bp = _boardPalette();
      const visMatrix = visCache || Array.from({ length: gridSize }, () => Array(gridSize).fill(true));

      _layers.background.drawMinimapBackground({
        ctx, visMatrix, state, bp, gridSize, mmSize, cellPx,
        TC: _themeColor
      });

      _layers.object.drawMinimapUnits({
        ctx, state, bp, cellPx,
        isUnitSpottedByTeam: (u, team) => Boolean(u && (u.team === team || u.spottedByPlayer))
      });

      _layers.ui.drawMinimapUi({
        ctx, state, bp, cellPx, now,
        TC: _themeColor
      });
    }
  };

  // Draw one frame. `frame` is the per-frame RenderFrameDTO published by Game.
  // Options: skipBoard (update bindings/theme only), battleOnly, minimapOnly.
  function render(frame) {
    _ensureCanvasStyles();
    _ensureAtlases();
    if (!frame || typeof frame !== "object") return;

    _graphicsBridge = frame;
    const stateObj = frame.state || frame.State || null;

    const requestedTheme = frame.theme || (stateObj && stateObj.theme) || null;
    if (requestedTheme && _normalizeTheme(requestedTheme) !== _activeTheme) {
      _activeTheme = Renderer.setTheme(requestedTheme);
    }

    if (frame.skipBoard) return;
    if (!stateObj) return;

    const now = (typeof frame.now === "number")
      ? frame.now
      : ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());

    const gridSize = frame.GRID_SIZE || 32;
    const rawVis = frame.visCache || (stateObj && stateObj.visCache) || null;
    const visMatrix = rawVis || Array.from({ length: gridSize }, () => Array(gridSize).fill(true));

    const uiHud = frame.uiHud || null;
    const isOpaqueFullModal = Boolean(uiHud && (uiHud.activeModal === "bridge" || uiHud.activeModal === "campaign"));

    if (!frame.battleOnly && !isOpaqueFullModal) {
      Renderer.drawMinimap(now, visMatrix);
    }
    if (!frame.minimapOnly) {
      Renderer.draw(now, visMatrix);
    }
  }

  let _graphicsConsumer = null;
  let _canvasProvider = null;

  function bindInterface(graphicsConsumer, canvasProvider) {
    _graphicsConsumer = graphicsConsumer || null;
    _canvasProvider = canvasProvider || null;
  }

  function step() {
    if (!_graphicsConsumer || typeof _graphicsConsumer.readFrame !== "function") return null;
    const frame = _graphicsConsumer.readFrame();
    if (!frame) return null;
    render(frame);
    return frame;
  }

  function whenReady() {
    _ensureAtlases();
    return _areChildrenReady() ? _layers.object.whenReady(_atlasState) : Promise.resolve([]);
  }

  async function load() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
      await _loadScripts(GRAPHICS_CHILDREN);
      _registrationOpen = false;
      delete api._registerLayer;
      const missing = [
        ["graphics/backgroundRenderer.js", _layers.background],
        ["graphics/objectRenderer.js",     _layers.object],
        ["graphics/vfx.js",                _layers.vfx],
        ["graphics/uiRenderer.js",         _layers.ui],
        ["assets/graphics.pak",            _layers.assets]
      ].filter(c => !c[1]).map(c => c[0]);
      if (missing.length > 0) {
        throw new Error("These scripts loaded but did not register their module (see earlier errors):\n  " + missing.join("\n  "));
      }
      _ensureCanvasStyles();
      _ensureAtlases();
      await whenReady();
    })();
    return _loadPromise;
  }

  // ---- On-demand self-tests (child: tests/graphicsTests.js) ----------------
  let _testsPromise = null;
  function loadTests() {
    if (_layers.tests) return Promise.resolve();
    if (!_testsPromise) {
      _registrationOpen = true;
      api._registerLayer = _registerLayer;
      _testsPromise = _loadScripts([GRAPHICS_TEST_CHILD]).then(() => {
        if (!_layers.tests) throw new Error(GRAPHICS_TEST_CHILD + " loaded but did not register its module.");
      }).finally(() => {
        _registrationOpen = false;
        delete api._registerLayer;
      }).catch(err => {
        _testsPromise = null;
        throw err;
      });
    }
    return _testsPromise;
  }

  function _testBridge() {
    const cfg = (_graphicsConsumer && typeof _graphicsConsumer.getStaticConfig === "function")
      ? _graphicsConsumer.getStaticConfig() : null;
    return {
      get shipSpecs() { return cfg ? cfg.shipSpecs : null; },
      createCanvas(w, h) {
        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        return off;
      },
      drawUnitStatic(ctx, cx, cy, cellPx, unit) { Renderer.drawUnitStatic(ctx, cx, cy, cellPx, unit); },
      getRailgunPulseOffset(t, period) { return _layers.object.railgunPulseOffset(t, period); }
    };
  }

  async function runTest(testName) {
    await loadTests();
    await whenReady();
    return _layers.tests(_testBridge(), testName);
  }

  _ensureCanvasStyles();

  const api = {
    _registerLayer,
    load,
    bindInterface,
    step,
    render,
    whenReady,
    loadTests,
    runTest,
    setTheme: theme => Renderer.setTheme(theme),
    getTheme: () => Renderer.getTheme(),
    railgunPulseOffset: (t, period) => _layers.object.railgunPulseOffset(t, period),
    spriteKey: (unit, cellPx) => Renderer.spriteKey(unit, cellPx),
    spriteGet: unit => Renderer.spriteGet(unit),
    blitSprite: (ctx, sprite, cx, cy, targetCellPx) => Renderer.blitSprite(ctx, sprite, cx, cy, targetCellPx),
    drawUnitStatic: (ctx, cx, cy, cellPx, unit) => Renderer.drawUnitStatic(ctx, cx, cy, cellPx, unit),
    drawUnitDynamic: (ctx, cx, cy, cellPx, unit, now) => Renderer.drawUnitDynamic(ctx, cx, cy, cellPx, unit, now),
    drawUnitOnCanvas: (ctx, cx, cy, cellPx, unit, now) => Renderer.drawUnitOnCanvas(ctx, cx, cy, cellPx, unit, now)
  };

  return api;
})();
