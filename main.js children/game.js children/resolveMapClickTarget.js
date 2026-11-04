"use strict";

// ============================================================
// resolveMapClickTarget.js — job: map-screen pixel to jump-target or travel destination (resolveMapClickTarget).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const resolveMapClickTarget = function (p){
  const map = p.map;
  const span = 64;
  const mx = p.px * span / p.ds;
  const my = p.py * span / p.ds;
  let target = null;
  const locs = Array.isArray(map.locations) ? map.locations : [];
  for (let i = 0; i < locs.length; i++){
    const L = locs[i];
    const dx = mx - L.x;
    const dy = my - L.y;
    const w = (typeof L.well === "number") ? L.well : 6;
    if (dx * dx + dy * dy <= w * w){ target = L; break; }
  }
  const pf = (map.fleets || []).find(function (f){ return f.faction === "player"; });
  const inWell = pf ? locs.find(function (L){
    const dx = pf.x - L.x;
    const dy = pf.y - L.y;
    const w = (typeof L.well === "number") ? L.well : 6;
    return dx * dx + dy * dy <= w * w;
  }) : null;
  if (target && inWell && target.id !== inWell.id){
    return { jumpToId: target.id, moveTo: null };
  }
  return { jumpToId: null, moveTo: target ? { x: target.x, y: target.y } : { x: mx, y: my } };
};
