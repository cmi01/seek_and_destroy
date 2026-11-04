"use strict";

// ============================================================
// nearestOpenSquare.js — job: find the nearest open map square to a
// position, breaking ties at random with the injected rng.
// Owner: campaignMap.js (pure). Holds no state.
//
// M6 (DESIGN §4.4): when an interaction ends "the moving fleet is placed
// at random on one of the nearest open squares". Squares are integer map
// coordinates; a square is open when no OTHER fleet sits within 1 square
// of it. The search walks outward ring by ring and returns one of the
// first ring's open squares chosen by the injected rng (rng as data; a
// missing rng takes the first candidate).
// ============================================================
const nearestOpenSquare = function (mapState, from, rng){
  const m = mapState || {};
  const fleets = Array.isArray(m.fleets) ? m.fleets : [];
  const fx = Math.round(Number(from && from.x) || 0);
  const fy = Math.round(Number(from && from.y) || 0);
  const rnd = (typeof rng === "function") ? rng : null;

  function isOpen(x, y){
    for (let i = 0; i < fleets.length; i++){
      const f = fleets[i];
      if (!f || typeof f.x !== "number" || typeof f.y !== "number") continue;
      if (Math.abs(f.x - x) <= 1 && Math.abs(f.y - y) <= 1) return false;
    }
    return true;
  }

  for (let r = 0; r <= 8; r++){
    const ring = [];
    for (let dx = -r; dx <= r; dx++){
      for (let dy = -r; dy <= r; dy++){
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = fx + dx, y = fy + dy;
        if (x < 0 || y < 0 || x > 63 || y > 63) continue;
        if (isOpen(x, y)) ring.push({ x: x, y: y });
      }
    }
    if (ring.length > 0){
      return ring[rnd ? Math.floor(rnd() * ring.length) % ring.length : 0];
    }
  }
  return null;
};
// Loading convention: this file defines nearestOpenSquare at top level;
// the owner captures it after the boot list resolves.
