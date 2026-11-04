"use strict";

// ============================================================
// merchantQuote.js — job: merchant buy/sell prices from a mid price and the offer multipliers (merchantQuote).
// Owner: game.js (pure child). Holds no state.
// ============================================================
// M4 merchant quoting: the M3 offer's multipliers over the same seeded mid
// price the station quotes — buy (player purchases) inflated, sell (player
// sells) discounted. Plain data, computed where the trade executes so the
// posted price is the price paid.
const merchantQuote = function (p){
  const mid = p.mid;
  const offer = p.offer;
  const buyMult = (offer && typeof offer.buyMultiplier === "number") ? offer.buyMultiplier : 1.3;
  const sellMult = (offer && typeof offer.sellMultiplier === "number") ? offer.sellMultiplier : 0.7;
  return { buy: Math.round(mid * buyMult), sell: Math.round(mid * sellMult) };
};
