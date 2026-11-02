"use strict";

// ============================================================
// initializeGameState.js — job: reset the state container to a freshly materialized template.
// Owner: gameState.js (pure). Holds no state.
// ============================================================

const initializeGameState = function (DATA, stateBox, opts){
  const TEMPLATE = DATA.initialState;
  const LIFETIMES = DATA.lifetimes;
  const MAP_PATHS = DATA.collections.maps;
  const SET_PATHS = DATA.collections.sets;

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

  const fresh = materialize(TEMPLATE);
  const preserve = (opts && Array.isArray(opts.preserve)) ? opts.preserve : [];
  // An existing container is re-filled IN PLACE (identity is part of the
  // contract: the shell keeps one authoritative object and reads it live).
  if (stateBox.current){
    preserve.forEach(lt => (LIFETIMES[lt] || []).forEach(k => { fresh[k] = stateBox.current[k]; }));
    Object.assign(stateBox.current, fresh);
  } else {
    stateBox.current = fresh;
  }
  return stateBox.current;
};
