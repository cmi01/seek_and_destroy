"use strict";

// ============================================================
// fuelCost.js — job: compute the fuel-unit cost of one map move.
// Owner: campaignMap.js (pure). Holds no state.
//
// M3 interface (roadmap-design §5.3): fuelCost(fleet, distance, space) →
// number. Consumption is ships × distance × 1 unit per ship per distance
// unit (each unit priced at 5 ⒸB by the map table's fuelUnitPrice — the
// pump price is the merchant side, not part of this formula); hyperspace
// costs ×3 (Q5). The multiplier travels in as an optional injected value so
// tuning stays in data while the frozen three-argument spelling works.
// ============================================================

const fuelCost = function (fleet, distance, space, mult){
  const ships = (fleet && Array.isArray(fleet.ships)) ? fleet.ships.length : 0;
  const d = (typeof distance === "number" && distance > 0 && isFinite(distance)) ? distance : 0;
  const m = (typeof mult === "number" && mult > 0) ? mult : 3;
  return ships * d * (space === "hyperspace" ? m : 1);
};
