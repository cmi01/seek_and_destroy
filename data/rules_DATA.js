"use strict";

// ============================================================
// RULES DATA — declarative tactical constants, zoom ladder, ship specs &
// flag (ability/status) descriptions. Single source of truth (V58).
// Privately registered with Game (core/game.js); exposes zero globals.
// ============================================================
Game._registerModule("rulesData", {
  version: "V58-1.0",
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
  shipSpecs: {
    "Shuttle": { category: "Shuttle", cost: 5, hp: 1, move: 3, firepower: 1, range: 1, scan: 5, wType: "pdc", flags: ["buyable"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: null },
    "Fighter": { category: "Fighter", cost: 5, hp: 2, move: 9, firepower: 2, range: 2, scan: 2, wType: "pdc", flags: ["buyable"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: null },
    "Probe": { category: "Probe", cost: 5, hp: 1, move: 7, firepower: 0, range: 0, scan: 8, wType: "none", flags: ["buyable"], plumes: [], turrets: [], railgunTier: 0, sensorDish: "BOW_PROBE" },
    "Bomber": { category: "Bomber", cost: 10, hp: 1, move: 7, firepower: 7, range: 1, scan: 1, wType: "missile", flags: ["buyable"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: null },
    "Boarding APC": { category: "Boarding APC", cost: 10, hp: 3, move: 4, firepower: 0, range: 0, scan: 2, wType: "none", flags: ["buyable", "#space marines"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: null },
    "Attack Frigate": { category: "Frigate", cost: 10, hp: 4, move: 8, firepower: 2, range: 3, scan: 5, wType: "pdc", flags: ["buyable", "#shield generator", "+shield"], plumes: [0], turrets: [[0.25, 0]], railgunTier: 0, sensorDish: "AFT" },
    "Missile Frigate": { category: "Frigate", cost: 15, hp: 3, move: 6, firepower: 1, range: 8, scan: 5, wType: "missile", flags: ["buyable", "#shield generator", "+shield"], plumes: [0], turrets: [], railgunTier: 0, sensorDish: "AFT" },
    "Attack Destroyer": { category: "Destroyer", cost: 15, hp: 6, move: 6, firepower: 4, range: 4, scan: 3, wType: "pdc", flags: ["buyable"], plumes: [-0.26, 0.26], turrets: [[0.46, -0.22], [0.46, 0.22]], railgunTier: 0, sensorDish: null },
    "Railgun Destroyer": { category: "Destroyer", cost: 20, hp: 6, move: 6, firepower: 3, range: 3, scan: 3, wType: "railgun", flags: ["buyable", "#railgun"], plumes: [-0.26, 0.26], turrets: [], railgunTier: 1, sensorDish: null },
    "Missile Destroyer": { category: "Destroyer", cost: 20, hp: 4, move: 6, firepower: 2, range: 8, scan: 3, wType: "missile", flags: ["buyable"], plumes: [-0.26, 0.26], turrets: [], railgunTier: 0, sensorDish: null },
    "Light Cruiser": { category: "Cruiser", cost: 20, hp: 6, move: 6, firepower: 3, range: 4, scan: 3, wType: "pdc", flags: ["buyable", "#shield generator", "+shield"], plumes: [-0.36, 0.36], turrets: [[0.12, 0], [-0.28, 0]], railgunTier: 0, sensorDish: null },
    "Railgun Cruiser": { category: "Cruiser", cost: 25, hp: 10, move: 4, firepower: 7, range: 4, scan: 3, wType: "railgun", flags: ["buyable", "#railgun", "#shield generator", "+shield"], plumes: [-0.36, 0.36], turrets: [], railgunTier: 2, sensorDish: null },
    "Heavy Cruiser": { category: "Cruiser", cost: 25, hp: 12, move: 4, firepower: 5, range: 3, scan: 3, wType: "railgun", flags: ["buyable", "#railgun", "#shield generator", "+shield"], plumes: [-0.36, 0.36], turrets: [], railgunTier: 1, sensorDish: null, armorBelt: true },
    "Missile Cruiser": { category: "Cruiser", cost: 25, hp: 8, move: 4, firepower: 2, range: 8, scan: 5, wType: "missile", flags: ["buyable", "#shield generator", "+shield"], plumes: [-0.36, 0.36], turrets: [], railgunTier: 0, sensorDish: "AFT" },
    "Battlecruiser": { category: "Battlecruiser", cost: 35, hp: 12, move: 4, firepower: 7, range: 6, scan: 3, wType: "pdc", flags: ["buyable", "#capital ship", "#shield generator", "+shield"], plumes: [-0.42, 0, 0.42], turrets: [[0.42, 0], [0.02, 0], [-0.38, 0]], railgunTier: 0, sensorDish: null },
    "Missile Battleship": { category: "Battleship", cost: 45, hp: 18, move: 2, firepower: 4, range: 8, scan: 5, wType: "missile", flags: ["buyable", "#capital ship", "#shield generator", "+shield", "#space marines"], plumes: [-0.42, 0, 0.42], turrets: [], railgunTier: 0, sensorDish: "AFT" },
    "Battleship": { category: "Battleship", cost: 50, hp: 25, move: 2, firepower: 9, range: 6, scan: 3, wType: "railgun", flags: ["buyable", "#capital ship", "#shield generator", "+shield", "#railgun", "#space marines"], plumes: [-0.42, 0, 0.42], turrets: [[0.05, -0.52], [0.05, 0.52]], railgunTier: 2, sensorDish: null },
    "Flagship Battlecruiser": { category: "Battlecruiser", cost: 95, hp: 12, move: 4, firepower: 7, range: 6, scan: 8, wType: "pdc", flags: ["#capital ship", "#shield generator", "+shield", "!flagship"], plumes: [-0.42, 0, 0.42], turrets: [[0.10, 0], [-0.32, 0]], railgunTier: 0, sensorDish: "DUAL_LATERAL" }
  },
  flagDescriptions: {
    "!flagship": "Command Locus: Losing all friendly !flagship units triggers immediate defeat. Immune to #space marines boarding capture.",
    "#capital ship": "Mobile Warp Locus: Select this vessel and press [Space] to warp in reinforcements within R:6.",
    "#railgun": "Hyper-Velocity Spinal Mount: Breaks enemy +shield bubbles and deals full firepower to hull HP.",
    "#space marines": "Boarding Contingent: Can capture adjacent (d <= 1) spotted non-flagship enemy vessels.",
    "#shield generator": "Deflector Array: Can spend 1 AP (S badge on self) to regenerate +shield if not -shielded this turn.",
    "+shield": "Active Octagon Bubble: Reduces non-railgun hit to 1 HP damage and collapses. Drops when firing.",
    "-moved": "Helm Exhausted: Drive plumes extinguished; hull rendered in white for the rest of this turn.",
    "-sent boarding party": "Marines Deployed: Boarding clamps expended for the rest of this turn.",
    "-attacked": "Ordnance Cycled: Weapons offline for the rest of this turn.",
    "-shielded": "Capacitors Cycled: Shield generator cannot regenerate again this turn."
  }
});
