"use strict";

// ============================================================
// hitTestCanvasButton.js — job: find the first canvas button containing a point (hitTestCanvasButton).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const hitTestCanvasButton = function (p){
  // Mirrors the historical containment predicate exactly (2-line rect test).
  function containsPoint(px, py, r){
    return Boolean(r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
  }
  const btns = Array.isArray(p.buttons) ? p.buttons : [];
  for (let i = 0; i < btns.length; i++){
    const b = btns[i];
    if (containsPoint(p.px, p.py, b)) return b;
  }
  return null;
};
