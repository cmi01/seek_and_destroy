"use strict";

// ============================================================
// merchantOffer.js — job: build the placeholder merchant-fleet offer for a
// blocked fleet.
// Owner: campaignMap.js (pure). Holds no state.
//
// M3 interface (roadmap-design §5.3): merchantOffer(mapState, fleetId) →
// Offer, "sell discounted / provision inflated". The service wiring (real
// prices, station UI) completes in M4 — this is the placeholder offer model
// the move-rejection event carries: anything the player sells fetches the
// sell multiplier, anything bought (crew/fuel inflated) pays the buy
// multiplier. The reason travels in as an optional injected string so the
// frozen two-argument spelling keeps working.
// ============================================================

const merchantOffer = function (mapState, fleetId, reason){
  const rules = (mapState && mapState.rules) ? mapState.rules : {};
  const unitPrice = (typeof rules.fuelUnitPrice === "number") ? rules.fuelUnitPrice : 5;
  return {
    kind: "merchant",
    fleetId: (fleetId === undefined) ? null : fleetId,
    reason: (typeof reason === "string") ? reason : null,
    sellMultiplier: 0.7,
    buyMultiplier: 1.3,
    wares: ["goods", "fuel", "crew", "parts"],
    // Internal money scale (×100, DESIGN §4.5): 5 ⒸB per fuel unit.
    fuelUnitPrice: unitPrice * 100,
    note: "Merchant fleet: sells goods discounted, provisions crew and fuel inflated. Full service wiring arrives with the station economy."
  };
};
