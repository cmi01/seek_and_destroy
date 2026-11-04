"use strict";

// ============================================================
// campaign_DATA.js — job: return the campaign and level table.
// Owner: game.js. Holds no state unless it is a core.
//
// M1: adds the `campaign` section — the frozen starting package the
// campaign state model is initialized from (fleet as hull names, wallet,
// cargo, clock, map anchor; reputation is keyed per faction pair at
// init). All money values are on the ×100 economy scale (DESIGN §4.5):
// level credits/income and budgets below are the v99 battle values ×100.
// ============================================================
const campaignDataPayload = (() => ({
  version: "M3-1.0",
  schema: "seek-and-destroy.campaign-data",
  campaign: {
    factions: ["Syndicate", "Capital", "Freehold", "Armoury", "Fringe"],
    start: {
      wallet: 25000,
      startFleet: ["Flagship Battlecruiser", "Fighter", "Fighter", "Attack Frigate", "Probe"],
      battle: { cornerCapacity: 4 },
      // M3 balance: fuel is consumed at ships × distance units (x3 in
      // hyperspace), so the M1-era 20-unit canister could not cross one
      // inter-system gap (one jump for the 5-ship start fleet ≈ 145 units).
      // 500 units ≈ 3–4 jumps; a full tank is 2,500 ⒸB of the 25,000 wallet.
      cargo: { goods: 0, fuel: 500, crew: 0, parts: 5 },
      clock: { month: 1, year: 2401 },
      map: { locationId: "sol-gate" }
    },
    // ---- trade (M4): the economy's frozen rate table (R9 — prices and
    // rates live here, never in verb bodies). Money values are the ×100
    // economy scale (DESIGN §4.5): fuel is 5 ⒸB/unit at base, crew are paid
    // wagePerCrewMonth per month (Q6), 1 month = 30 map turns (Q6 default).
    // The seeded market state is built from this table + the rules roster
    // (the economy subtree's market builder) and lives in campaign.market.
    trade: {
      seed: 20261104,
      spread: 0.12,
      wagePerCrewMonth: 5,
      repairPartsPerHp: 1,
      refitPartsPerSwap: 1,
      // Trade lots: one station-modal click moves this many units.
      lots: { goods: 10, fuel: 50, crew: 10, parts: 5 },
      goods: {
        goods: { base: 300, min: 120, max: 720 },
        fuel:  { base: 5, min: 2, max: 12 },
        crew:  { base: 150, min: 60, max: 360 },
        parts: { base: 400, min: 160, max: 960 }
      },
      weaponPrices: {
        "Light Cannon": 150,
        "Dual Light Assault Cannon": 300,
        "Dual Light Cannons": 350,
        "Medium Cannon Battery": 700,
        "Medium Assault Cannon Battery": 750,
        "Heavy Cannon Battery": 1500,
        "Light Railgun": 800,
        "Heavy Railgun": 1200,
        "Capital Railgun": 1800,
        "Ultra Railgun": 3200,
        "Unguided Torpedo": 600,
        "Light Missile Battery": 500,
        "Medium Missile Battery": 800,
        "Heavy Missile Battery": 1400,
        "Storm Missile Battery": 2800
      }
    },
    // ---- map (M3): the systems/stations table the map state is built from.
    // Money values are the ×100 economy scale (DESIGN §4.5): fuelUnitPrice is
    // 5 ⒸB per fuel unit. Locations carry their gravity well (destination
    // radius, Q5) and the battle-terrain flavor level for encounters there.
    map: {
      fuelUnitPrice: 5,
      hyperspaceMultiplier: 3,
      monthTurns: 30,
      wellRadius: 6,
      locations: [
        { id: "sol-gate", kind: "station", name: "SOL GATE STATION", x: 8, y: 30, levelId: 101, defenders: [] },
        { id: "wayfarer-drift", kind: "nebula", name: "WAYFARER DRIFT", x: 12, y: 12, levelId: 101, defenders: [] },
        { id: "aurora-prime", kind: "planet", name: "AURORA PRIME", x: 26, y: 18, levelId: 1, defenders: ["Fighter", "Attack Frigate"] },
        { id: "tarnished-belt", kind: "nebula", name: "TARNISHED BELT", x: 34, y: 8, levelId: 1, defenders: [] },
        { id: "wolfpack-debris", kind: "planet", name: "WOLFPACK DEBRIS", x: 42, y: 24, levelId: 1, defenders: ["Attack Destroyer", "Boarding APC"] },
        { id: "phantom-drift", kind: "nebula", name: "PHANTOM DRIFT", x: 46, y: 42, levelId: 2, defenders: [] },
        { id: "khepri-station", kind: "station", name: "KHEPRI STATION", x: 24, y: 44, levelId: 2, defenders: [] },
        { id: "helix-yards", kind: "station", name: "HELIX YARDS", x: 14, y: 54, levelId: 2, defenders: [] },
        { id: "ember-reach", kind: "planet", name: "EMBER REACH", x: 54, y: 14, levelId: 3, defenders: ["Missile Frigate", "Probe"] },
        { id: "citadel-singularity", kind: "planet", name: "CITADEL SINGULARITY", x: 58, y: 32, levelId: 3, defenders: ["Flagship Battlecruiser", "Battleship"] },
        { id: "cold-anchor", kind: "station", name: "COLD ANCHOR", x: 56, y: 54, levelId: 3, defenders: [] },
        { id: "freehold-concourse", kind: "planet", name: "FREEHOLD CONCOURSE", x: 32, y: 58, levelId: 3, defenders: [] }
      ],
      fleets: [
        // The player entry takes its ships from start.startFleet and its fuel
        // from start.cargo.fuel (the map builder expands both).
        { id: "player", faction: "player", x: 8, y: 30 },
        { id: "syndicate-picket", faction: "Syndicate", x: 42, y: 24, fuel: 120, ships: ["Fighter", "Fighter", "Attack Frigate"] },
        { id: "syndicate-raiders", faction: "Syndicate", x: 46, y: 42, fuel: 120, ships: ["Attack Destroyer", "Missile Frigate", "Probe"] },
        { id: "merchant-caravan", faction: "Freehold", x: 24, y: 44, fuel: 60, ships: ["Shuttle", "Shuttle"] }
      ]
    }
  },
  levels: [
    {
      id:101, tag:"TUTORIAL 01 // CALIBRATION RANGE", title:"TUTORIAL 01: TACTICAL CALIBRATION RANGE",
      desc:"Master sensor sweeps, d<=1 Purple Fog Nebula spotting, Asteroid flanking, #railgun shield break, #space marines boarding, and REINFORCEMENTS R:6 warp-ins.",
      aiDoctrine:"DEFENSIVE_HOLD",
      asteroidClusters:{count:2,clusterSizeMin:3,clusterSizeMax:4},
      nebulaPatches:{count:2,patchSizeMin:3,patchSizeMax:5},
      t1StartingCredits:3500, t1Income:500, t2StartingCredits:0, t2Income:0,
      t1SpawnList:["Flagship Battlecruiser","Probe","Attack Frigate","Railgun Destroyer","Boarding APC"],
      t2SpawnList:["Flagship Battlecruiser","Probe","Shuttle","Light Cruiser","Heavy Cruiser"],
      t2CompositionBudget:0, t2ArchetypePool:["Shuttle"],
      previewArchetypes:["Probe","Light Cruiser","Heavy Cruiser","Flagship Battlecruiser"],
      initialIntel:[
        "1. SENSOR SWEEP & GUNNERY: Select your Probe (R:8 scan) and move along the cyan chevron to unmask the fog. Select a warship and click a spotted enemy (orange diamond) to fire.",
        "2. NEBULA CLOAKING (d<=1) & BOARDING ('C'): Purple Nebulae reduce scan to 1 and cloak occupants until a ship moves adjacent (d<=1). Move a #space marines vessel adjacent to a non-flagship enemy and click the 'C' badge (or Shift+click) to capture, or click the hull to fire.",
        "3. RAILGUN SHIELD BREAK & REINFORCEMENTS: Railgun Destroyer breaks +shield bubbles and deals full damage. Click REINFORCEMENTS and pick a ship card to warp it in within R:6 of your capital ship."
      ]
    },
    {
      id:1, tag:"SECTOR 01 // WOLFPACK DEBRIS", title:"SECTOR 01: ASTEROID DEBRIS & NEBULA WOLFPACKS",
      desc:"High-mobility Syndicate strike craft and Boarding APCs prowl dense asteroid channels and ionized nebula pockets.",
      aiDoctrine:"AGGRESSIVE_SWARM",
      asteroidClusters:{count:5,clusterSizeMin:3,clusterSizeMax:6},
      nebulaPatches:{count:4,patchSizeMin:4,patchSizeMax:7},
      t1StartingCredits:5000, t1Income:400, t2StartingCredits:6500, t2Income:400,
      t1SpawnList:["Flagship Battlecruiser","Probe","Attack Frigate","Attack Destroyer"],
      t2SpawnList:["Flagship Battlecruiser","Probe","Boarding APC"],
      t2CompositionBudget:7500, t2ArchetypePool:["Fighter","Bomber","Boarding APC","Attack Frigate","Attack Destroyer"],
      previewArchetypes:["Fighter","Bomber","Attack Destroyer","Flagship Battlecruiser"],
      initialIntel:[
        "SECTOR 01 TELEMETRY: Syndicate wolfpacks detected behind central asteroid clusters.",
        "TACTICAL ADVISORY: Screen your Flagship Battlecruiser with Probes and Frigates to prevent hostile Boarding APCs or Bombers from ambushing out of Purple Fog Nebulae."
      ]
    },
    {
      id:2, tag:"SECTOR 02 // PHANTOM CROSSFIRE", title:"SECTOR 02: PHANTOM NEBULA CROSSFIRE",
      desc:"Dual Syndicate Flagships and long-range R:8 Missile Battleships use forward Probe pickets across expansive nebula fields.",
      aiDoctrine:"ARTILLERY_SCREEN",
      asteroidClusters:{count:4,clusterSizeMin:3,clusterSizeMax:5},
      nebulaPatches:{count:6,patchSizeMin:5,patchSizeMax:9},
      t1StartingCredits:5000, t1Income:500, t2StartingCredits:14000, t2Income:600,
      t1SpawnList:["Flagship Battlecruiser","Probe","Missile Frigate","Light Cruiser"],
      t2SpawnList:["Flagship Battlecruiser","Flagship Battlecruiser","Probe","Probe","Missile Battleship"],
      t2CompositionBudget:9500, t2ArchetypePool:["Probe","Missile Frigate","Missile Destroyer","Missile Cruiser"],
      previewArchetypes:["Probe","Missile Destroyer","Missile Cruiser","Missile Battleship"],
      initialIntel:[
        "SECTOR 02 TELEMETRY: Two Syndicate Flagship Battlecruisers and an R:8 Missile Battleship screen detected.",
        "TACTICAL ADVISORY: Eliminate hostile Probes to blind their stand-off missile batteries, or advance under Purple Fog Nebula cover."
      ]
    },
    {
      id:3, tag:"SECTOR 03 // SINGULARITY CITADEL", title:"SECTOR 03: SINGULARITY CORE CITADEL",
      desc:"Campaign Finale: Three Syndicate Flagship Battlecruisers escorted by heavy spinal Railgun Battleships and Cruisers.",
      aiDoctrine:"APEX_ARMADA",
      asteroidClusters:{count:6,clusterSizeMin:4,clusterSizeMax:7},
      nebulaPatches:{count:5,patchSizeMin:4,patchSizeMax:8},
      t1StartingCredits:6000, t1Income:500, t2StartingCredits:26000, t2Income:800,
      t1SpawnList:["Flagship Battlecruiser","Probe","Railgun Destroyer","Heavy Cruiser","Boarding APC"],
      t2SpawnList:["Flagship Battlecruiser","Flagship Battlecruiser","Flagship Battlecruiser","Battleship","Missile Battleship","Probe","Probe"],
      t2CompositionBudget:13000, t2ArchetypePool:["Railgun Cruiser","Heavy Cruiser","Battlecruiser","Boarding APC","Probe"],
      previewArchetypes:["Railgun Cruiser","Missile Battleship","Battleship","Flagship Battlecruiser"],
      initialIntel:[
        "SECTOR 03 TELEMETRY: Three Syndicate Flagships and heavy #railgun dreadnoughts hold the Singularity Citadel.",
        "TACTICAL ADVISORY: Use Boarding APCs to capture enemy capital ships and coordinate #railgun strikes to eliminate all three hostile !flagship vessels."
      ]
    }
  ]
  }))();
