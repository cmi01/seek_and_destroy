"use strict";

// ============================================================
// initializeCampaignState.js — job: build the initial campaign state from the
// frozen starting package in campaign_DATA.js and the rules roster.
// Owner: campaignState.js (pure). Holds no state.
//
// M1 interface (roadmap-design §5.1): initializeCampaignState(campaignData)
// → CampaignState. The composer passes the rules shipSpecs table as a second
// read-only argument so this child stays data-driven without importing
// anything (compliance: children are stateless pure functions receiving data).
// Fleet hull names expand to RosterEntry records with each hull's default
// loadout and full HP/crew; reputation is keyed per faction pair, zeroed.
// ============================================================

const initializeCampaignState = function (campaignData, shipSpecs){
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
    map: { locationId: start.map.locationId }
  };
};
