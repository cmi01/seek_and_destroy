"use strict";
// ============================================================
// GRAPHICS ORCHESTRATOR — Palette management & render pipeline coordinator.
// Owns and privately loads its four rendering layers (backgroundRenderer.js,
// objectRenderer.js, vfx.js, uiRenderer.js) via Graphics.load(). None of the
// child renderers are exposed on the global scope.
//
// The core owns the canvas and sprite caches (§2): it creates/loads the
// atlas Images, owns the terrain cache canvas + key + invalidation, holds
// the single RNG source, and runs the shared ship renderer (static blit +
// dynamic subsystems). Layers receive plain data (sprite slice descriptors,
// sheet+rect drawing material, resolved fonts/colors) and never execute
// each other's code.
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

  const THEME_FILES = {
    default: "sprites_default.png",
    retro: "sprites_retro.png",
    alien: "sprites_alien.png"
  };

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
  const _uiColorCache = {};
  const _uiFontCache = {};
  const RGB_RE = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

  const _hasFlag = (u, f) => Boolean(u && u.flags && (typeof u.flags.has === "function" ? u.flags.has(f) : Array.isArray(u.flags) && u.flags.includes(f)));
  const _isSpottedByTeam = (u, team) => Boolean(u && (u.team === team || u.spottedByPlayer));
  const TAU = Math.PI * 2;

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

  // Resolved UI color values keyed by literal — plain data handed to uiRenderer
  // (replaces the old TC closure). Same resolution _themeColor performs.
  const UI_COLOR_LITERALS = [
    "#06040b",
    "#c084fc",
    "rgba(148, 163, 184, 0.4)",
    "rgba(6, 8, 14, 0.72)",
    "rgba(148, 163, 184, 0.25)",
    "#ffffff",
    "rgba(15, 23, 42, 0.90)",
    "rgba(6, 8, 14, 0.88)",
    "rgba(148, 163, 184, 0.35)",
    "#06080e",
    "rgba(148, 163, 184, 0.45)",
    "#e2e8f0",
    "#94a3b8",
    "#334155",
    "#34d399",
    "rgba(6, 8, 14, 0.92)",
    "rgba(6, 8, 14, 0.82)",
    "#64748b",
    "rgba(6, 8, 14, 0.90)",
    "rgba(6, 8, 14, 0.93)",
    "rgba(4, 6, 11, 0.94)",
    "rgba(3, 5, 10, 0.88)",
    "#060911",
    "rgba(10, 15, 26, 0.95)",
    "rgba(56, 189, 248, 0.3)",
    "rgba(10, 15, 26, 0.45)",
    "rgba(244, 63, 94, 0.35)",
    "rgba(250, 204, 21, 0.25)",
    "rgba(2, 132, 199, 0.28)",
    "rgba(10, 15, 26, 0.88)",
    "rgba(56, 189, 248, 0.4)",
    "#475569",
    "rgba(148, 163, 184, 0.75)",
    "rgba(250, 204, 21, 0.55)",
    "rgba(56, 189, 248, 0.28)",
    "rgba(250, 204, 21, 0.45)",
    "rgba(250, 204, 21, 0.30)",
    "rgba(2, 132, 199, 0.35)",
    "rgba(16, 95, 72, 0.50)",
    "rgba(10, 15, 26, 0.92)",
    "rgba(52, 211, 153, 0.6)",
    "rgba(3, 5, 10, 0.86)",
    "#cbd5e1",
    "rgba(250, 204, 21, 0.22)",
    "rgba(56, 189, 248, 0.22)",
    "rgba(244, 63, 94, 0.34)",
    "rgba(254, 72, 26, 0.28)",
    "rgba(192, 132, 252, 0.26)",
    "rgba(56, 189, 248, 0.30)",
    "rgba(148, 163, 184, 0.28)",
    "rgba(250, 204, 21, 0.6)"
  ];

  // Resolved UI font strings keyed "<weight>:<sizePx>" — plain data handed to
  // uiRenderer (replaces the old fontHelper closure). Same sizing _uiFont used.
  const UI_FONT_SPECS = [
    ["bold:7", "bold", 7],
    ["regular:6", "", 6],
    ["bold:6", "bold", 6],
    ["bold:6.5", "bold", 6.5],
    ["bold:8.5", "bold", 8.5],
    ["bold:8", "bold", 8],
    ["bold:6.2", "bold", 6.2],
    ["regular:5.8", "", 5.8],
    ["regular:6.5", "", 6.5],
    ["bold:12", "bold", 12],
    ["bold:11", "bold", 11],
    ["bold:6.6", "bold", 6.6],
    ["bold:7.4", "bold", 7.4],
    ["bold:9.5", "bold", 9.5],
    ["regular:6.8", "", 6.8]
  ];

  function _uiColors() {
    let out = _uiColorCache[_activeTheme];
    if (!out) {
      out = {};
      for (let i = 0; i < UI_COLOR_LITERALS.length; i++) {
        const lit = UI_COLOR_LITERALS[i];
        out[lit] = _themeColor(lit);
      }
      _uiColorCache[_activeTheme] = out;
    }
    return out;
  }

  function _uiFonts(us) {
    const cacheKey = String(us);
    let out = _uiFontCache[cacheKey];
    if (!out) {
      out = {};
      for (let i = 0; i < UI_FONT_SPECS.length; i++) {
        const [k, weight, sizePx] = UI_FONT_SPECS[i];
        const size = Math.max(8, Math.min(20, Math.round(sizePx * 1.45 * us)));
        out[k] = (weight ? weight + " " : "") + size + "px monospace";
      }
      _uiFontCache[cacheKey] = out;
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

  function _createCanvas(w, h) {
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    return off;
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

  function _boardPalette() {
    const td = _getThemesData();
    if (td && td.palettes && td.palettes[_activeTheme]) {
      return td.palettes[_activeTheme];
    }
    return (td && td.palettes && td.palettes.default) ? td.palettes.default : {};
  }

  // ---- Sprite caches: atlas IO, slice resolution & ship rendering ----------
  // The core creates/loads the atlas Images and owns _atlasState. The object
  // layer only answers pure slice queries ({sheetKey, sx, sy, sw, sh}).

  function _initBakedAtlases() {
    const baked = _layers.assets; // { theme: dataURL } | null
    Object.keys(THEME_FILES).forEach(theme => {
      if (_atlasState.images[theme]) return;
      const img = new Image();
      _atlasState.images[theme] = img;
      const p = new Promise(resolve => {
        img.onload = () => {
          resolve(img);
        };
        img.onerror = () => {
          console.error("[S&D graphics] Failed to decode sprite atlas for theme \"" + theme + "\"; ships in this theme will not draw.");
          resolve(null);
        };
      });
      _atlasState.readyPromises.push(p);
      img.src = (baked && baked[theme]) ? baked[theme] : THEME_FILES[theme];
    });
  }

  // Resolves a unit to sheet+rect drawing material (the Image plus its source
  // rect) — the material layers use for their own ctx.drawImage calls.
  function _sliceMaterial(unit) {
    const slice = _layers.object.getSpriteSlice(unit, _activeTheme, _spriteConfig());
    if (!slice) return null;
    const sheet = _atlasState.images[slice.sheetKey] || null;
    if (!sheet) return null;
    return { sheet, sx: slice.sx, sy: slice.sy, sw: slice.sw, sh: slice.sh };
  }

  // Accepts either resolved material ({sheet, …}) or a plain slice
  // ({sheetKey, …}) and blits it centered at (cx, cy).
  function _blitSprite(ctx, sprite, cx, cy, targetCellPx) {
    if (!sprite) return;
    const sheet = sprite.sheet || (sprite.sheetKey ? _atlasState.images[sprite.sheetKey] : null);
    if (!sheet) return;
    const lw = Math.ceil(targetCellPx * 2.2);
    const lh = Math.ceil(targetCellPx * 2.2);
    ctx.drawImage(sheet, sprite.sx, sprite.sy, sprite.sw, sprite.sh, cx - lw / 2, cy - lh / 2, lw, lh);
  }

  function railgunPulseOffset(nowMs, periodMs) {
    const P = periodMs || 1100;
    const u = (((nowMs % P) + P) % P) / P;
    return u < 0.5 ? u * 2 : 2 - u * 2;
  }

  function _plumeTri(ctx, xN, pyPx, R, len, color, flicker, halfWidthR, TC) {
    if (!(len > 0.5)) return;
    const hw = (halfWidthR || 0.09) * R;
    const grad = ctx.createLinearGradient(xN, 0, xN - len, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(1, TC("rgba(0,0,0,0)"));
    ctx.save();
    ctx.globalAlpha = flicker;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xN, pyPx - hw);
    ctx.lineTo(xN - len, pyPx);
    ctx.lineTo(xN, pyPx + hw);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Parent-owned shared ship renderer (moved out of objectRenderer so no
  // layer ever executes another layer's code).
  function _drawUnitDynamic(ctx, cx, cy, cellPx, unit, now, bp, shipSpecs, lodCellPx, rawTC) {
    const TC = typeof rawTC === "function" ? rawTC : (c => c);
    const spec = (shipSpecs && unit) ? shipSpecs[unit.type] : null;
    if (!spec || !bp) return;
    const lodPx = lodCellPx || cellPx;
    const R = (cellPx * 0.5) * 0.85;
    const rot = unit.team === 1 ? 0 : Math.PI;
    const isMoved = _hasFlag(unit, "-moved");
    const isAttacked = _hasFlag(unit, "-attacked");

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    // D1: Engine plumes
    if (!isMoved && spec.plumes && spec.plumes.length > 0) {
      const pl = bp.plumeSpec;
      const P = bp.plume[unit.team === 1 ? 1 : 2];
      const flicker = pl.flickerBase + pl.flickerAmp * Math.sin(now * pl.flickerFreq + cx * pl.flickerSpatial);
      const baseLen = (pl.baseLenR + pl.lenAmpR * Math.sin(now * pl.lenFreq)) * R;
      const xN = pl.nozzleX * R;
      const coreR = Math.max(pl.minCoreRadiusPx, R * pl.coreRadiusR);

      for (let i = 0; i < spec.plumes.length; i++) {
        const py = spec.plumes[i];
        const phase = now * pl.phaseFreq + i * pl.phaseStep;
        const len = baseLen * (pl.phaseBase + pl.phaseAmp * Math.sin(phase));
        const pyPx = py * R;

        _plumeTri(ctx, xN, pyPx, R, len, P.outer, flicker, pl.halfWidthR, TC);
        _plumeTri(ctx, xN, pyPx, R, len * pl.midLenScale, P.mid, flicker, pl.halfWidthR, TC);
        ctx.fillStyle = P.inner;
        ctx.fillRect(xN - len * pl.innerLenScale, pyPx - pl.innerHeightPx / 2, len * pl.innerLenScale, pl.innerHeightPx);
        ctx.fillStyle = P.core;
        ctx.beginPath();
        ctx.arc(xN, pyPx, coreR, 0, TAU);
        ctx.fill();
      }
    }

    // D2: Railgun pulse
    if (!isAttacked && spec.railgunTier > 0 && lodPx >= 28) {
      const rp = bp.rail;
      const tier = spec.railgunTier;
      const x0 = tier === 1 ? -0.50 * R : -0.78 * R;
      const gunLen = tier === 1 ? 1.46 * R : 1.86 * R;
      const halfH = tier === 1 ? 0.10 * R : 0.21 * R;
      const chanH = halfH * 0.44;
      const seg = gunLen * rp.segmentScale;

      const tri = railgunPulseOffset(now, rp.periodMs);
      const e = tri < 0.5 ? 2 * tri * tri : 1 - Math.pow(-2 * tri + 2, 2) / 2;
      const px = x0 + e * (gunLen - seg);

      const glow = ctx.createLinearGradient(px, 0, px + seg, 0);
      glow.addColorStop(0, rp.glowZero);
      glow.addColorStop(0.5, rp.glow);
      glow.addColorStop(1, rp.glowZero);
      ctx.fillStyle = glow;
      ctx.fillRect(px, -chanH * rp.glowHeightScale, seg, chanH * rp.glowHeightScale * 2);

      const hot = ctx.createLinearGradient(px, 0, px + seg, 0);
      hot.addColorStop(0, rp.hotZero);
      hot.addColorStop(0.5, rp.core);
      hot.addColorStop(1, rp.hotZero);
      ctx.fillStyle = hot;
      ctx.fillRect(px, -chanH * rp.coreHeightScale, seg, chanH * rp.coreHeightScale * 2);
    }

    // D3: Animated shield bubble
    if (_hasFlag(unit, "+shield")) {
      const sb = bp.shield;
      const pulse = sb.pulseBase + sb.pulseAmp * Math.sin(now * sb.pulseFreq);
      const sRad = R * sb.radiusScale * pulse;
      const outG = sb.outerGradScale;

      const shieldGrad = ctx.createRadialGradient(0, 0, sRad * sb.innerGradScale, 0, 0, sRad * outG);
      shieldGrad.addColorStop(0, sb.gradStop0);
      shieldGrad.addColorStop(0.8, sb.gradStopMid);
      shieldGrad.addColorStop(1, sb.gradStop1);
      ctx.fillStyle = shieldGrad;
      ctx.beginPath();
      ctx.arc(0, 0, sRad * outG, 0, TAU);
      ctx.fill();

      const vCount = sb.vertices;
      ctx.beginPath();
      for (let i = 0; i < vCount; i++) {
        const a = (i * TAU) / vCount + now * sb.rotFreq;
        const wobble = 1 + sb.wobbleAmp * Math.sin(now * sb.wobbleFreq + i * sb.wobblePhaseStep);
        const vx = Math.cos(a) * sRad * wobble;
        const vy = Math.sin(a) * sRad * wobble;
        if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.strokeStyle = sb.strokeColor;
      ctx.lineWidth = sb.lineWidth;
      ctx.stroke();

      const ns = sb.nodeSize;
      const nh = ns / 2;
      ctx.fillStyle = sb.nodeColor;
      for (let i = 0; i < vCount; i++) {
        const a = (i * TAU) / vCount + now * sb.rotFreq;
        const wobble = 1 + sb.wobbleAmp * Math.sin(now * sb.wobbleFreq + i * sb.wobblePhaseStep);
        ctx.fillRect(Math.cos(a) * sRad * wobble - nh, Math.sin(a) * sRad * wobble - nh, ns, ns);
      }
    }

    ctx.restore();
    // D4: HP badge
    if (lodPx >= 18 && unit.maxHp > 1) {
      const hb = bp.hpBadge;
      const s = cellPx / 24;
      ctx.fillStyle = hb.bgColor;
      ctx.fillRect(cx + 1 * s, cy + 3 * s, 11 * s, 8 * s);
      ctx.font = `bold ${Math.max(6, Math.round(8 * s))}px monospace`;
      ctx.fillStyle = unit.hp < unit.maxHp ? hb.damagedColor : hb.healthyColor;
      ctx.fillText(String(unit.hp), cx + 2 * s, cy + 10 * s);
    }

    // D5: !flagship command insignia (gold command ring + top-left crown star badge)
    if (_hasFlag(unit, "!flagship")) {
      const s = cellPx / 24;
      ctx.save();
      ctx.strokeStyle = bp.gold;
      ctx.lineWidth = Math.max(1, 1.3 * s);
      ctx.setLineDash([3 * s, 2 * s]);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.18, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      const bx = cx - 9 * s;
      const by = cy - 9 * s;
      const br = Math.max(2.2, 3.2 * s);
      ctx.fillStyle = TC("#06080e");
      ctx.beginPath();
      ctx.arc(bx, by, br + 1.1 * s, 0, TAU);
      ctx.fill();

      ctx.fillStyle = bp.gold;
      ctx.beginPath();
      ctx.moveTo(bx, by - br);
      ctx.lineTo(bx + br * 0.85, by);
      ctx.lineTo(bx, by + br);
      ctx.lineTo(bx - br * 0.85, by);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Board ships (static sprite blit + dynamic subsystems) at cell centers.
  function _drawBoardShips(ctx, now, state, CP, lodCellPx, DX0, DX1, DY0, DY1) {
    const shipSpecs = (_graphicsBridge && _graphicsBridge.SHIP_SPECS) ? _graphicsBridge.SHIP_SPECS : null;
    const glidingIds = new Set(
      state.animations.filter(a => a.kind === "glide" && (now - a.start) < a.duration).map(a => a.unitId)
    );
    state.units.forEach(u => {
      if (u.hp <= 0) return;
      if (glidingIds.has(u.id)) return;
      if (!_isSpottedByTeam(u, 1)) return;
      if (u.x < DX0 - 1 || u.x > DX1 || u.y < DY0 - 1 || u.y > DY1) return;
      const cx = (u.x + 0.5) * CP;
      const cy = (u.y + 0.5) * CP;
      const sprite = _sliceMaterial(u);
      if (sprite) _blitSprite(ctx, sprite, cx, cy, CP);
      _drawUnitDynamic(ctx, cx, cy, CP, u, now, _boardPalette(), shipSpecs, lodCellPx, _themeColor);
    });
  }

  // A gliding ship at its eased in-between position (the "glide" animation is
  // pure ship motion, so the parent's ship renderer owns it).
  function _drawGlideShip(ctx, now, state, anim, CP) {
    const u = state.units.find(unit => unit.id === anim.unitId);
    if (!u) return;
    if (u.team === 2 && !_isSpottedByTeam(u, 1)) return;
    const t = Math.min(1, Math.max(0, (now - anim.start) / anim.duration));
    const ease = 1 - Math.pow(1 - t, 3);
    const x1 = (anim.from.x + 0.5) * CP, y1 = (anim.from.y + 0.5) * CP;
    const x2 = (anim.to.x + 0.5) * CP, y2 = (anim.to.y + 0.5) * CP;
    const gx = x1 + (x2 - x1) * ease, gy = y1 + (y2 - y1) * ease;
    const sprite = _sliceMaterial(u);
    if (sprite) _blitSprite(ctx, sprite, gx, gy, CP);
    const shipSpecs = (_graphicsBridge && _graphicsBridge.SHIP_SPECS) ? _graphicsBridge.SHIP_SPECS : null;
    _drawUnitDynamic(ctx, gx, gy, CP, u, now, _boardPalette(), shipSpecs, CP, _themeColor);
  }

  // Ship-icon sprite material (sheet + src rect) for the bridge shop cards.
  function _iconSprites(uiHud) {
    const out = {};
    const cards = (uiHud && uiHud.bridgeModal && Array.isArray(uiHud.bridgeModal.cards)) ? uiHud.bridgeModal.cards : [];
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (!c || !c.dummyUnit || out[c.shipName]) continue;
      out[c.shipName] = _sliceMaterial(c.dummyUnit);
    }
    return out;
  }

  // ---- Terrain cache: core-owned canvas, key & invalidation ----------------
  function _terrainKey(state, themeKey, gridSize, CP, FS) {
    return `${state.levelId}|${themeKey}|${gridSize}|${CP.toFixed(2)}|${FS.toFixed(3)}`;
  }

  // Deterministic asteroid geometry from the single RNG source (the core's
  // mulberry32). Handed to the background layer as plain shape data.
  function _terrainShapes(state, gridSize, FS) {
    const shapes = [];
    for (let gx = 0; gx < gridSize; gx++) {
      const col = state.terrain && state.terrain[gx];
      if (!col) continue;
      for (let gy = 0; gy < gridSize; gy++) {
        if (col[gy] !== "ASTEROID") continue;
        const seed = (state.asteroidSeeds && state.asteroidSeeds[gx]) ? state.asteroidSeeds[gx][gy] : 0.5;
        const rng = _mulberry32(Math.floor(seed * 10000));
        const pts = [];
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const rad = (7.5 + rng() * 4 - 2) * FS;
          pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
        }
        const ex = (rng() * 4 - 2) * FS;
        const ey = (rng() * 4 - 2) * FS;
        const erot = rng() * Math.PI;
        (shapes[gx] || (shapes[gx] = []))[gy] = { seed, pts, ex, ey, erot };
      }
    }
    return shapes;
  }

  // The single RNG source for the graphics core (dropped the child-side
  // makeRng/_mulberry32 duplication).
  function _mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Returns the cached terrain canvas for this key, or repaints it via the
  // background layer (which only receives a validated canvas to paint into).
  function _ensureTerrainCanvas(state, themeKey, bp, gridSize, CP, FS) {
    const key = _terrainKey(state, themeKey, gridSize, CP, FS);
    const cache = _terrainCache;
    if (cache.canvas && cache.key === key && cache.ref === state.terrain) return cache.canvas;
    const totalPx = Math.max(64, Math.ceil(gridSize * CP));
    if (!cache.canvas) cache.canvas = _createCanvas(totalPx, totalPx);
    if (cache.canvas.width !== totalPx || cache.canvas.height !== totalPx) {
      cache.canvas.width = totalPx;
      cache.canvas.height = totalPx;
    }
    _layers.background.paintTerrain({
      canvas: cache.canvas, state, bp, gridSize, CP, FS,
      shapes: _terrainShapes(state, gridSize, FS),
      TC: _themeColor
    });
    cache.key = key;
    cache.ref = state.terrain;
    return cache.canvas;
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
    _initBakedAtlases();
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
      return _layers.object.getSpriteSlice(unit, _activeTheme, _spriteConfig());
    },

    blitSprite(ctx, sprite, cx, cy, targetCellPx) {
      _blitSprite(ctx, sprite, cx, cy, targetCellPx);
    },

    drawUnitStatic(ctx, cx, cy, cellPx, unit) {
      const sprite = _sliceMaterial(unit);
      if (sprite) _blitSprite(ctx, sprite, cx, cy, cellPx);
    },

    drawUnitDynamic(ctx, cx, cy, cellPx, unit, now) {
      const shipSpecs = (_graphicsBridge && _graphicsBridge.SHIP_SPECS) ? _graphicsBridge.SHIP_SPECS : null;
      _drawUnitDynamic(ctx, cx, cy, cellPx, unit, now || 0, _boardPalette(), shipSpecs, cellPx, _themeColor);
    },

    drawUnitOnCanvas(ctx, cx, cy, cellPx, unit, now) {
      this.drawUnitStatic(ctx, cx, cy, cellPx, unit);
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

      // Skip world-space board rendering when an opaque full-screen modal is open (ISS-030).
      if (isOpaqueFullModal) {
        _layers.ui.drawHud({
          ctx, now, state, bp, theme: _activeTheme,
          DS, US,
          metrics: _graphicsBridge.metrics,
          minimapCanvas: null,
          uiHud,
          iconSprites: _iconSprites(uiHud),
          fonts: _uiFonts(US),
          colors: _uiColors()
        });
        return;
      }

      // World transform with zoom interpolation
      const RCP = DS / RVS;
      const a = VS / RVS;
      const scale = RS * a;
      ctx.setTransform(scale, 0, 0, scale, -RS * RVX * RCP, -RS * RVY * RCP);

      const visMatrix = visCache || Array.from({ length: gridSize }, () => Array(gridSize).fill(true));

      // 1. Background grid & terrain (core-owned terrain cache canvas)
      _layers.background.drawBattleGridAndTerrain({
        ctx, visMatrix, state, bp, gridSize,
        CP, FS, DX0, DX1, DY0, DY1,
        terrainCanvas: _ensureTerrainCanvas(state, _activeTheme, bp, gridSize, CP, FS)
      });

      // 2. Warp perimeter arcs
      _layers.object.drawBattleWarpArcs({
        ctx, state, CP, TS, DX0, DX1, DY0, DY1,
        spawnRadius: _graphicsBridge.SPAWN_RADIUS,
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

      // 3. Sensor circles, radar wedge & historical vectors
      _layers.object.drawBattleObjects({
        ctx, now, state, bp, CP, DX0, DX1, DY0, DY1,
        TC: _themeColor
      });

      // 3b. Ships — the parent's own shared ship renderer
      _drawBoardShips(ctx, now, state, CP, RCP, DX0, DX1, DY0, DY1);

      // 4. Active VFX animations — the parent dispatches each animation in
      // order: glides draw ships via the parent renderer, everything else is
      // the vfx layer's own drawing. Exact draw order preserved.
      const vfxCmd = {
        ctx, now, CP, TS,
        fontHelper: _cFont,
        TC: _themeColor
      };
      const activeAnims = state.animations.filter(anim => (now - anim.start) < anim.duration);
      activeAnims.forEach(anim => {
        if (anim.kind === "glide") {
          _drawGlideShip(ctx, now, state, anim, CP);
        } else {
          _layers.vfx.drawAnimation(vfxCmd, anim);
        }
      });

      ctx.restore(); // Remove clip

      // 5. Fog of War
      _layers.background.drawBattleFog({
        ctx, visMatrix, state, bp, CP, DX0, DX1, DY0, DY1,
        TC: _themeColor
      });

      // 6. Tactical overlays (Move/Shoot/Capture/Shield indicators)
      _layers.object.drawBattleTacticalOverlays({
        ctx, state, bp, CP, FS,
        fontHelper: _worldFont,
        TC: _themeColor
      });

      // 7. World-space UI reticles (Selection brackets & Hovered cell brackets)
      _layers.ui.drawBattleWorldReticles({
        ctx, now, state, bp, CP, FS, DX0, DX1, DY0, DY1,
        fonts: _uiFonts(US),
        colors: _uiColors()
      });

      // 8. Screen-space HUD, Minimap, Telemetry, Intel, Modals & Canvas Buttons (driven by state.buttonHovered)
      ctx.setTransform(RS, 0, 0, RS, 0, 0);
      _layers.ui.drawHud({
        ctx, now, state, bp, theme: _activeTheme,
        DS, US,
        metrics: _graphicsBridge.metrics,
        minimapCanvas: _getMinimapCanvas(),
        uiHud,
        iconSprites: _iconSprites(uiHud),
        fonts: _uiFonts(US),
        colors: _uiColors()
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
        ctx, state, bp, cellPx
      });

      _layers.ui.drawMinimapUi({
        ctx, state, bp, cellPx, now,
        colors: _uiColors()
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
    return _areChildrenReady() ? Promise.all(_atlasState.readyPromises) : Promise.resolve([]);
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
      createCanvas: _createCanvas,
      drawUnitStatic(ctx, cx, cy, cellPx, unit) { Renderer.drawUnitStatic(ctx, cx, cy, cellPx, unit); },
      getRailgunPulseOffset(t, period) { return railgunPulseOffset(t, period); }
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
    railgunPulseOffset: (t, period) => railgunPulseOffset(t, period),
    spriteKey: (unit, cellPx) => Renderer.spriteKey(unit, cellPx),
    spriteGet: unit => Renderer.spriteGet(unit),
    blitSprite: (ctx, sprite, cx, cy, targetCellPx) => Renderer.blitSprite(ctx, sprite, cx, cy, targetCellPx),
    drawUnitStatic: (ctx, cx, cy, cellPx, unit) => Renderer.drawUnitStatic(ctx, cx, cy, cellPx, unit),
    drawUnitDynamic: (ctx, cx, cy, cellPx, unit, now) => Renderer.drawUnitDynamic(ctx, cx, cy, cellPx, unit, now),
    drawUnitOnCanvas: (ctx, cx, cy, cellPx, unit, now) => Renderer.drawUnitOnCanvas(ctx, cx, cy, cellPx, unit, now)
  };

  return api;
})();
