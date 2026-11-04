"use strict";

// ============================================================
// mapAi.js — job: decide one NPC faction's map orders for the turn.
// Owner: campaignMap.js (pure). Holds no state.
//
// M6 interface (roadmap-design §5.6, decision D4): mapAi(mapState,
// factionId, rng) → MapOrder[] — NPC fleets use the same movement rules as
// the player (the composer applies the orders through the shared mover).
// World life: a fleet fights a hostile fleet it can reach, trades at the
// station it occupies, and otherwise closes on the nearest station. The
// seeded rng breaks target/patrol ties, so the whole NPC turn is
// deterministic under a seeded clock.
// ============================================================
const mapAi = function (mapState, factionId, rng){
  const s = mapState || {};
  const fleets = Array.isArray(s.fleets) ? s.fleets : [];
  const locations = Array.isArray(s.locations) ? s.locations : [];
  const r = (typeof rng === "function") ? rng : Math.random;
  const orders = [];
  function dist2(a, b){ const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
  for (let i = 0; i < fleets.length; i++){
    const me = fleets[i];
    if (!me || me.faction !== factionId) continue;
    // Fight: the nearest hostile fleet within reach beats everything else.
    let target = null, targetD = 9;
    for (let j = 0; j < fleets.length; j++){
      const other = fleets[j];
      if (!other || other.faction === factionId || other.faction === "player") continue;
      const d = dist2(me, other);
      if (d <= 4 && (target === null || d < targetD || (d === targetD && r() < 0.5))){
        target = other; targetD = d;
      }
    }
    if (target){
      orders.push({ kind: "fight", fleetId: me.id, targetId: target.id });
      continue;
    }
    // Trade: the station the fleet occupies.
    let here = null;
    for (let k = 0; k < locations.length; k++){
      const L = locations[k];
      if (L && dist2(me, L) <= 1){ here = L; break; }
    }
    if (here){
      orders.push({ kind: "trade", fleetId: me.id, locationId: here.id });
      continue;
    }
    // Move: close on the nearest station (rng breaks equal-distance ties).
    let goal = null, goalD = Infinity;
    for (let k = 0; k < locations.length; k++){
      const L = locations[k];
      if (!L) continue;
      const d = dist2(me, L);
      if (d < goalD || (d === goalD && r() < 0.5)){ goal = L; goalD = d; }
    }
    if (goal){
      const dx = goal.x - me.x, dy = goal.y - me.y;
      const step = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
      orders.push({
        kind: "move", fleetId: me.id,
        x: me.x + Math.sign(dx) * Math.min(Math.abs(dx), Math.max(1, Math.floor(step / 2))),
        y: me.y + Math.sign(dy) * Math.min(Math.abs(dy), Math.max(1, Math.floor(step / 2)))
      });
    }
  }
  return orders;
};
// Loading convention: this file defines mapAi at top level; the owner
// captures it after the boot list resolves.
