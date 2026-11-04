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
      voice: {
        tone: "rude, volatile",
        lines: {
          enemy: [
            "You've got a lot of nerve broadcasting on our channel.",
            "We're gonna wear your ship as a hat."
          ],
          unfriendly: [
            "What do you want, soft-hull? Make it quick.",
            "Ugh. It's you again. State your business or drift."
          ],
          neutral: [
            "Talk fast, stranger. My finger's itchy.",
            "You're not worth the torpedoes. Yet."
          ],
          friendly: [
            "Heh. You're alright. Don't let it go to your head.",
            "Fine, you get a pass. This time."
          ],
          allied: [
            "Brothers in blood! Name the target.",
            "Anything of ours is yours. Except the rum."
          ]
        }
      },
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
      voice: {
        tone: "superior, polished",
        lines: {
          enemy: [
            "By order of the Authority, surrender your vessel for impound.",
            "You have been adjudicated hostile. Compliance is not expected."
          ],
          unfriendly: [
            "Your file is... extensive. Do not add to it.",
            "Civilian presence is noted. Maintain course."
          ],
          neutral: [
            "Good day. Transponders in order, we trust.",
            "Proceed, citizen. The Authority maintains watch."
          ],
          friendly: [
            "Your cooperation has been noted with approval.",
            "A credit to independent shipping. Proceed."
          ],
          allied: [
            "The Authority extends its full confidence to your operations.",
            "Joint standing confirmed. Our sensors are your sensors."
          ]
        }
      },
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
      voice: {
        tone: "professional, egalitarian",
        lines: {
          enemy: [
            "The League recalls every debt. Yours is due.",
            "Freehold ships remember treachery."
          ],
          unfriendly: [
            "We'll trade, but we'll be watching the scales.",
            "Professional distance, for now."
          ],
          neutral: [
            "Fair dealing makes fair friends. What's your cargo?",
            "The League welcomes all at the right price."
          ],
          friendly: [
            "Always a pleasure. Equal terms, as ever.",
            "You make this sector better for everyone in it."
          ],
          allied: [
            "League partners share the load — and the spoils.",
            "Your fleet is welcome at our docks, always."
          ]
        }
      },
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
      voice: {
        tone: "extremely arrogant",
        lines: {
          enemy: [
            "A rounding error, begging to be erased.",
            "You are beneath our notice. Briefly."
          ],
          unfriendly: [
            "Your ledger is trivial. Do not bore us.",
            "Speak. Our time is worth more than your fleet."
          ],
          neutral: [
            "Ah, a customer. Try not to disappoint.",
            "The Armoury tolerates your presence. Wisely spent."
          ],
          friendly: [
            "Adequate. You may continue to aspire.",
            "Competence is so rare. Enjoy the compliment."
          ],
          allied: [
            "You operate at our discretion — a profitable one.",
            "Our interests align. Do keep up."
          ]
        }
      },
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
      voice: {
        tone: "amicable, cash-strapped",
        lines: {
          enemy: [
            "We've got nothing left to steal but our guns. And they work.",
            "Push us and we push back."
          ],
          unfriendly: [
            "Sorry, friend — we can't afford trouble today.",
            "Maybe come back when we're less desperate."
          ],
          neutral: [
            "Hey! Welcome. Looking to buy or just passing by?",
            "Times are tight, but hospitality's free."
          ],
          friendly: [
            "Good to see a friendly drive signature!",
            "Any friend of ours eats at our table."
          ],
          allied: [
            "We're with you. We've got your back — cheap at twice the price!",
            "One fleet, one family. Let's make a living."
          ]
        }
      },
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
