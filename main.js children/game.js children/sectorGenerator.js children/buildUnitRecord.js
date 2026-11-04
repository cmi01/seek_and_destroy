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
  }
  return {
    id: nextId,
    type,
    team,
    kind: "ship",
    x,
    y,
    hp: spec.hp,
    maxHp: spec.hp,
    // M4 manning (DESIGN §4.5): battle units carry crew/maxCrew so the
    // 50% incapacitation gate can judge them; default is a full crew (the
    // deploy/warp-in seams overlay the roster entry's actual crew).
    crew: spec.crew,
    maxCrew: spec.crew,
    move: spec.move,
    // M5 adoption (DESIGN §3.3): the unit's weapon truth is its loadout —
    // the mount names are copied from the hull's frozen default; every
    // weapon stat is read through the loadout seam, never off the record.
    loadout: Array.isArray(spec.defaultLoadout) ? spec.defaultLoadout.slice() : [],
    scan: spec.scan,
    cost: spec.cost,
    flags
  };
};
