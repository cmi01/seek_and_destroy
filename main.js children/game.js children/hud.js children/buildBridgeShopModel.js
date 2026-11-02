"use strict";

// ============================================================
// buildBridgeShopModel.js — job: build the bridge/REINFORCEMENTS shop model — locus line, credits and one card per buyable ship.
// Owner: hud.js. Holds no state.
// ============================================================

// The shop model: warp-locus status line, credits and one card per buyable
// ship. Pure: query deps + input in, plain modal model out. This file is just
// this one function; the composing parent captures the binding when it loads
// the file.
const buildBridgeShopModel = function (deps, input) {
  const selUnit = input.selectedUnit;
  const isCapitalSelected = Boolean(selUnit && selUnit.team === 1 && selUnit.flags.has("#capital ship"));
  const validCells = isCapitalSelected ? deps.validWarpCells(selUnit) : [];
  const canDeployLocus = isCapitalSelected && validCells.length > 0 && input.state.ap > 0;

  let locusText;
  if (!isCapitalSelected) {
    locusText = "LOCUS OFFLINE: Select a friendly #capital ship on the board first to warp reinforcements!";
  } else if (validCells.length === 0) {
    locusText = `LOCUS OBSTRUCTED: ${selUnit.type} at [${selUnit.x},${selUnit.y}] has 0 vacant R:6 cells!`;
  } else {
    locusText = `ACTIVE LOCUS: ${selUnit.type.toUpperCase()} AT [${selUnit.x},${selUnit.y}] (${validCells.length} VACANT R:6 CELLS READY)`;
  }

  const shipSpecs = deps.shipSpecs;
  const cards = [];
  Object.entries(shipSpecs).forEach(([shipName, spec]) => {
    if (!spec.flags.includes("buyable")) return;
    const priceOk = Boolean(input.state.credits[1] >= spec.cost);
    const affordable = Boolean(canDeployLocus && priceOk);
    cards.push({
      shipName,
      cost: spec.cost,
      flagsText: spec.flags.filter(f => f !== "buyable").join(" ") || "STANDARD",
      hp: spec.hp,
      move: spec.move,
      fp: spec.firepower,
      range: spec.range,
      scan: spec.scan,
      priceOk,
      affordable,
      dummyUnit: { type: shipName, team: 1, hp: spec.hp, maxHp: spec.hp, flags: new Set(spec.flags) }
    });
  });

  return {
    credits: input.state.credits[1],
    locusOk: canDeployLocus,
    locusText,
    cards
  };
};
