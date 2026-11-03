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
// ============================================================

const initializeCampaignState = function (campaignData, shipSpecs, buildMapFn){
  const start = campaignData.start;
  const factions = campaignData.factions;

  const reputation = {};
  for (let i = 0; i < factions.length; i++){
    for (let j = i + 1; j < factions.length; j++){
      reputation[factions[i] + "|" + factions[j]] = 0;
    }
  }

  const fleet = start.startFleet.map(hull => {
    const spec = shipSpecs[hull];
    return {
      hull: hull,
      loadout: spec.defaultLoadout.slice(),
      hp: spec.hp,
      maxHp: spec.hp,
      crew: spec.crew
    };
  });

  return {
    fleet: fleet,
    wallet: start.wallet,
    cargo: {
      goods: start.cargo.goods,
      fuel: start.cargo.fuel,
      crew: start.cargo.crew,
      parts: start.cargo.parts
    },
    reputation: reputation,
    clock: { month: start.clock.month, year: start.clock.year },
    map: (typeof buildMapFn === "function")
      ? buildMapFn(campaignData, shipSpecs, null)
      : { locationId: start.map.locationId }
  };
};
