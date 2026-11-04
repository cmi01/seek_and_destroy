"use strict";

// ============================================================
// initializeCampaignState.js — job: build the initial campaign state from the
// frozen starting package and the rules roster.
// Owner: campaignState.js (pure). Holds no state.
//
// M1 interface (roadmap-design §5.1): initializeCampaignState(campaignData)
// → CampaignState. The composer passes the rules roster table as a second
// read-only argument so this child stays data-driven without reaching out
// (compliance: children are stateless pure functions receiving data).
// Fleet hull names expand to RosterEntry records with each hull's default
// loadout and full HP/crew; reputation is keyed per faction pair, zeroed.
// M3: the map-state builder arrives as a third injected argument (a sibling
// transform — this file never names it); without one the map keeps its
// pre-map anchor shape. The map builder's output is the whole map section.
// M4: the seeded market builder arrives the same way as a fourth argument;
// without one the section simply carries no market (pre-M4 shape).
// ============================================================

const initializeCampaignState = function (campaignData, shipSpecs, buildMapFn, buildMarketFn, buildRepFn){
  const start = campaignData.start;
  const factions = campaignData.factions;

  // M6: the pair table comes from the injected builder when the composer
  // supplies one (player pairs seeded at their faction default alignment);
  // without one the section keeps the M1 shape (faction pairs at 0).
  let reputation = (typeof buildRepFn === "function") ? buildRepFn() : null;
  if (!reputation || typeof reputation !== "object"){
    reputation = {};
    for (let i = 0; i < factions.length; i++){
      for (let j = i + 1; j < factions.length; j++){
        reputation[factions[i] + "|" + factions[j]] = 0;
      }
    }
  }

  const fleet = start.startFleet.map(hull => {
    const spec = shipSpecs[hull];
    return {
      hull: hull,
      loadout: spec.defaultLoadout.slice(),
      hp: spec.hp,
      maxHp: spec.hp,
      crew: spec.crew,
      maxCrew: spec.crew
    };
  });

  return {
    fleet: fleet,
    wallet: start.wallet,
    cargo: {
      goods: start.cargo.goods,
      fuel: start.cargo.fuel,
      crew: start.cargo.crew,
      parts: start.cargo.parts,
      weapons: {}
    },
    reputation: reputation,
    // M6(d): contract progress (Q9) — accepted/done ids and the per-contract
    // event counters the targets count against.
    contracts: { active: [], done: [], progress: {}, campaignComplete: false },
    clock: { month: start.clock.month, year: start.clock.year },
    map: (typeof buildMapFn === "function")
      ? buildMapFn(campaignData, shipSpecs, null)
      : { locationId: start.map.locationId },
    market: (typeof buildMarketFn === "function")
      ? buildMarketFn(campaignData, shipSpecs)
      : null
  };
};
