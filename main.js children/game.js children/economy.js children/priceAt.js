"use strict";

// ============================================================
// priceAt.js — job: compute the seeded mid price of one ware at one
// location and time.
// Owner: economy.js (pure). Holds no state.
//
// M4 interface (roadmap-design §5.4): priceAt(marketState, good, location,
// time) → number. Deterministic seeded base × per-system variation ×
// drift, moved by the location's trade multiplier and bounds-clamped —
// same seed ⇒ identical price table. `location` is a location id string or
// a { id } row; `time` is the map turn (drift changes per 20-turn season).
// The buy/sell spread is applied one level up (the stem's quote).
// ============================================================

const priceAt = function (marketState, good, location, time){
  // Deterministic 32-bit hash → [0, 1) (FNV-1a over the key string): no RNG
  // state, no Math.random — seeded purity (rng-in/rng-out is for generators).
  function hash01(str){
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h / 4294967296;
  }

  const m = marketState || {};
  const w = (m.wares && m.wares[good]) ? m.wares[good] : null;
  if (!w) return 0;
  const locId = (location && typeof location === "object")
    ? String(location.id || "")
    : String((location === undefined || location === null) ? "" : location);
  const seed = (typeof m.seed === "number") ? m.seed : 0;

  // Per-system variation: stable per (seed, location, good).
  const variation = 0.85 + 0.30 * hash01(seed + "|v|" + locId + "|" + good);
  // Drift: a slow deterministic seasonal wobble keyed on the map turn.
  const turn = (typeof time === "number" && isFinite(time)) ? time : 1;
  const season = Math.floor(Math.max(0, turn - 1) / 20);
  const drift = 0.95 + 0.10 * hash01(seed + "|d|" + good + "|" + season);
  // Local multiplier: moved by trades at that location (1 until traded).
  const local = (m.prices && m.prices[locId] && typeof m.prices[locId][good] === "number")
    ? m.prices[locId][good]
    : 1;

  const p = Math.round(w.priceBase * variation * drift * local);
  return Math.max(w.priceFloor, Math.min(w.priceCap, p));
};
