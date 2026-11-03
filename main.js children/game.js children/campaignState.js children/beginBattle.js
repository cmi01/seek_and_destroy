"use strict";

// ============================================================
// beginBattle.js — job: open a battle from a campaign section and an
// encounter, producing the only battle-setup DTO the rest of the game sees.
// Owner: campaignState.js (pure). Holds no state.
//
// M2 interface (roadmap-design §5.2): beginBattle(section, encounter) →
// BattleSetup. The composer injects the deployment splitter so this child
// never names a sibling file. Opponent force is taken from the encounter
// (campaign entities), not invented here.
// ============================================================
const beginBattle = function (section, encounter, deployFn){
  const fleet = (section && Array.isArray(section.fleet)) ? section.fleet : [];
  const enc = encounter || {};
  const cap = (enc.capacity !== undefined && enc.capacity !== null) ? enc.capacity : fleet.length;
  const split = (typeof deployFn === "function")
    ? deployFn(fleet, cap, enc.choice)
    : { deployed: fleet.slice(0, cap), overflow: fleet.slice(cap) };
  const playerFaction = enc.playerFaction || "player";
  const opponentFaction = enc.opponentFaction || "syndicate";
  const opponent = Array.isArray(enc.opponent) ? enc.opponent.slice() : [];
  return {
    factions: [playerFaction, opponentFaction],
    deployments: [
      { faction: playerFaction, units: split.deployed },
      { faction: opponentFaction, units: opponent }
    ],
    overflow: split.overflow,
    seed: (typeof enc.seed === "number") ? enc.seed : 0
  };
};
