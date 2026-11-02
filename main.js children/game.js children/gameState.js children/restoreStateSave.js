"use strict";

// ============================================================
// restoreStateSave.js — job: restore a save payload's persisted keys onto a freshly reset container.
// Owner: gameState.js (pure). Holds no state.
// ============================================================

// The composer validates the payload and resets the container before this
// runs; here only the restored, template-known keys land.
const restoreStateSave = function (DATA, stateBox, data){
  const allowedKeys = new Set(Object.keys(DATA.initialState));

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

  const restored = fromPlain(data.state);
  Object.keys(restored).forEach(k => { if (allowedKeys.has(k)) stateBox.current[k] = restored[k]; });
  return stateBox.current;
};
