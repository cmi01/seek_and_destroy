"use strict";

// ============================================================
// composeFleet.js — job: compose one faction's fleet from its doctrine
// weights under a budget, deterministic in the injected rng.
// Owner: factions.js (pure). Holds no state.
//
// M6 interface (roadmap-design §5.6): composeFleet(factions, factionId,
// budget, rng) → ShipType[] — the frozen four-argument spelling is the
// interface and the stem injects the roster table as the optional
// trailing deps ({ specs }), so this file never names a sibling. `rng`
// is a seeded () → [0,1) stream passed as data (rng in — the whole draw
// sequence is a function of it).
//
// Shape: exactly one flagship (DESIGN §4.7 "each faction has exactly one
// flagship"), drawn from the faction's flagship weights, first in the
// returned list; the remaining budget fills non-flagship hulls drawn from
// the doctrine's tier weights over its composition tiers. Doctrine
// conformance is statistical, not hardcoded: the weights ARE the doctrine
// (e.g. Armoury's flagship pool is capital-hulled, so its fleets field a
// capital ship in every draw — the ≥90% acceptance bound).
// ============================================================
const composeFleet = function (factions, factionId, budget, rng, deps){
  if (!factions || typeof factions !== "object") return [];
  const row = factions[factionId];
  const d = deps || {};
  const specs = d.specs || null;
  const rnd = (typeof rng === "function") ? rng : null;
  if (!row || !specs || !rnd) return [];
  const doctrine = row.doctrine || {};
  const tiers = doctrine.composition || {};
  const tierWeights = doctrine.tierWeights || {};
  const flagWeights = doctrine.flagshipWeights || {};
  const total = Math.max(0, Math.trunc(Number(budget) || 0));

  function costOf(hull){
    const s = specs[hull];
    return (s && typeof s.cost === "number") ? s.cost : 0;
  }
  function isFlagship(hull){
    const s = specs[hull];
    return Boolean(s && Array.isArray(s.flags) && s.flags.indexOf("!flagship") !== -1);
  }
  function pickWeighted(pool, weights){
    let sum = 0;
    for (let i = 0; i < pool.length; i++) sum += (weights[pool[i]] > 0 ? weights[pool[i]] : 0);
    if (sum <= 0) return pool[Math.floor(rnd() * pool.length)];
    let r = rnd() * sum;
    for (let i = 0; i < pool.length; i++){
      r -= (weights[pool[i]] > 0 ? weights[pool[i]] : 0);
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // 1. The flagship: weighted among the doctrine's flagship pool, skipping
  //    rows that cannot be paid for out of the budget.
  let remaining = total;
  const ships = [];
  const flagPool = Object.keys(flagWeights).filter(function (h){
    return isFlagship(h) && costOf(h) > 0 && costOf(h) <= remaining;
  });
  if (flagPool.length === 0) return [];
  const flagship = pickWeighted(flagPool, flagWeights);
  ships.push(flagship);
  remaining -= costOf(flagship);

  // 2. Fills: tier draw then hull draw inside the tier, bounded by budget
  //    and a draw guard. Non-flagship hulls only (one flagship per fleet).
  const tierNames = Object.keys(tierWeights);
  let guard = 64;
  while (guard-- > 0 && ships.length < 32){
    const tier = pickWeighted(tierNames, tierWeights);
    const pool = (Array.isArray(tiers[tier]) ? tiers[tier] : []).filter(function (h){
      return !isFlagship(h) && costOf(h) > 0 && costOf(h) <= remaining;
    });
    if (pool.length === 0) break;
    const hull = pool[Math.floor(rnd() * pool.length)];
    ships.push(hull);
    remaining -= costOf(hull);
    if (remaining < 500) break; // cheapest hull on the roster
  }
  return ships;
};
// Loading convention: this file defines composeFleet at top level; the
// owner captures it after the boot list resolves.
