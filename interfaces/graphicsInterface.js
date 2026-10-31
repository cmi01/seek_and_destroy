"use strict";

// ============================================================
// GRAPHICS INTERFACE — Strictly 1-Way Data Broker (Game ---> Graphics)
// Initialized and wired by main.js.
// Game only sees `producer.publishStaticConfig(cfg)` & `producer.publishFrame(frameDTO)`.
// Graphics only sees `consumer.getStaticConfig()` & `consumer.readFrame()`.
// Payloads are rebuilt field-by-field on ingest (the audioInterface
// sanitizeCommand/clonePayload precedent): the channel carries only detached
// plain data — never live state, never functions. Deep clones are memoized by
// source identity so stable subtrees (the frame grids, spec tables) are cloned
// once and keep a stable identity across frames for graphics-side caches.
// Producers must therefore pass immutable or per-frame-fresh sub-objects
// (game.js buildFrame does: frozen grid copies + freshly built DTOs).
// ============================================================
const GraphicsInterface = (() => {
  const _cloneMemo = new WeakMap();

  // Deep plain-data clone. Functions and non-plain objects are dropped;
  // Set/Map/typed arrays keep their types (like hud.js's DTO copies).
  function cloneData(v) {
    if (v === null || typeof v !== "object") {
      return typeof v === "function" ? undefined : v;
    }
    const hit = _cloneMemo.get(v);
    if (hit) return hit;
    let out;
    if (Array.isArray(v)) {
      out = [];
      _cloneMemo.set(v, out);
      for (let i = 0; i < v.length; i++) out.push(cloneData(v[i]));
    } else if (v instanceof Set) {
      out = new Set();
      _cloneMemo.set(v, out);
      v.forEach(x => out.add(cloneData(x)));
    } else if (v instanceof Map) {
      out = new Map();
      _cloneMemo.set(v, out);
      v.forEach((val, key) => out.set(cloneData(key), cloneData(val)));
    } else if (ArrayBuffer.isView(v)) {
      out = v.slice();
      _cloneMemo.set(v, out);
    } else if (v instanceof ArrayBuffer) {
      out = v.slice(0);
      _cloneMemo.set(v, out);
    } else {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return undefined;
      out = {};
      _cloneMemo.set(v, out);
      const keys = Object.keys(v);
      for (let i = 0; i < keys.length; i++) {
        const c = cloneData(v[keys[i]]);
        if (c !== undefined) out[keys[i]] = c;
      }
    }
    return out;
  }

  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      // Typed array views cannot be frozen once they have elements
      // (Object.freeze throws); their clone is already detached via slice().
      if (ArrayBuffer.isView(o)) return o;
      Object.freeze(o);
      if (o instanceof Set || o instanceof Map) {
        o.forEach(deepFreeze);
      } else {
        Object.values(o).forEach(deepFreeze);
      }
    }
    return o;
  }

  // Rebuild the frame field-by-field (audioInterface.sanitizeCommand pattern):
  // every value is cloned to detached data, functions are dropped, and the
  // known scalar fields are coerced.
  function sanitizeFrame(frameDTO) {
    if (!frameDTO || typeof frameDTO !== "object") return null;
    const out = {};
    const keys = Object.keys(frameDTO);
    for (let i = 0; i < keys.length; i++) {
      const v = cloneData(frameDTO[keys[i]]);
      if (v !== undefined) out[keys[i]] = v;
    }
    out.GRID_SIZE = Number(out.GRID_SIZE) || 0;
    out.SPAWN_RADIUS = Number(out.SPAWN_RADIUS) || 0;
    out.MAX_AP = Number(out.MAX_AP) || 0;
    out.now = Number(out.now) || 0;
    out.theme = typeof out.theme === "string" ? out.theme : "default";
    out.cursor = typeof out.cursor === "string" ? out.cursor : "";
    out.skipBoard = Boolean(out.skipBoard);
    out.battleOnly = Boolean(out.battleOnly);
    out.minimapOnly = Boolean(out.minimapOnly);
    return deepFreeze(out);
  }

  // Same rebuild on the one-time static config payload.
  function sanitizeStaticConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return null;
    const out = {};
    const keys = Object.keys(cfg);
    for (let i = 0; i < keys.length; i++) {
      const v = cloneData(cfg[keys[i]]);
      if (v !== undefined) out[keys[i]] = v;
    }
    out.gridSize = Number(out.gridSize) || 0;
    out.spawnRadius = Number(out.spawnRadius) || 0;
    out.maxAp = Number(out.maxAp) || 0;
    return deepFreeze(out);
  }

  function create() {
    let _staticConfig = null;
    let _latestFrame = null;

    const producer = Object.freeze({
      publishStaticConfig(cfg) {
        _staticConfig = sanitizeStaticConfig(cfg);
      },
      publishFrame(frameDTO) {
        _latestFrame = sanitizeFrame(frameDTO);
      }
    });

    const consumer = Object.freeze({
      getStaticConfig() {
        return _staticConfig;
      },
      readFrame() {
        return _latestFrame;
      }
    });

    return Object.freeze({ producer, consumer });
  }

  return Object.freeze({ create });
})();
