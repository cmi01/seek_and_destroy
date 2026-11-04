"use strict";

// ============================================================
// buildMerchantWareRows.js — job: row models for the merchant provisions/sell tabs (buildMerchantWareRows).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const buildMerchantWareRows = function (p){
  const wares = p.wares || {};
  const lots = p.lots || {};
  const cargo = p.cargo || {};
  const fleet = p.fleet || [];
  const wallet = p.wallet;
  const tab = p.tab;
  const keys = p.keys || [];
  const rows = [];
  for (let i = 0; i < keys.length; i++){
    const key = keys[i];
    const w = wares[key];
    if (!w) continue;
    const unit = p.quotes[key];
    const lot = (w.kind === "commodity") ? (lots[key] || 1) : 1;
    let held = 0;
    if (w.kind === "commodity") held = cargo[key] || 0;
    else if (w.kind === "weapon") held = (cargo.weapons && cargo.weapons[w.name]) || 0;
    else { for (let j = 0; j < fleet.length; j++){ if (fleet[j].hull === w.name) held++; } }
    rows.push({
      id: key,
      kind: "ware",
      label: String(w.name || key).toUpperCase(),
      sub: (w.kind === "commodity") ? ("LOT " + lot) : "",
      priceText: "BUY " + unit.buy + " / SELL " + unit.sell,
      ownedText: "HELD " + held,
      buyLabel: w.kind === "commodity" ? ("BUY " + lot) : "BUY",
      sellLabel: w.kind === "commodity" ? ("SELL " + lot) : "SELL",
      canBuy: tab === "provisions" && wallet >= unit.buy * lot,
      canSell: tab === "sell" && held >= lot
    });
  }
  return rows;
};
