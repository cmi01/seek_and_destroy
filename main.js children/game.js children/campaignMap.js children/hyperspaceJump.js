"use strict";

// ============================================================
// hyperspaceJump.js — job: transit one map fleet between gravity wells
// through hyperspace.
// Owner: campaignMap.js (pure). Holds no state.
//
// M3 interface (roadmap-design §5.3): hyperspaceJump(mapState, fleetId,
// target) → { mapState, events }; target is the destination location id.
// Q5 adopted shape: jump points sit at system edges — a fleet jumps from its
// current system's edge point (the point on the well nearest the target) and
// can only EXIT hyperspace at a gravity well (the target's edge point nearest
// the origin); deep space is never a jump destination. Hyperspace costs the
// multiplier (x3) over the jump distance, paid in fuel units like any move.
// Rejections (frozen map, no jump point, unknown target, no fuel, flagship
// under 50% crew) produce the same merchant-fleet event shape the mover
// emits; the composing parent attaches the placeholder offer. The cost
// function and multiplier arrive injected (opts) so this child never names a
// sibling. Transforms return NEW state.
// ============================================================

const hyperspaceJump = function (mapState, fleetId, target, opts){
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

  const from = wellAt(fleet.x, fleet.y);
  if (!from) {
    return { mapState: mapState, events: [{ kind: "moveRejected", fleetId: fleetId, reason: "no-jump-point" }] };
  }

  const ls = Array.isArray(mapState.locations) ? mapState.locations : [];
  let to = null;
  for (let i = 0; i < ls.length; i++){
    if (ls[i].id === target){ to = ls[i]; break; }
  }
  if (!to) {
    return { mapState: mapState, events: [{ kind: "moveRejected", fleetId: fleetId, reason: "unknown-target" }] };
  }
  if (to.id === from.id) {
    return { mapState: mapState, events: [{ kind: "moveRejected", fleetId: fleetId, reason: "already-there" }] };
  }

  // Jump points at the wells' edges (Q5): depart the origin's edge nearest
  // the target, arrive the destination's edge nearest the origin.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / span;
  const uy = dy / span;
  const fromEdge = { x: from.x + ux * from.well, y: from.y + uy * from.well };
  const toEdge = { x: to.x - ux * to.well, y: to.y - uy * to.well };
  const distance = Math.sqrt(
    (toEdge.x - fromEdge.x) * (toEdge.x - fromEdge.x) +
    (toEdge.y - fromEdge.y) * (toEdge.y - fromEdge.y)
  );

  const ships = Array.isArray(fleet.ships) ? fleet.ships : [];
  if (ships.length === 0) {
    return { mapState: mapState, events: [{ kind: "moveRejected", fleetId: fleetId, reason: "no-ships" }] };
  }
  if (typeof o.costFn !== "function") {
    throw new Error("hyperspaceJump: opts.costFn (the injected cost function) is required.");
  }
  const cost = o.costFn(fleet, distance, "hyperspace", mult);

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
    x: toEdge.x,
    y: toEdge.y,
    fuel: (typeof fleet.fuel === "number") ? fleet.fuel - cost : -cost,
    ships: ships
  };
  const fleets = mapState.fleets.map(function (f){ return f.id === fleetId ? moved : f; });

  const next = {};
  Object.keys(mapState).forEach(function (k){ next[k] = mapState[k]; });
  next.fleets = fleets;
  next.turn = (typeof mapState.turn === "number") ? mapState.turn + 1 : 1;
  next.locationId = (fleet.faction === "player") ? to.id : mapState.locationId;

  return {
    mapState: next,
    events: [{
      kind: "fleetJumped",
      fleetId: fleetId,
      from: { system: from.id, x: fromEdge.x, y: fromEdge.y },
      to: { system: to.id, x: toEdge.x, y: toEdge.y },
      distance: distance,
      space: "hyperspace",
      cost: cost,
      fuelLeft: moved.fuel,
      turn: next.turn
    }]
  };
};
