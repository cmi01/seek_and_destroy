"use strict";

// ============================================================
// buildMarketState.js — job: build the seeded market state from the frozen
// trade table and the rules roster.
// Owner: economy.js (pure). Holds no state.
//
// M4 (roadmap-design §5.4): the market state is the self-contained economy
// input the pure price/trade/wage children read — the trade table's rates
// plus one wares row per trade good, hull and weapon, and the per-location
// price multipliers that trading moves. Built once at campaign init (and
// for pre-M4 saves) and persisted in campaign.market.
//
// MarketState (plain data):
//   { seed, spread, wagePerCrewMonth, repairPartsPerHp, refitPartsPerSwap,
//     lots, wares: { [goodKey]: { kind, priceBase, priceFloor, priceCap, … } },
//     prices: {} }
// goodKey: the commodity name ("goods"/"fuel"/"crew"/"parts"), "hull:<Hull>"
// or "weapon:<Name>" (DESIGN §4.6 station wares). Hull rows carry the roster
// fields a purchased hull is created from (hp/crew/defaultLoadout).
// ============================================================

const buildMarketState = function (trade, shipSpecs){
  const t = trade || {};
  const specs = shipSpecs || {};
  const wares = {};

  const goods = t.goods || {};
  Object.keys(goods).forEach(function (name){
    // NB: the local is `row`, not `g` — reference_audit §1.5 reads `g.x =`
    // as a load-registrar global write, and `g.base === "number"` trips it.
    const row = goods[name] || {};
    wares[name] = {
      kind: "commodity",
      priceBase: (typeof row.base === "number") ? row.base : 0,
      priceFloor: (typeof row.min === "number") ? row.min : 0,
      priceCap: (typeof row.max === "number") ? row.max : Number.MAX_SAFE_INTEGER
    };
  });

  const weaponPrices = t.weaponPrices || {};
  Object.keys(weaponPrices).forEach(function (name){
    const p = weaponPrices[name];
    wares["weapon:" + name] = {
      kind: "weapon",
      name: name,
      priceBase: (typeof p === "number") ? p : 0,
      priceFloor: Math.round(p * 0.6),
      priceCap: Math.round(p * 1.5)
    };
  });

  Object.keys(specs).forEach(function (hull){
    const s = specs[hull] || {};
    if (!Array.isArray(s.flags) || s.flags.indexOf("buyable") === -1) return;
    const p = (typeof s.cost === "number") ? s.cost : 0;
    wares["hull:" + hull] = {
      kind: "hull",
      name: hull,
      priceBase: p,
      priceFloor: Math.round(p * 0.7),
      priceCap: Math.round(p * 1.4),
      hp: (typeof s.hp === "number") ? s.hp : 0,
      crew: (typeof s.crew === "number") ? s.crew : 0,
      defaultLoadout: Array.isArray(s.defaultLoadout) ? s.defaultLoadout.slice() : []
    };
  });

  return {
    seed: (typeof t.seed === "number") ? t.seed : 0,
    spread: (typeof t.spread === "number") ? t.spread : 0,
    wagePerCrewMonth: (typeof t.wagePerCrewMonth === "number") ? t.wagePerCrewMonth : 5,
    repairPartsPerHp: (typeof t.repairPartsPerHp === "number") ? t.repairPartsPerHp : 1,
    refitPartsPerSwap: (typeof t.refitPartsPerSwap === "number") ? t.refitPartsPerSwap : 1,
    lots: Object.assign({ goods: 10, fuel: 50, crew: 10, parts: 5 }, t.lots || {}),
    wares: wares,
    prices: {}
  };
};
