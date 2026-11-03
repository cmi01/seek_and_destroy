"use strict";

// ============================================================
// rules_DATA.js — job: return the tactical rules table (specs, combat rules, flags).
// Owner: game.js. Holds no state unless it is a core.
//
// M1 roster conformance (DESIGN §3): this is the SINGLE roster source for
// battle and campaign (no duplicate rosters). All money values are on the
// ×100 economy scale (§4.5): ship costs 500–25,000 ⒸB, levels' credits and
// income likewise. crew = ⌈cost ÷ 100⌉; flagship variants cost 2.5× their
// base hull and differ only by scan 8; Dreadnought = 2× Battleship.
// weapons: 15 variants; slots = round(dmg × range), ×1.5 for railguns.
// Each hull's capacity equals the slot total of its default loadout (§3.3).
// ============================================================
const rulesDataPayload = (() => ({
  version: "M1-1.0",
  schema: "seek-and-destroy.rules-data",
  gridSize: 32,
  spawnRadius: 6,
  maxAp: 4,
  enemyActionIntervalMs: 500,
  zoomLadder: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
  wheelNotchPx: 100,
  maxZoomStepsPerEvent: 3,
  defaultDifficulty: "NORMAL",
  combatRules: {
    nebulaEffectiveScan: 1,
    nebulaCloakDist: 1.0,
    shieldCollisionBonus: 1,
    shieldNonRailgunDamage: 1,
    losRayStepsPerCell: 16,
    rangeEpsilon: 1e-6
  },
  difficultyProfiles: {
    EASY:   { seqCost: 60, mistakeChance: 0.30, beliefDecay: 0.55, focusFire: false, ap: 3, lookaheadDepth: 1 },
    NORMAL: { seqCost: 35, mistakeChance: 0.12, beliefDecay: 0.75, focusFire: true,  ap: 4, lookaheadDepth: 2 },
    HARD:   { seqCost: 20, mistakeChance: 0.04, beliefDecay: 0.85, focusFire: true,  ap: 4, lookaheadDepth: 2 },
    ACE:    { seqCost: 10, mistakeChance: 0.00, beliefDecay: 0.90, focusFire: true,  ap: 5, lookaheadDepth: 3 }
  },
  weapons: {
    "Light Cannon":                 { class: "cannon",  dmg: 1, range: 1, slots: 1 },
    "Dual Light Assault Cannon":    { class: "cannon",  dmg: 2, range: 2, slots: 4 },
    "Dual Light Cannons":           { class: "cannon",  dmg: 2, range: 3, slots: 6 },
    "Medium Cannon Battery":        { class: "cannon",  dmg: 3, range: 5, slots: 15 },
    "Medium Assault Cannon Battery":{ class: "cannon",  dmg: 4, range: 4, slots: 16 },
    "Heavy Cannon Battery":         { class: "cannon",  dmg: 7, range: 6, slots: 42 },
    "Light Railgun":                { class: "railgun", dmg: 3, range: 3, slots: 14 },
    "Heavy Railgun":                { class: "railgun", dmg: 5, range: 3, slots: 23 },
    "Capital Railgun":              { class: "railgun", dmg: 7, range: 4, slots: 42 },
    "Ultra Railgun":                { class: "railgun", dmg: 9, range: 6, slots: 81 },
    "Unguided Torpedo":             { class: "missile", dmg: 7, range: 1, slots: 7 },
    "Light Missile Battery":        { class: "missile", dmg: 1, range: 8, slots: 8 },
    "Medium Missile Battery":       { class: "missile", dmg: 2, range: 8, slots: 16 },
    "Heavy Missile Battery":        { class: "missile", dmg: 4, range: 8, slots: 32 },
    "Storm Missile Battery":        { class: "missile", dmg: 8, range: 8, slots: 64 }
  },
  shipSpecs: {
    "Shuttle": { category: "Shuttle", cost: 500, crew: 5, capacity: 1, defaultLoadout: ["Light Cannon"], hp: 1, move: 3, firepower: 1, range: 1, scan: 5, wType: "pdc", flags: ["buyable"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: null },
    "Fighter": { category: "Fighter", cost: 500, crew: 5, capacity: 4, defaultLoadout: ["Dual Light Assault Cannon"], hp: 2, move: 9, firepower: 2, range: 2, scan: 2, wType: "pdc", flags: ["buyable"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: null },
    "Probe": { category: "Probe", cost: 500, crew: 5, capacity: 0, defaultLoadout: [], hp: 1, move: 7, firepower: 0, range: 0, scan: 8, wType: "none", flags: ["buyable"], plumes: [], turrets: [], railgunTier: 0, sensorDish: "BOW_PROBE" },
    "Bomber": { category: "Bomber", cost: 1000, crew: 10, capacity: 7, defaultLoadout: ["Unguided Torpedo"], hp: 1, move: 7, firepower: 7, range: 1, scan: 1, wType: "missile", flags: ["buyable"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: null },
    "Boarding APC": { category: "Boarding APC", cost: 1000, crew: 10, capacity: 0, defaultLoadout: [], hp: 3, move: 4, firepower: 0, range: 0, scan: 2, wType: "none", flags: ["buyable", "#space marines"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: null },
    "Attack Frigate": { category: "Frigate", cost: 1000, crew: 10, capacity: 6, defaultLoadout: ["Dual Light Cannons"], hp: 4, move: 8, firepower: 2, range: 3, scan: 5, wType: "pdc", flags: ["buyable", "#shield generator", "+shield"], plumes: [0], turrets: [[0.25, 0]], railgunTier: 0, sensorDish: "AFT" },
    "Missile Frigate": { category: "Frigate", cost: 1500, crew: 15, capacity: 8, defaultLoadout: ["Light Missile Battery"], hp: 3, move: 6, firepower: 1, range: 8, scan: 5, wType: "missile", flags: ["buyable", "#shield generator", "+shield"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: "AFT" },
    "Attack Destroyer": { category: "Destroyer", cost: 1500, crew: 15, capacity: 16, defaultLoadout: ["Medium Assault Cannon Battery"], hp: 6, move: 6, firepower: 4, range: 4, scan: 3, wType: "pdc", flags: ["buyable"], plumes: [-0.26, 0.26], turrets: [[0.46, -0.22], [0.46, 0.22]], railgunTier: 0, sensorDish: null },
    "Railgun Destroyer": { category: "Destroyer", cost: 2000, crew: 20, capacity: 14, defaultLoadout: ["Light Railgun"], hp: 6, move: 6, firepower: 3, range: 3, scan: 3, wType: "railgun", flags: ["buyable", "#railgun"], plumes: [-0.26, 0.26], turrets: [], railgunTier: 1, sensorDish: null },
    "Missile Destroyer": { category: "Destroyer", cost: 2000, crew: 20, capacity: 16, defaultLoadout: ["Medium Missile Battery"], hp: 4, move: 6, firepower: 2, range: 8, scan: 3, wType: "missile", flags: ["buyable"], plumes: [-0.26, 0.26], turrets: [], railgunTier: 0, sensorDish: null },
    "Light Cruiser": { category: "Cruiser", cost: 2000, crew: 20, capacity: 15, defaultLoadout: ["Medium Cannon Battery"], hp: 6, move: 6, firepower: 3, range: 5, scan: 3, wType: "pdc", flags: ["buyable", "#shield generator", "+shield"], plumes: [-0.36, 0.36], turrets: [[0.12, 0], [-0.28, 0]], railgunTier: 0, sensorDish: null },
    "Railgun Cruiser": { category: "Cruiser", cost: 2500, crew: 25, capacity: 42, defaultLoadout: ["Capital Railgun"], hp: 10, move: 4, firepower: 7, range: 4, scan: 3, wType: "railgun", flags: ["buyable", "#railgun", "#shield generator", "+shield"], plumes: [-0.36, 0.36], turrets: [], railgunTier: 2, sensorDish: null },
    "Heavy Cruiser": { category: "Cruiser", cost: 2500, crew: 25, capacity: 23, defaultLoadout: ["Heavy Railgun"], hp: 12, move: 4, firepower: 5, range: 3, scan: 3, wType: "railgun", flags: ["buyable", "#railgun", "#shield generator", "+shield"], plumes: [-0.36, 0.36], turrets: [], railgunTier: 1, sensorDish: null, armorBelt: true },
    "Missile Cruiser": { category: "Cruiser", cost: 2500, crew: 25, capacity: 16, defaultLoadout: ["Medium Missile Battery"], hp: 8, move: 4, firepower: 2, range: 8, scan: 5, wType: "missile", flags: ["buyable", "#shield generator", "+shield"], plumes: [-0.36, 0.36], turrets: [], railgunTier: 0, sensorDish: "AFT" },
    "Battlecruiser": { category: "Battlecruiser", cost: 3500, crew: 35, capacity: 42, defaultLoadout: ["Heavy Cannon Battery"], hp: 12, move: 4, firepower: 7, range: 6, scan: 3, wType: "pdc", flags: ["buyable", "#capital ship", "#shield generator", "+shield"], plumes: [-0.42, 0, 0.42], turrets: [[0.42, 0], [0.02, 0], [-0.38, 0]], railgunTier: 0, sensorDish: null },
    "Missile Battleship": { category: "Battleship", cost: 4500, crew: 45, capacity: 32, defaultLoadout: ["Heavy Missile Battery"], hp: 18, move: 2, firepower: 4, range: 8, scan: 5, wType: "missile", flags: ["buyable", "#capital ship", "#shield generator", "+shield", "#space marines"], plumes: [-0.42, 0, 0.42], turrets: [], railgunTier: 0, sensorDish: "AFT" },
    "Battleship": { category: "Battleship", cost: 5000, crew: 50, capacity: 81, defaultLoadout: ["Ultra Railgun"], hp: 25, move: 2, firepower: 9, range: 6, scan: 3, wType: "railgun", flags: ["buyable", "#capital ship", "#shield generator", "+shield", "#railgun", "#space marines"], plumes: [-0.42, 0, 0.42], turrets: [[0.05, -0.52], [0.05, 0.52]], railgunTier: 2, sensorDish: null },
    "Dreadnought": { category: "Battleship", cost: 10000, crew: 100, capacity: 64, defaultLoadout: ["Storm Missile Battery"], hp: 47, move: 1, firepower: 8, range: 8, scan: 3, wType: "missile", flags: ["buyable", "#capital ship", "#space marines"], plumes: [-0.42, 0, 0.42], turrets: [], railgunTier: 0, sensorDish: "AFT", armorBelt: true },
    "Flagship Battlecruiser": { category: "Battlecruiser", cost: 8750, crew: 88, capacity: 42, defaultLoadout: ["Heavy Cannon Battery"], hp: 12, move: 4, firepower: 7, range: 6, scan: 8, wType: "pdc", flags: ["#capital ship", "#shield generator", "+shield", "!flagship"], plumes: [-0.42, 0, 0.42], turrets: [[0.10, 0], [-0.32, 0]], railgunTier: 0, sensorDish: "DUAL_LATERAL" },
    "Dreadnought Flagship": { category: "Battleship", cost: 25000, crew: 250, capacity: 64, defaultLoadout: ["Storm Missile Battery"], hp: 47, move: 1, firepower: 8, range: 8, scan: 8, wType: "missile", flags: ["#capital ship", "#space marines", "!flagship"], plumes: [-0.42, 0, 0.42], turrets: [], railgunTier: 0, sensorDish: "AFT", armorBelt: true },
    "Attack Frigate Flagship": { category: "Frigate", cost: 2500, crew: 25, capacity: 6, defaultLoadout: ["Dual Light Cannons"], hp: 4, move: 8, firepower: 2, range: 3, scan: 8, wType: "pdc", flags: ["#shield generator", "+shield", "!flagship"], plumes: [0], turrets: [[0.25, 0]], railgunTier: 0, sensorDish: "AFT" },
    "Light Cruiser Flagship": { category: "Cruiser", cost: 5000, crew: 50, capacity: 15, defaultLoadout: ["Medium Cannon Battery"], hp: 6, move: 6, firepower: 3, range: 5, scan: 8, wType: "pdc", flags: ["#shield generator", "+shield", "!flagship"], plumes: [-0.36, 0.36], turrets: [[0.12, 0], [-0.28, 0]], railgunTier: 0, sensorDish: null }
  },
  flagDescriptions: {
    "!flagship": "Command Locus: Losing all friendly !flagship units triggers immediate defeat. Immune to #space marines boarding capture.",
    "#capital ship": "Mobile Warp Locus: Opens R:6 warp-ins via the REINFORCEMENTS button (or [Space]).",
    "#railgun": "Hyper-Velocity Spinal Mount: Breaks enemy +shield bubbles and deals full firepower to hull HP.",
    "#space marines": "Boarding Contingent: Can capture adjacent (d <= 1) spotted non-flagship enemy vessels.",
    "#shield generator": "Deflector Array: Can spend 1 AP (S badge on self) to regenerate +shield if not -shielded this turn.",
    "+shield": "Active Octagon Bubble: Reduces non-railgun hit to 1 HP damage and collapses. Drops when firing.",
    "-moved": "Helm Exhausted: Drive plumes extinguished; hull rendered in white for the rest of this turn.",
    "-sent boarding party": "Marines Deployed: Boarding clamps expended for the rest of this turn.",
    "-attacked": "Ordnance Cycled: Weapons offline for the rest of this turn.",
    "-shielded": "Capacitors Cycled: Shield generator cannot regenerate again this turn."
  }
}))();
