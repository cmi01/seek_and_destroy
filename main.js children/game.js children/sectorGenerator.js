"use strict";

// ============================================================
// sectorGenerator.js — job: compose the sector-generation handle from its two generator children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const sectorGenerator = function (){
  return {
    createUnitData: buildUnitRecord,
    generateSectorData: buildSectorData
  };
};
