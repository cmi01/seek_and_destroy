"use strict";

// ============================================================
// buildServiceRows.js — job: per-ship repair/refit rows with costs and affordability (buildServiceRows).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const buildServiceRows = function (p){
  const fleet = p.fleet || [];
  const wares = p.wares || {};
  const market = p.market || null;
  const cargo = p.cargo || {};
  const rows = [];
  for (let i = 0; i < fleet.length; i++){
    const e = fleet[i];
    const hullRow = wares["hull:" + (e.hull || e.type)] || {};
    const maxHp = (typeof e.maxHp === "number") ? e.maxHp : (hullRow.hp || 0);
    const hp = (typeof e.hp === "number") ? e.hp : maxHp;
    const missing = Math.max(0, maxHp - hp);
    const perHp = (market && typeof market.repairPartsPerHp === "number") ? market.repairPartsPerHp : 1;
    const repairCost = Math.round(missing * perHp);
    const want = Array.isArray(hullRow.defaultLoadout) ? hullRow.defaultLoadout : [];
    const have = Array.isArray(e.loadout) ? e.loadout : [];
    const n = Math.max(want.length, have.length);
    let swaps = 0;
    for (let j = 0; j < n; j++){ if ((want[j] || null) !== (have[j] || null)) swaps++; }
    const perSwap = (market && typeof market.refitPartsPerSwap === "number") ? market.refitPartsPerSwap : 1;
    const refitCost = swaps * perSwap;
    rows.push({
      id: String(i),
      kind: "service",
      label: String(e.hull || e.type || "?"),
      sub: "HP " + hp + "/" + maxHp + " CREW " + (e.crew || 0) + "/" + (e.maxCrew || 0),
      priceText: "REPAIR " + repairCost + "P / REFIT " + refitCost + "P",
      ownedText: "",
      canRepair: missing > 0 && (cargo.parts || 0) >= repairCost,
      canRefit: swaps > 0 && (cargo.parts || 0) >= refitCost
    });
  }
  return rows;
};
