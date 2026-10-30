"use strict";

// ============================================================
// CAMPAIGN DATA — sector definitions: terrain generation parameters,
// starting credits/income, spawn lists, AI doctrine and briefing intel.
// Privately registered with Game (core/game.js); exposes zero globals.
// ============================================================
Game._registerModule("campaignData", {
  version: "V58-1.0",
  schema: "seek-and-destroy.campaign-data",
  levels: [
    {
      id:101, tag:"TUTORIAL 01 // CALIBRATION RANGE", title:"TUTORIAL 01: TACTICAL CALIBRATION RANGE",
      desc:"Master sensor sweeps, d<=1 Purple Fog Nebula spotting, Asteroid flanking, #railgun shield break, #space marines boarding, and [Space] #capital ship R:6 warp-ins.",
      aiDoctrine:"DEFENSIVE_HOLD",
      asteroidClusters:{count:2,clusterSizeMin:3,clusterSizeMax:4},
      nebulaPatches:{count:2,patchSizeMin:3,patchSizeMax:5},
      t1StartingCredits:35, t1Income:5, t2StartingCredits:0, t2Income:0,
      t1SpawnList:["Flagship Battlecruiser","Probe","Attack Frigate","Railgun Destroyer","Boarding APC"],
      t2SpawnList:["Flagship Battlecruiser","Probe","Shuttle","Light Cruiser","Heavy Cruiser"],
      t2CompositionBudget:0, t2ArchetypePool:["Shuttle"],
      previewArchetypes:["Probe","Light Cruiser","Heavy Cruiser","Flagship Battlecruiser"],
      initialIntel:[
        "1. SENSOR SWEEP & GUNNERY: Select your Probe (R:8 scan) and move along the cyan chevron to unmask the fog. Select a warship and click a spotted enemy (orange diamond) to fire.",
        "2. NEBULA CLOAKING (d<=1) & BOARDING ('C'): Purple Nebulae reduce scan to 1 and cloak occupants until a ship moves adjacent (d<=1). Move a #space marines vessel adjacent to a non-flagship enemy and click the 'C' badge (or Shift+click) to capture, or click the hull to fire.",
        "3. RAILGUN SHIELD BREAK & [SPACE] WARP-IN: Railgun Destroyer breaks +shield bubbles and deals full damage. Select your Flagship Battlecruiser (#capital ship), press [Space], and click a ship card to warp within R:6."
      ]
    },
    {
      id:1, tag:"SECTOR 01 // WOLFPACK DEBRIS", title:"SECTOR 01: ASTEROID DEBRIS & NEBULA WOLFPACKS",
      desc:"High-mobility Syndicate strike craft and Boarding APCs prowl dense asteroid channels and ionized nebula pockets.",
      aiDoctrine:"AGGRESSIVE_SWARM",
      asteroidClusters:{count:5,clusterSizeMin:3,clusterSizeMax:6},
      nebulaPatches:{count:4,patchSizeMin:4,patchSizeMax:7},
      t1StartingCredits:50, t1Income:4, t2StartingCredits:65, t2Income:4,
      t1SpawnList:["Flagship Battlecruiser","Probe","Attack Frigate","Attack Destroyer"],
      t2SpawnList:["Flagship Battlecruiser","Probe","Boarding APC"],
      t2CompositionBudget:75, t2ArchetypePool:["Fighter","Bomber","Boarding APC","Attack Frigate","Attack Destroyer"],
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
      t1StartingCredits:50, t1Income:5, t2StartingCredits:140, t2Income:6,
      t1SpawnList:["Flagship Battlecruiser","Probe","Missile Frigate","Light Cruiser"],
      t2SpawnList:["Flagship Battlecruiser","Flagship Battlecruiser","Probe","Probe","Missile Battleship"],
      t2CompositionBudget:95, t2ArchetypePool:["Probe","Missile Frigate","Missile Destroyer","Missile Cruiser"],
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
      t1StartingCredits:60, t1Income:5, t2StartingCredits:260, t2Income:8,
      t1SpawnList:["Flagship Battlecruiser","Probe","Railgun Destroyer","Heavy Cruiser","Boarding APC"],
      t2SpawnList:["Flagship Battlecruiser","Flagship Battlecruiser","Flagship Battlecruiser","Battleship","Missile Battleship","Probe","Probe"],
      t2CompositionBudget:130, t2ArchetypePool:["Railgun Cruiser","Heavy Cruiser","Battlecruiser","Boarding APC","Probe"],
      previewArchetypes:["Railgun Cruiser","Missile Battleship","Battleship","Flagship Battlecruiser"],
      initialIntel:[
        "SECTOR 03 TELEMETRY: Three Syndicate Flagships and heavy #railgun dreadnoughts hold the Singularity Citadel.",
        "TACTICAL ADVISORY: Use Boarding APCs to capture enemy capital ships and coordinate #railgun strikes to eliminate all three hostile !flagship vessels."
      ]
    }
  ]
});
