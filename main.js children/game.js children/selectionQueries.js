"use strict";

// ============================================================
// selectionQueries.js — job: compose the selection-query handle from its two query children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const selectionQueries = function (){
  return {
    getUnit: getSelectedUnit,
    cellFor: cellForUnit
  };
};
