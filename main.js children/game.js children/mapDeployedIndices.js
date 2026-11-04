"use strict";

// ============================================================
// mapDeployedIndices.js — job: roster indices the overflow split marked deployed (mapDeployedIndices).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const mapDeployedIndices = function (p){
  const fleet = p.fleet || [];
  const deployed = p.deployed || [];
  const selected = [];
  for (let i = 0; i < fleet.length; i++){
    if (deployed.indexOf(fleet[i]) !== -1) selected.push(i);
  }
  return selected;
};
