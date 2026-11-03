"use strict";

// ============================================================
// buildReserveModel.js — job: build the REINFORCEMENTS fleet/reserve view —
// flagship locus line and one card per reserve hull (no in-battle prices).
// Owner: hud.js. Holds no state.
// ============================================================
const buildReserveModel = function (deps, input) {
  const units = (input.state && input.state.units) || [];
  let flag = null;
  for (let i = 0; i < units.length; i++){
    const u = units[i];
    if (u && u.team === 1 && u.hp > 0 && u.flags && u.flags.has("!flagship")){
      flag = u;
      break;
    }
  }
  const validCells = flag ? deps.validWarpCells(flag) : [];
  const canDeployLocus = Boolean(flag && validCells.length > 0 && input.state.ap > 0);

  let locusText;
  if (!flag) {
    locusText = "LOCUS OFFLINE: No friendly !flagship on the board — only the flagship anchors a summon.";
  } else if (validCells.length === 0) {
    locusText = "LOCUS OBSTRUCTED: " + flag.type + " at [" + flag.x + "," + flag.y + "] has 0 vacant visible cells within 3.";
  } else {
    locusText = "ACTIVE LOCUS: " + flag.type.toUpperCase() + " AT [" + flag.x + "," + flag.y + "] (" + validCells.length + " VACANT CELLS WITHIN 3)";
  }

  const reserve = (input.state && Array.isArray(input.state.battleReserve)) ? input.state.battleReserve : [];
  const shipSpecs = deps.shipSpecs;
  const cards = [];
  for (let i = 0; i < reserve.length; i++){
    const entry = reserve[i];
    const shipName = entry.hull || entry.type;
    const spec = shipSpecs[shipName] || {};
    cards.push({
      shipName: shipName,
      cost: 0,
      flagsText: (spec.flags || []).filter(function (f) { return f !== "buyable"; }).join(" ") || "RESERVE",
      hp: (entry.hp !== undefined) ? entry.hp : spec.hp,
      move: spec.move,
      fp: spec.firepower,
      range: spec.range,
      scan: spec.scan,
      priceOk: true,
      affordable: Boolean(canDeployLocus),
      dummyUnit: { type: shipName, team: 1, hp: spec.hp, maxHp: spec.hp, flags: new Set(spec.flags || []) }
    });
  }

  return {
    credits: 0,
    locusOk: canDeployLocus,
    locusText: locusText,
    cards: cards
  };
};
