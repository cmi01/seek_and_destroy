"use strict";

// ============================================================
// stationWareKeys.js — job: the ware keys a station/merchant tab lists (stationWareKeys).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const stationWareKeys = function (p){
  const wares = p.wares || {};
  const tab = p.tab;
  if (p.kindForTab == null){
    // Merchant storefront: everything on the sell tab, the two provision
    // wares on the provisions tab.
    const sellKeys = Object.keys(wares).filter(function (k){
      return tab === "sell" ? true : false;
    });
    return (tab === "provisions") ? ["crew", "fuel"] : sellKeys;
  }
  return Object.keys(wares).filter(function (k){ return wares[k].kind === p.kindForTab; });
};
