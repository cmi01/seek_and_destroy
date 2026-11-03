"use strict";

// ============================================================
// mapVisibility.js — job: compute what one faction's map fleets detect.
// Owner: campaignMap.js (pure). Holds no state.
//
// M3 interface (roadmap-design §5.3): mapVisibility(mapState,
// observerFaction) → { detectedFleets, battles }.
//
// Roadmap M3: "fleets detected at N squares = N ships" — a fleet's sensor
// radius in map squares equals its ship count, so a 5-ship fleet sees 5
// squares out. Detected = the observer's own fleets (a fleet always knows
// itself) plus every foreign fleet inside any observer fleet's radius
// (Euclidean distance ≤ radius). Battles are visible except inside a
// nebula location's gravity well — "nebula squares hide battles" (the
// battle record is omitted; reserves are battle-internal and never map
// data). Output is plain data: fleet rows carry no movement bookkeeping.
// ============================================================

const mapVisibility = function (mapState, observerFaction){
  const m = mapState || {};
  const fleets = Array.isArray(m.fleets) ? m.fleets : [];
  const locations = Array.isArray(m.locations) ? m.locations : [];
  const faction = (typeof observerFaction === "string") ? observerFaction : "player";

  function rowOf(f){
    return {
      id: f.id,
      faction: f.faction,
      x: f.x,
      y: f.y,
      ships: (Array.isArray(f.ships)) ? f.ships.length : 0
    };
  }

  const observers = [];
  for (let i = 0; i < fleets.length; i++){
    if (fleets[i].faction === faction) observers.push(fleets[i]);
  }

  const detected = [];
  for (let i = 0; i < fleets.length; i++){
    const f = fleets[i];
    if (f.faction === faction){
      detected.push(rowOf(f));
      continue;
    }
    for (let j = 0; j < observers.length; j++){
      const o = observers[j];
      // N squares = N ships: the sensor radius is the observer's ship count.
      const radius = (Array.isArray(o.ships)) ? o.ships.length : 0;
      const dx = f.x - o.x;
      const dy = f.y - o.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius){
        detected.push(rowOf(f));
        break;
      }
    }
  }

  // Battle visibility: the map records battles at map positions; a battle
  // inside a nebula's gravity well is hidden from the visibility read-out.
  const battleRows = (Array.isArray(m.battles) ? m.battles : []).concat(
    (m.battleActive && m.battleAt) ? [m.battleAt] : []
  );
  const battles = [];
  for (let i = 0; i < battleRows.length; i++){
    const b = battleRows[i] || {};
    let hidden = false;
    for (let j = 0; j < locations.length; j++){
      const L = locations[j];
      if (L.kind !== "nebula") continue;
      const w = (typeof L.well === "number") ? L.well : 6;
      const dx = (b.x || 0) - L.x;
      const dy = (b.y || 0) - L.y;
      if (dx * dx + dy * dy <= w * w){ hidden = true; break; }
    }
    if (!hidden){
      battles.push({ x: b.x || 0, y: b.y || 0, locationId: b.locationId || "" });
    }
  }

  return { detectedFleets: detected, battles: battles };
};
