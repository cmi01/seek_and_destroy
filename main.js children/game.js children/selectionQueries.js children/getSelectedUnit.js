"use strict";

// ============================================================
// getSelectedUnit.js — job: return the living unit carrying the selected id, if any.
// Owner: selectionQueries.js (pure). Holds no state.
// ============================================================

const getSelectedUnit = function (units, selectedUnitId) {
  if (selectedUnitId === null || selectedUnitId === undefined) return null;
  const us = units || [];
  return us.find(u => u.id === selectedUnitId && u.hp > 0) || null;
};
