"use strict";

// ============================================================
// gameState.js — job: compose the state-store handle over its per-operation children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const gameState = function (DATA){
  const TEMPLATE = DATA.initialState;
  const LIFETIMES = DATA.lifetimes;
  const allowedKeys = new Set(Object.keys(TEMPLATE));

  // Load-time integrity diagnostic (carried over verbatim): every template key
  // belongs to exactly one lifetime, and no lifetime names an unknown key.
  (() => {
    const seen = new Map();
    Object.keys(LIFETIMES).forEach(lt => LIFETIMES[lt].forEach(k => seen.set(k, (seen.get(k) || 0) + 1)));
    const problems = Object.keys(TEMPLATE).filter(k => seen.get(k) !== 1)
      .concat([...seen.keys()].filter(k => !allowedKeys.has(k)));
    if (problems.length) console.error("[S&D state] lifetime map mismatch for keys:", problems);
  })();

  // Private: the container is initialized on first use. Reads and patches
  // never see an empty box, exactly as before the split.
  function ensure(box){
    if (!box.current) initializeGameState(DATA, box);
    return box;
  }

  function isSaveData(data){
    return !!(data && data.schema === DATA.schema && data.state);
  }

  return {
    InitializeGameState(box, opts){ return initializeGameState(DATA, box, opts); },
    GetGameState(box){ return getGameState(ensure(box)); },
    TryPatchGameState(box, delta){ return tryPatchGameState(DATA, ensure(box), delta); },
    GetStateLifetimes(){ return getStateLifetimes(DATA); },
    SerializeGameState(box){ return buildStateSave(DATA, ensure(box)); },
    DeserializeGameState(box, data){
      if (!isSaveData(data)) {
        console.error("[S&D state] DeserializeGameState: not a Seek & Destroy save.", data);
        return false;
      }
      initializeGameState(DATA, box);   // reset in place, then restore
      return restoreStateSave(DATA, box, data);
    }
  };
};
