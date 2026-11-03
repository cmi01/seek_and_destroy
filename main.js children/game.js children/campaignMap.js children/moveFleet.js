"use strict";

// ============================================================
// moveFleet.js — job: move one map fleet toward a destination under the
// speed, fuel and crew rules.
// Owner: campaignMap.js (pure). Holds no state.
//
// M3 interface (roadmap-design §5.3): moveFleet(mapState, fleetId, dest) →
// { mapState, events }. Turn-based: one committed move is one map turn.
// The travelled distance is capped by the slowest ship (fleet speed = min
// ship speed). Without the fuel for the move — or with a flagship under 50%
// crew — the move is REJECTED and a merchant-fleet event is produced (the
// composing parent attaches the placeholder offer). The map is frozen while
// a battle is active (Q4). Space type: the segment between two points of the
// same gravity well is "normal" space, anything crossing into or through the
// gap between systems is "hyperspace" (Q5) and costs the multiplier more.
// The cost function and multiplier arrive as injected arguments (opts) so
// this child never names a sibling. Transforms return NEW state.
// ============================================================

const moveFleet = function (mapState, fleetId, dest, opts){
  const o = opts || {};
  const mult = (typeof o.mult === "number" && o.mult > 0) ? o.mult : 3;

  if (!mapState || !Array.isArray(mapState.fleets)) {
    return { mapState: mapState, events: [{ kind: "moveRejected", fleetId: fleetId, reason: "no-map" }] };
  }
  if (mapState.battleActive) {
    return { mapState: mapState, events: [{ kind: "moveRejected", fleetId: fleetId, reason: "map-frozen" }] };
  }

  let fleet = null;
  for (let i = 0; i < mapState.fleets.length; i++){
    if (mapState.fleets[i].id === fleetId){ fleet = mapState.fleets[i]; break; }
  }
  if (!fleet) {
    return { mapState: mapState, events: [{ kind: "moveRejected", fleetId: fleetId, reason: "unknown-fleet" }] };
  }
  const ships = Array.isArray(fleet.ships) ? fleet.ships : [];
  if (ships.length === 0) {
    return { mapState: mapState, events: [{ kind: "moveRejected", fleetId: fleetId, reason: "no-ships" }] };
  }

  const tx = (dest && typeof dest.x === "number") ? dest.x : fleet.x;
  const ty = (dest && typeof dest.y === "number") ? dest.y : fleet.y;
  const dx = tx - fleet.x;
  const dy = ty - fleet.y;
  const want = Math.sqrt(dx * dx + dy * dy);
  if (!(want > 0)) {
    return { mapState: mapState, events: [{ kind: "moveRejected", fleetId: fleetId, reason: "already-there" }] };
  }

  // Fleet speed = slowest ship.
  let speed = Infinity;
  for (let i = 0; i < ships.length; i++){
    const s = (typeof ships[i].speed === "number") ? ships[i].speed : 1;
    if (s < speed) speed = s;
  }
  if (!(speed > 0)) speed = 1;

  const travel = Math.min(want, speed);
  const nx = fleet.x + dx / want * travel;
  const ny = fleet.y + dy / want * travel;

  // Space type of the segment: both endpoints inside the same gravity well
  // is real space; anything else is hyperspace (jump space between systems).
  function wellAt(x, y){
    const ls = Array.isArray(mapState.locations) ? mapState.locations : [];
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < ls.length; i++){
      const L = ls[i];
      const d = Math.sqrt((L.x - x) * (L.x - x) + (L.y - y) * (L.y - y));
      const w = (typeof L.well === "number") ? L.well : 6;
      if (d <= w && d < bestD){ best = L; bestD = d; }
    }
    return best;
  }
  const wellFrom = wellAt(fleet.x, fleet.y);
  const wellTo = wellAt(nx, ny);
  const space = (wellFrom && wellTo && wellFrom.id === wellTo.id) ? "normal" : "hyperspace";

  if (typeof o.costFn !== "function") {
    throw new Error("moveFleet: opts.costFn (the injected cost function) is required.");
  }
  const cost = o.costFn(fleet, travel, space, mult);

  if (!(fleet.fuel >= cost)) {
    return { mapState: mapState, events: [{ kind: "merchantFleetEvent", fleetId: fleetId, reason: "no-fuel", needed: cost, held: (typeof fleet.fuel === "number") ? fleet.fuel : 0 }] };
  }
  let flagship = null;
  for (let i = 0; i < ships.length; i++){
    if (ships[i].flagship){ flagship = ships[i]; break; }
  }
  if (flagship && (flagship.maxCrew > 0) && (flagship.crew < flagship.maxCrew * 0.5)) {
    return { mapState: mapState, events: [{ kind: "merchantFleetEvent", fleetId: fleetId, reason: "flagship-crew-low", crew: flagship.crew, maxCrew: flagship.maxCrew }] };
  }

  const moved = {
    id: fleet.id,
    faction: fleet.faction,
    x: nx,
    y: ny,
    fuel: (typeof fleet.fuel === "number") ? fleet.fuel - cost : -cost,
    ships: ships
  };
  const fleets = mapState.fleets.map(function (f){ return f.id === fleetId ? moved : f; });

  const landed = wellTo ? wellTo.id : "";
  const next = {};
  Object.keys(mapState).forEach(function (k){ next[k] = mapState[k]; });
  next.fleets = fleets;
  next.turn = (typeof mapState.turn === "number") ? mapState.turn + 1 : 1;
  next.locationId = (fleet.faction === "player") ? landed : mapState.locationId;

  return {
    mapState: next,
    events: [{
      kind: "fleetMoved",
      fleetId: fleetId,
      from: { x: fleet.x, y: fleet.y },
      to: { x: nx, y: ny },
      distance: travel,
      capped: travel < want,
      space: space,
      cost: cost,
      fuelLeft: moved.fuel,
      turn: next.turn
    }]
  };
};
