"use strict";

// ============================================================
// battleEventAt.js — job: resolve what entering a map position opens.
// Owner: campaignMap.js (pure). Holds no state.
//
// M3 interface (roadmap-design §5.3): battleEventAt(mapState, locationId)
// → BattleSetup | null. The card contract (Q4): "entering a fleet/location
// opens it and encounters enter battle on the next turn"; a fleet entering
// an in-progress battle "appears on the nearest map-relative edge and joins
// on the next turn".
//
// The arrival square is the entering fleet's position (third argument
// `entering`, else the player fleet's current position). An encounter opens
// when a foreign fleet sits within 1 square of the arrival (entering a
// fleet) or the arrival is inside a location whose row carries defenders
// (entering a location). A BattleSetup is plain data:
//   { kind: "fleet" | "location" | "join",
//     locationId, levelId, encounterFleetId, encounterFaction,
//     entry: { x, y, edge }, joinNextTurn: true }
// - kind "location": the garrison roster (the map table's defender rows)
//   seeds the battle; levelId is the battle flavor the row points at — the
//   map is the encounter source (the level ladder is retired, M3).
// - kind "join": the map is battle-active (frozen, Q4) and the arrival opens
//   a reinforcement entry — the joiner appears on the gravity well's edge
//   NEAREST its approach and joins on the next turn (joinNextTurn).
// - Returns null when nothing is at the arrival square — entering an empty
//   system opens nothing.
// ============================================================

const battleEventAt = function (mapState, locationId, entering){
  const m = mapState || {};
  const locations = Array.isArray(m.locations) ? m.locations : [];
  const fleets = Array.isArray(m.fleets) ? m.fleets : [];

  let loc = null;
  for (let i = 0; i < locations.length; i++){
    if (locations[i].id === locationId){ loc = locations[i]; break; }
  }

  // The arrival square: the entering fleet's position if given, else the
  // player fleet's current position (mapState carries all fleets).
  let from = (entering && typeof entering.x === "number" && typeof entering.y === "number")
    ? entering
    : null;
  if (!from){
    for (let i = 0; i < fleets.length; i++){
      if (fleets[i].faction === "player"){ from = fleets[i]; break; }
    }
  }
  if (!from) return null;

  const levelId = (loc && typeof loc.levelId === "number") ? loc.levelId : 101;

  // Nearest map-relative edge (Q4): the point on the well ring closest to
  // the approach, tagged with its cardinal edge for board placement.
  const anchor = loc || { x: from.x, y: from.y, well: 0 };
  const well = (typeof anchor.well === "number") ? anchor.well : 6;
  let entry = { x: anchor.x + well, y: anchor.y, edge: "E" };
  {
    const dx = from.x - anchor.x;
    const dy = from.y - anchor.y;
    const span = Math.sqrt(dx * dx + dy * dy);
    if (span > 0){
      entry = {
        x: anchor.x + (dx / span) * well,
        y: anchor.y + (dy / span) * well,
        edge: (Math.abs(dx) >= Math.abs(dy)) ? (dx >= 0 ? "E" : "W") : (dy >= 0 ? "S" : "N")
      };
    }
  }

  const setup = function (kind, fleet){
    return {
      kind: kind,
      locationId: loc ? loc.id : locationId,
      levelId: levelId,
      encounterFleetId: fleet ? fleet.id : "",
      encounterFaction: fleet ? fleet.faction : "garrison",
      entry: entry,
      joinNextTurn: true
    };
  };

  // Entering a fleet: a foreign fleet within 1 square of the arrival.
  for (let i = 0; i < fleets.length; i++){
    const f = fleets[i];
    if (f.faction === "player") continue;
    const dx = f.x - from.x;
    const dy = f.y - from.y;
    if (dx * dx + dy * dy <= 1){
      return setup(m.battleActive ? "join" : "fleet", f);
    }
  }

  // Entering a location: the arrival sits inside the well of a defended row.
  if (loc && Array.isArray(loc.defenders) && loc.defenders.length > 0){
    const dx = from.x - loc.x;
    const dy = from.y - loc.y;
    if (dx * dx + dy * dy <= well * well){
      return setup(m.battleActive ? "join" : "location", null);
    }
  }

  return null;
};
