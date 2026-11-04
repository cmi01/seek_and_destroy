"use strict";

// ============================================================
// buildMapHudExtra.js — job: the map-HUD extra block: wallet, month, year, station caption (buildMapHudExtra).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const buildMapHudExtra = function (p){
  const c = p.campaign;
  const dock = p.dock;
  const merchant = p.merchant;
  const clock = (c && c.clock) || {};
  return {
    wallet: (typeof c.wallet === "number") ? c.wallet : 0,
    month: clock.month || 1,
    year: clock.year || 2401,
    station: (dock || merchant)
      ? { name: merchant ? "MERCHANT FLEET" : String(dock.name || "STATION"), merchant: Boolean(merchant) }
      : null
  };
};
