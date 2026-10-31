"use strict";

// ============================================================
// gameState.js — job: operate the state store container passed in by its parent.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("gameState", DATA => {
  const TEMPLATE = DATA.initialState;
  const LIFETIMES = DATA.lifetimes;
  const MAP_PATHS = DATA.collections.maps;
  const SET_PATHS = DATA.collections.sets;
  const PERSISTENT_LIFETIMES = ["profile", "match", "ai", "camera"];

  const allowedKeys = new Set(Object.keys(TEMPLATE));

  // Sanity check: every template key belongs to exactly one lifetime.
  (() => {
    const seen = new Map();
    Object.keys(LIFETIMES).forEach(lt => LIFETIMES[lt].forEach(k => seen.set(k, (seen.get(k) || 0) + 1)));
    const problems = Object.keys(TEMPLATE).filter(k => seen.get(k) !== 1)
      .concat([...seen.keys()].filter(k => !allowedKeys.has(k)));
    if (problems.length) console.error("[S&D state] lifetime map mismatch for keys:", problems);
  })();

  function deepClone(v){
    if (Array.isArray(v)) return v.map(deepClone);
    if (v && typeof v === "object") {
      const o = {};
      Object.keys(v).forEach(k => { o[k] = deepClone(v[k]); });
      return o;
    }
    return v;
  }

  function getPath(obj, path){
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function setPath(obj, path, value){
    const parts = path.split(".");
    const last = parts.pop();
    const parent = parts.reduce((o, k) => o[k], obj);
    parent[last] = value;
  }

  // Template arrays -> runtime Map/Set for the declared collection fields.
  function materialize(raw){
    const out = deepClone(raw);
    MAP_PATHS.forEach(p => setPath(out, p, new Map(getPath(out, p) || [])));
    SET_PATHS.forEach(p => setPath(out, p, new Set(getPath(out, p) || [])));
    return out;
  }

  function isValidDelta(delta){
    if (!delta || typeof delta !== "object" || Array.isArray(delta)) return false;
    const keys = Object.keys(delta);
    if (keys.length === 0) return false;

    for (let i = 0; i < keys.length; i++){
      const k = keys[i];
      if (!allowedKeys.has(k)) return false;
      const v = delta[k];

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

  function InitializeGameState(stateBox, opts){
    const fresh = materialize(TEMPLATE);
    const preserve = (opts && Array.isArray(opts.preserve)) ? opts.preserve : [];
    if (stateBox.current){
      preserve.forEach(lt => (LIFETIMES[lt] || []).forEach(k => { fresh[k] = stateBox.current[k]; }));
      Object.assign(stateBox.current, fresh);
    } else {
      stateBox.current = fresh;
    }
    return stateBox.current;
  }

  function GetGameState(stateBox){
    if (!stateBox.current){
      InitializeGameState(stateBox);
    }
    return stateBox.current;
  }

  function TryPatchGameState(stateBox, delta){
    if (!stateBox.current){
      InitializeGameState(stateBox);
    }
    if (!isValidDelta(delta)) return false;
    Object.assign(stateBox.current, delta);
    return stateBox.current;
  }

  function GetStateLifetimes(){
    return deepClone(LIFETIMES);
  }

  // ---- Serialization (save/load, replays, debugging) -----------------------
  // Only the persistent lifetimes are written; input/runtime fields (timers,
  // hit boxes, caches, the live RNG closure) are rebuilt fresh on load.
  function toPlain(v){
    if (v instanceof Map) return { __map: Array.from(v.entries()).map(([k, val]) => [k, toPlain(val)]) };
    if (v instanceof Set) return { __set: Array.from(v.values()).map(toPlain) };
    if (Array.isArray(v)) return v.map(toPlain);
    if (v && typeof v === "object") {
      const o = {};
      Object.keys(v).forEach(k => { o[k] = toPlain(v[k]); });
      return o;
    }
    return typeof v === "function" ? undefined : v;
  }

  function fromPlain(v){
    if (Array.isArray(v)) return v.map(fromPlain);
    if (v && typeof v === "object") {
      if (Array.isArray(v.__map)) return new Map(v.__map.map(([k, val]) => [k, fromPlain(val)]));
      if (Array.isArray(v.__set)) return new Set(v.__set.map(fromPlain));
      const o = {};
      Object.keys(v).forEach(k => { o[k] = fromPlain(v[k]); });
      return o;
    }
    return v;
  }

  function SerializeGameState(stateBox){
    const st = GetGameState(stateBox);
    const out = { schema: DATA.schema, version: DATA.version, state: {} };
    PERSISTENT_LIFETIMES.forEach(lt => LIFETIMES[lt].forEach(k => {
      if (k === "rng") return; // live closure; restored from rngSeed
      out.state[k] = toPlain(st[k]);
    }));
    return out;
  }

  function DeserializeGameState(stateBox, data){
    if (!data || data.schema !== DATA.schema || !data.state) {
      console.error("[S&D state] DeserializeGameState: not a Seek & Destroy save.", data);
      return false;
    }
    InitializeGameState(stateBox);
    const restored = fromPlain(data.state);
    Object.keys(restored).forEach(k => { if (allowedKeys.has(k)) stateBox.current[k] = restored[k]; });
    return stateBox.current;
  }

  return {
    InitializeGameState, GetGameState, TryPatchGameState,
    GetStateLifetimes, SerializeGameState, DeserializeGameState
  };
});
