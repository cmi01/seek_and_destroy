"use strict";

// ============================================================
// buildStationHeader.js — job: storefront header fields: open/mode/title/subtitle/walletText/note (buildStationHeader).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const buildStationHeader = function (p){
  const dock = p.dock;
  const merchant = p.merchant;
  const wallet = p.wallet;
  const cargo = p.cargo || {};
  return {
    open: Boolean(dock) || Boolean(merchant),
    mode: merchant ? "merchant" : "station",
    title: merchant ? "MERCHANT FLEET" : (dock ? String(dock.name || "STATION") : "STATION"),
    subtitle: merchant
      ? ("PROVISIONS INFLATED — SALE AT A DISCOUNT" + (merchant.reason ? " (" + String(merchant.reason).toUpperCase() + ")" : ""))
      : (dock ? "STATION SERVICES — POSTED PRICES" : "NO STATION IN RANGE"),
    walletText: "WALLET " + wallet + " ⒸB   PARTS " + (cargo.parts || 0) + "   FUEL " + (cargo.fuel || 0),
    note: merchant
      ? "The caravan provisions crew and fuel at a premium and buys anything at a discount. Rescue your fleet, then move on."
      : "Posted prices: the trade executes at the quoted price; trading moves local prices for future quotes."
  };
};
