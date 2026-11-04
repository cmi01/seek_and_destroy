"use strict";

// ============================================================
// applyStationService.js — job: apply one station service (repair or
// refit) to the campaign section and return the new section.
// Owner: campaignState.js (pure). Holds no state.
//
// M4 (roadmap-design §4.4, DESIGN §4.6): station services consume parts.
//   - repair: restore a hull to full HP; parts cost is proportional to the
//     HP restored (market.repairPartsPerHp parts per HP point).
//   - refit: return a hull's loadout to its hull's default loadout; parts
//     cost is charged per swapped weapon position
//     (market.refitPartsPerSwap parts per swap).
// applyStationService(state, service) → { state } | { state: null }.
// `state` is the whole campaign section (fleet, cargo carry the parts);
// the rates travel inside state.market (built from the frozen trade table
// the campaign data module ships — R9, rates never live in verb bodies).
// Illegal services
// (no damage, nothing to refit, not enough parts, bad index) yield
// { state: null } and the caller keeps the previous state.
// ============================================================

const applyStationService = function (state, service){
  if (!state || !service || typeof service !== "object") return { state: null };
  const idx = Number(service.ship);
  const fleet = Array.isArray(state.fleet) ? state.fleet : [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= fleet.length) return { state: null };
  const entry = fleet[idx];
  const market = state.market || {};
  const wares = market.wares || {};
  const hullRow = wares["hull:" + (entry.hull || entry.type)] || {};
  const prevCargo = state.cargo || {};
  const parts = prevCargo.parts || 0;

  function next(statePatch){
    const nextFleet = fleet.map(function (e, i){ return i === idx ? Object.assign({}, e, statePatch) : e; });
    return {
      state: Object.assign({}, state, {
        fleet: nextFleet,
        cargo: Object.assign({}, prevCargo, { parts: parts - cost })
      })
    };
  }

  let cost = 0;
  if (service.kind === "repair"){
    const maxHp = (typeof entry.maxHp === "number") ? entry.maxHp : (hullRow.hp || 0);
    const hp = (typeof entry.hp === "number") ? entry.hp : maxHp;
    const missing = Math.max(0, maxHp - hp);
    const perHp = (typeof market.repairPartsPerHp === "number") ? market.repairPartsPerHp : 1;
    cost = Math.round(missing * perHp);
    if (missing <= 0 || cost > parts) return { state: null };
    return next({ hp: maxHp });
  }

  if (service.kind === "refit"){
    const want = Array.isArray(hullRow.defaultLoadout) ? hullRow.defaultLoadout : [];
    const have = Array.isArray(entry.loadout) ? entry.loadout : [];
    const n = Math.max(want.length, have.length);
    let swaps = 0;
    for (let i = 0; i < n; i++){
      if ((want[i] || null) !== (have[i] || null)) swaps++;
    }
    const perSwap = (typeof market.refitPartsPerSwap === "number") ? market.refitPartsPerSwap : 1;
    cost = swaps * perSwap;
    if (swaps <= 0 || cost > parts) return { state: null };
    return next({ loadout: want.slice() });
  }

  return { state: null };
};
