"use strict";

// ============================================================
// mapFrame.js — job: build the plain map render frame (MapFrameDTO).
// Owner: campaignMap.js (pure). Holds no state.
//
// M3 interface (roadmap-design §5.3): mapFrame(mapState, view) → MapFrameDTO,
// the one render exit of the map domain — it crosses GraphicsInterface with
// kind "map" and carries plain data only. The view is the map camera
// { x, y, span } in map units (the whole sector fits span 64 by default).
// hyperspace is true when the player fleet is outside every gravity well —
// the render is the red SC2-style hyperspace with gravity wells only.
// The optional third argument is injected data from the composing parent:
// { visibleFleets, battles } — the fleet ids the observer detects (map
// visibility: N squares = N ships) and the visible battle rows (nebula
// squares hide battles). Without it every fleet is emitted (test/preview
// shape). This child never names the visibility sibling — the lists arrive
// as plain data.
// ============================================================

const mapFrame = function (mapState, view, opts){
  const m = mapState || {};
  const v = view || {};
  const o = opts || {};
  const span = (typeof v.span === "number" && v.span > 0) ? v.span : 64;
  const x = (typeof v.x === "number") ? v.x : 0;
  const y = (typeof v.y === "number") ? v.y : 0;

  const locations = (Array.isArray(m.locations) ? m.locations : []).map(function (L){
    return { id: L.id, kind: L.kind, name: L.name, x: L.x, y: L.y, well: L.well };
  });

  const visible = Array.isArray(o.visibleFleets) ? o.visibleFleets : null;
  const fleets = (Array.isArray(m.fleets) ? m.fleets : [])
    .filter(function (f){ return !visible || visible.indexOf(f.id) !== -1; })
    .map(function (f){
      return {
        id: f.id,
        faction: f.faction,
        isPlayer: f.faction === "player",
        x: f.x,
        y: f.y,
        ships: (Array.isArray(f.ships)) ? f.ships.length : 0
      };
    });

  const player = (Array.isArray(m.fleets) ? m.fleets : []).filter(function (f){ return f.faction === "player"; })[0] || null;
  let hyperspace = false;
  if (player) {
    hyperspace = true;
    for (let i = 0; i < locations.length; i++){
      const L = locations[i];
      const d = Math.sqrt((L.x - player.x) * (L.x - player.x) + (L.y - player.y) * (L.y - player.y));
      if (d <= L.well){ hyperspace = false; break; }
    }
  }

  return {
    kind: "map",
    x: x,
    y: y,
    span: span,
    turn: (typeof m.turn === "number") ? m.turn : 1,
    screen: (typeof m.screen === "string") ? m.screen : "map",
    locationId: m.locationId || "",
    hyperspace: hyperspace,
    locations: locations,
    fleets: fleets,
    battles: Array.isArray(o.battles) ? o.battles.slice() : []
  };
};
