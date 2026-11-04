"use strict";

// ============================================================
// buildUnitDTO.js — job: build the HUD-facing unit DTO from a live unit plus its seam-derived weapon stats (buildUnitDTO).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const buildUnitDTO = function (p){
  const u = p.unit;
  if (!u) return null;
  const ws = p.weaponStats || {};
  return {
    id: u.id,
    type: u.type,
    team: u.team,
    x: u.x,
    y: u.y,
    hp: u.hp,
    maxHp: u.maxHp,
    move: u.move,
    // M5 adoption: weapon stats are seam-derived from the unit's loadout.
    loadout: ws.loadout,
    firepower: ws.firepower,
    range: ws.range,
    scan: u.scan,
    cost: u.cost,
    flags: new Set(u.flags)
  };
};
