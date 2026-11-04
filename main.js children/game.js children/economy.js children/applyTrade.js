"use strict";

// ============================================================
// applyTrade.js — job: apply one priced trade to the campaign section and
// return the new section.
// Owner: economy.js (pure). Holds no state.
//
// M4 interface (roadmap-design §5.4): applyTrade(state, good, qty,
// location) → { state } — buying moves the local price; a buy-then-sell
// round-trip at one quote loses exactly the spread. `state` is the whole
// campaign section (wallet, cargo, fleet, map, market); `good` is a market
// goodKey ("goods"/"fuel"/"crew"/"parts", "hull:<Hull>", "weapon:<Name>");
// qty > 0 buys, qty < 0 sells |qty| at the executed unit quote handed in as
// the injected `deps.unit` ({ buy, sell } — optional trailing argument; the
// frozen four-argument spelling is the interface, the stem injects the
// posted price so this file never names a sibling). Illegal trades
// (funds/stock) yield { state: null } and the caller keeps the previous
// state.
//
// Effects inside the campaign section (all plain data, transforms return
// NEW state): wallet moves; commodities move cargo (fuel mirrors the map
// tank, hired crew fill under-crewed hulls flagship-first per Q1 with the
// remainder to cargo.crew); hulls add/remove roster entries; weapons move
// cargo.weapons; trading nudges the location's price multiplier for the
// NEXT quote.
// ============================================================

const applyTrade = function (state, good, qty, location, deps){
  if (!state || typeof state !== "object") return { state: null };
  const n = Math.trunc(Number(qty));
  if (!n || !isFinite(n)) return { state: null };
  const d = deps || {};
  const unit = d.unit || null;
  if (!unit || !(unit.buy > 0)) return { state: null };

  const market = state.market || {};
  const wares = market.wares || {};
  const w = wares[good] ? wares[good] : null;
  if (!w) return { state: null };
  const buying = n > 0;
  const amount = Math.abs(n);
  const wallet = (typeof state.wallet === "number") ? state.wallet : 0;
  const cost = amount * (buying ? unit.buy : unit.sell);
  if (buying && wallet < cost) return { state: null };

  const fleet = (Array.isArray(state.fleet) ? state.fleet : []).map(function (e){
    return Object.assign({}, e, {
      loadout: Array.isArray(e.loadout) ? e.loadout.slice() : []
    });
  });
  const prevCargo = state.cargo || {};
  const cargo = {
    goods: prevCargo.goods || 0,
    fuel: prevCargo.fuel || 0,
    crew: prevCargo.crew || 0,
    parts: prevCargo.parts || 0,
    weapons: Object.assign({}, prevCargo.weapons || {})
  };
  let map = state.map || null;

  if (w.kind === "commodity"){
    const held = cargo[good] || 0;
    if (!buying && held < amount) return { state: null };
    if (good === "crew" && buying){
      // Hired crew board under-crewed hulls flagship-first (Q1); the
      // remainder waits in the cargo pool.
      let pool = amount;
      const order = [];
      for (let i = 0; i < fleet.length; i++){
        if (String(fleet[i].hull || "").indexOf("Flagship") !== -1 || fleet[i].flagship === true) order.unshift(i);
        else order.push(i);
      }
      for (let o = 0; o < order.length && pool > 0; o++){
        const e = fleet[order[o]];
        const spec = wares["hull:" + e.hull] || {};
        const max = (typeof e.maxCrew === "number") ? e.maxCrew : ((typeof spec.crew === "number") ? spec.crew : e.crew || 0);
        const need = Math.max(0, max - (e.crew || 0));
        const fill = Math.min(need, pool);
        if (fill > 0){
          fleet[order[o]] = Object.assign({}, e, { crew: (e.crew || 0) + fill, maxCrew: max });
          pool -= fill;
        }
      }
      cargo.crew = (cargo.crew || 0) + pool;
    } else {
      cargo[good] = held + n;
    }
    if (good === "fuel" && map && Array.isArray(map.fleets)){
      // The map tank IS the fleet's fuel: mirror the purchase onto it.
      map = Object.assign({}, map, {
        fleets: map.fleets.map(function (f){
          return f.faction === "player"
            ? Object.assign({}, f, { fuel: (typeof f.fuel === "number" ? f.fuel : 0) + n })
            : f;
        })
      });
    }
  } else if (w.kind === "hull"){
    if (buying){
      for (let i = 0; i < amount; i++){
        fleet.push({
          hull: w.name,
          loadout: (w.defaultLoadout || []).slice(),
          hp: w.hp,
          maxHp: w.hp,
          crew: w.crew,
          maxCrew: w.crew
        });
      }
    } else {
      // Selling hulls releases crewed hulls from the roster; the flagship
      // is the permadeath locus and is never sold.
      for (let i = 0; i < amount; i++){
        let idx = -1;
        for (let j = fleet.length - 1; j >= 0; j--){
          const e = fleet[j];
          if (e.hull === w.name && e.flagship !== true && String(e.hull || "").indexOf("Flagship") === -1){ idx = j; break; }
        }
        if (idx === -1) return { state: null };
        fleet.splice(idx, 1);
      }
    }
  } else if (w.kind === "weapon"){
    const held = cargo.weapons[w.name] || 0;
    if (!buying && held < amount) return { state: null };
    cargo.weapons[w.name] = held + (buying ? amount : -amount);
    if (cargo.weapons[w.name] <= 0) delete cargo.weapons[w.name];
  } else {
    return { state: null };
  }

  // Buying moves the local price: the location's multiplier nudges up on
  // buys and down on sells for the NEXT quote (the executed quote above was
  // the one handed in — the round-trip loses exactly its spread).
  const locId = (location && typeof location === "object")
    ? String(location.id || "")
    : String((location === undefined || location === null) ? "" : location);
  const prices = Object.assign({}, market.prices || {});
  const locPrices = Object.assign({}, prices[locId] || {});
  const prevMult = (typeof locPrices[good] === "number") ? locPrices[good] : 1;
  locPrices[good] = Math.max(0.5, Math.min(2, prevMult + 0.002 * n));
  prices[locId] = locPrices;

  return {
    state: Object.assign({}, state, {
      wallet: wallet + (buying ? -cost : cost),
      cargo: cargo,
      fleet: fleet,
      map: map,
      market: Object.assign({}, market, { prices: prices })
    })
  };
};
