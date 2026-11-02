"use strict";

// ============================================================
// buildUnitRecord.js — job: build one unit's plain-data record from its ship spec.
// Owner: sectorGenerator.js (pure). Holds no state.
// ============================================================

const buildUnitRecord = function (shipSpecs, nextId, type, team, x, y, applySpawnExhaustion = false) {
  const spec = shipSpecs[type];
  const flags = new Set(spec.flags);
  if (applySpawnExhaustion) {
    flags.add("-moved");
    flags.add("-sent boarding party");
    flags.add("-attacked");
    flags.add("-shielded");
  }
  return {
    id: nextId,
    type,
    team,
    x,
    y,
    hp: spec.hp,
    maxHp: spec.hp,
    move: spec.move,
    firepower: spec.firepower,
    range: spec.range,
    scan: spec.scan,
    cost: spec.cost,
    flags
  };
};
