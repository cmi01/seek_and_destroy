"use strict";

// ============================================================
// buildMapState.js — job: build the campaign map state from the frozen map
// table and the rules roster.
// Owner: campaignMap.js (pure). Holds no state.
//
// M3 interface (roadmap-design §5.3): buildMapState(campaignData, rng) →
// MapState. The rules roster travels in as an injected read-only argument so
// hull names expand to self-sufficient map ship records without this child
// reaching out (compliance: children are stateless pure functions). The
// optional rng scatters fleets that request it (same seed → same map).
//
// MapState (all map state lives in the campaign section's map key):
//   { locationId, turn, battleActive, pendingEncounter, rules, locations, fleets }
// MapFleet ships are plain records { hull, crew, maxCrew, speed, flagship } —
// the movement rules (slowest ship, flagship crew gate) read them directly.
// The player fleet entry without a ships list takes the starting package's
// hull list; its fuel starts from the starting cargo's fuel.
// ============================================================

const buildMapState = function (campaignData, shipSpecs, rng){
  const cd = campaignData || {};
  const table = cd.map || {};
  const specs = shipSpecs || {};
  const start = cd.start || {};
  const anchor = (start.map && start.map.locationId) ? start.map.locationId : "";

  function expandShip(hull){
    const s = specs[hull] || {};
    return {
      hull: hull,
      crew: (typeof s.crew === "number") ? s.crew : 0,
      maxCrew: (typeof s.crew === "number") ? s.crew : 0,
      speed: (typeof s.move === "number") ? s.move : 1,
      flagship: Array.isArray(s.flags) && s.flags.indexOf("!flagship") !== -1
    };
  }

  const locations = (Array.isArray(table.locations) ? table.locations : []).map(function (row){
    return {
      id: String(row.id),
      kind: String(row.kind || "empty"),
      name: String(row.name || row.id),
      x: Number(row.x) || 0,
      y: Number(row.y) || 0,
      levelId: (typeof row.levelId === "number") ? row.levelId : 101,
      well: (typeof row.well === "number") ? row.well : (typeof table.wellRadius === "number" ? table.wellRadius : 6),
      defenders: Array.isArray(row.defenders) ? row.defenders.slice() : []
    };
  });

  function locationAt(x, y){
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < locations.length; i++){
      const L = locations[i];
      const d = Math.sqrt((L.x - x) * (L.x - x) + (L.y - y) * (L.y - y));
      if (d <= L.well && d < bestD){ best = L; bestD = d; }
    }
    return best;
  }

  const fleets = (Array.isArray(table.fleets) ? table.fleets : []).map(function (row, i){
    const isPlayer = row.faction === "player";
    const hulls = Array.isArray(row.ships) ? row.ships
      : (isPlayer ? (Array.isArray(start.startFleet) ? start.startFleet : []) : []);
    let x = Number(row.x) || 0;
    let y = Number(row.y) || 0;
    if (row.scatter && typeof rng === "function"){
      const around = locationAt(Number(row.scatter.x) || 0, Number(row.scatter.y) || 0);
      const cx = around ? around.x : (Number(row.scatter.x) || 0);
      const cy = around ? around.y : (Number(row.scatter.y) || 0);
      const r = (typeof row.scatter.radius === "number") ? row.scatter.radius : 0;
      const ang = rng() * Math.PI * 2;
      const rad = r * Math.sqrt(rng());
      x = cx + Math.cos(ang) * rad;
      y = cy + Math.sin(ang) * rad;
    }
    return {
      id: String(row.id || ("fleet-" + i)),
      faction: String(row.faction || "neutral"),
      x: x,
      y: y,
      fuel: isPlayer
        ? ((typeof row.fuel === "number") ? row.fuel : ((start.cargo && start.cargo.fuel) || 0))
        : ((typeof row.fuel === "number") ? row.fuel : 0),
      ships: hulls.map(expandShip)
    };
  });

  const player = fleets.filter(function (f){ return f.faction === "player"; })[0] || null;
  const inWell = player ? locationAt(player.x, player.y) : null;

  return {
    locationId: inWell ? inWell.id : anchor,
    turn: 1,
    // The map is the campaign's main screen; the flag selects the canvas
    // screen ("map" | "battle") and freezes movement while a battle runs.
    screen: "map",
    battleActive: false,
    pendingEncounter: null,
    rules: {
      fuelUnitPrice: (typeof table.fuelUnitPrice === "number") ? table.fuelUnitPrice : 5,
      hyperspaceMultiplier: (typeof table.hyperspaceMultiplier === "number") ? table.hyperspaceMultiplier : 3,
      monthTurns: (typeof table.monthTurns === "number") ? table.monthTurns : 30,
      wellRadius: (typeof table.wellRadius === "number") ? table.wellRadius : 6
    },
    locations: locations,
    fleets: fleets
  };
};
