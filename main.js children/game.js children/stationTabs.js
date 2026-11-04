"use strict";

// ============================================================
// stationTabs.js — job: the mode-scoped tab list plus the resolved active tab (stationTabs).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const stationTabs = function (p){
  // The active tab is mode-scoped; fall back to each mode's first tab.
  let tab = p.tab;
  if (p.mode === "merchant"){
    if (tab !== "provisions" && tab !== "sell") tab = "provisions";
  } else {
    if (["commodities", "hulls", "weapons", "services", "outfit", "missions"].indexOf(tab) === -1) tab = "commodities";
  }

  const tabs = (p.mode === "merchant")
    ? [
        { id: "provisions", label: "PROVISIONS", active: tab === "provisions" },
        { id: "sell", label: "SELL", active: tab === "sell" }
      ]
    : [
        { id: "commodities", label: "GOODS", active: tab === "commodities" },
        { id: "hulls", label: "HULLS", active: tab === "hulls" },
        { id: "weapons", label: "WEAPONS", active: tab === "weapons" },
        { id: "services", label: "SERVICE", active: tab === "services" },
        { id: "outfit", label: "OUTFIT", active: tab === "outfit" },
        { id: "missions", label: "MISSIONS", active: tab === "missions" }
      ];

  return { tab: tab, tabs: tabs };
};
