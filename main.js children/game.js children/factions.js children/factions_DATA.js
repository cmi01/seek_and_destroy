"use strict";

// ============================================================
// factions_DATA.js — job: return the faction table (M6, DESIGN §4.7).
// Owner: factions.js. Holds no state unless it is a core.
//
// Five factions over the shared ship/weapon pool. Personality is DATA
// only (roadmap-design §4.6 boundary): doctrine weights decide fleet
// composition and the AI profile, theme keys name the visual identity
// (hull ramp + hull-stripe colours live in the theme table under that
// key), voice banks land with the dialogue model. No code anywhere may
// branch on a faction id.
//
// defaultAlignment: DESIGN §4.7 states only Syndicate's (−20). The other
// four sit at 20 — the neutral quintile's lower edge on the Q10 band map
// — pending design confirmation (open question, see the M6 handoff).
//
// doctrine.profile names the AI weight profile the battle adopts for
// this faction's fleets; doctrine.scorerWeights are multiplier overlays
// the threat scorer folds over that profile's weights.
// ============================================================
const factionsDataPayload = {
  version: "M6-1.0",
  schema: "seek-and-destroy.faction-data",
  factions: {
    "Syndicate": {
      name: "Syndicate",
      defaultAlignment: -20,
      theme: "syndicate",
      doctrine: {
        tactic: "rush",
        profile: "AGGRESSIVE_SWARM",
        flagshipWeights: { "Attack Frigate Flagship": 7, "Flagship Battlecruiser": 1 },
        tierWeights: { common: 0.7, uncommon: 0.25, rare: 0.05 },
        composition: {
          common: ["Fighter", "Bomber", "Attack Destroyer"],
          uncommon: ["Missile Destroyer", "Light Cruiser"],
          rare: ["Attack Frigate", "Railgun Destroyer", "Missile Frigate", "Shuttle", "Boarding APC", "Probe"]
        },
        scorerWeights: { aggression: 1.15, screen: 0.85, standoff: 0.8 }
      }
    },
    "Capital": {
      name: "Capital",
      defaultAlignment: 20,
      theme: "capital",
      doctrine: {
        tactic: "optimal",
        profile: "OPTIMAL_LINE",
        flagshipWeights: {
          "Attack Frigate Flagship": 1,
          "Light Cruiser Flagship": 1,
          "Flagship Battlecruiser": 1,
          "Dreadnought Flagship": 1
        },
        tierWeights: { common: 0.6, uncommon: 0.32, rare: 0.08 },
        composition: {
          common: ["Railgun Destroyer", "Railgun Cruiser", "Heavy Cruiser", "Light Cruiser", "Missile Cruiser"],
          uncommon: ["Attack Destroyer", "Missile Destroyer", "Attack Frigate", "Missile Frigate", "Battlecruiser", "Missile Battleship", "Battleship"],
          rare: ["Fighter", "Bomber", "Probe", "Dreadnought", "Shuttle", "Boarding APC"]
        },
        scorerWeights: { aggression: 1.0, screen: 1.15, standoff: 1.1 }
      }
    },
    "Freehold": {
      name: "Freehold",
      defaultAlignment: 20,
      theme: "freehold",
      doctrine: {
        tactic: "missile",
        profile: "ARTILLERY_SCREEN",
        flagshipWeights: { "Flagship Battlecruiser": 5, "Light Cruiser Flagship": 3, "Dreadnought Flagship": 1 },
        tierWeights: { common: 0.62, uncommon: 0.28, rare: 0.1 },
        composition: {
          common: ["Missile Frigate", "Missile Destroyer", "Missile Cruiser"],
          uncommon: ["Missile Battleship", "Attack Destroyer", "Light Cruiser"],
          rare: ["Bomber", "Fighter", "Attack Frigate", "Heavy Cruiser", "Probe", "Shuttle"]
        },
        scorerWeights: { aggression: 0.9, screen: 1.1, standoff: 1.35 }
      }
    },
    "Armoury": {
      name: "Armoury",
      defaultAlignment: 20,
      theme: "armoury",
      doctrine: {
        tactic: "capital",
        profile: "APEX_ARMADA",
        flagshipWeights: { "Dreadnought Flagship": 9, "Flagship Battlecruiser": 1 },
        tierWeights: { common: 0.55, uncommon: 0.3, rare: 0.15 },
        composition: {
          common: ["Battleship", "Dreadnought", "Probe"],
          uncommon: ["Missile Battleship", "Railgun Cruiser", "Heavy Cruiser"],
          rare: ["Battlecruiser", "Light Cruiser", "Bomber"]
        },
        scorerWeights: { aggression: 1.1, screen: 1.25, standoff: 1.0 }
      }
    },
    "Fringe": {
      name: "Fringe",
      defaultAlignment: 20,
      theme: "fringe",
      doctrine: {
        tactic: "swarm",
        profile: "SWARM_PRESS",
        flagshipWeights: { "Attack Frigate Flagship": 5, "Light Cruiser Flagship": 4, "Flagship Battlecruiser": 1 },
        tierWeights: { common: 0.72, uncommon: 0.22, rare: 0.06 },
        composition: {
          common: ["Fighter", "Attack Frigate", "Missile Frigate", "Attack Destroyer", "Railgun Destroyer", "Missile Destroyer"],
          uncommon: ["Bomber", "Shuttle", "Boarding APC"],
          rare: ["Light Cruiser", "Probe", "Boarding APC"]
        },
        scorerWeights: { aggression: 1.2, screen: 0.8, standoff: 0.7 }
      }
    }
  }
};
// Loading convention: this file defines factionsDataPayload at top level;
// the owner captures it after the boot list resolves and freezes it at
// receipt.
