"use strict";

// ============================================================
// selectionQueries.js — job: answer selection queries over the unit list.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("selectionQueries", () => {
  // The selected unit: the living unit carrying the selected id, if any.
  function getUnit(units, selectedUnitId) {
    if (selectedUnitId === null || selectedUnitId === undefined) return null;
    const us = units || [];
    return us.find(u => u.id === selectedUnitId && u.hp > 0) || null;
  }

  // The selection mirror cell (the unit's position) the renderers read.
  function cellFor(unit) {
    return unit ? { x: unit.x, y: unit.y } : null;
  }

  return {
    getUnit,
    cellFor
  };
});
