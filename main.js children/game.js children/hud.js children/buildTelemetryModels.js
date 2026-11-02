"use strict";

// ============================================================
// buildTelemetryModels.js — job: build the hovered and selected telemetry-card models.
// Owner: hud.js. Holds no state.
// ============================================================

// The hovered + selected card models for one input frame; the per-kind card
// builders stay private to this file. Pure: query deps + input state in,
// plain telemetry models out. This file is just this one function; the
// composing parent captures the binding when it loads the file.
const buildTelemetryModels = function (deps, input) {
  // ---- private per-kind builders (this file's one function only) --------
  const buildUnitTelemetryModel = function (deps, unit, coordStr) {
    const effScan = deps.effectiveScan(unit);
    const inNebula = deps.terrainAt(unit.x, unit.y) === "NEBULA";
    const teamLabel = unit.team === 1 ? "BLUE FLEET [T1]" : "SYNDICATE [T2]";

    let locusTag = "";
    if (unit.team === 1 && unit.flags.has("#capital ship")) {
      const openCells = deps.validWarpCells(unit).length;
      locusTag = `WARP LOCUS [R:6]: ${openCells} VACANT — [SPACE]`;
    }

    const flagDescs = deps.flagDescriptions;
    const flags = Array.from(unit.flags).filter(f => f !== "buyable").map(flag => {
      let category = "abil";
      if (flag.startsWith("!")) category = "crit";
      else if (flag.startsWith("+")) category = "buff";
      else if (flag.startsWith("-")) category = "exh";
      return {
        flag,
        category,
        desc: (flagDescs && flagDescs[flag]) || ""
      };
    });

    return {
      coordTag: coordStr,
      kind: "unit",
      isHostile: unit.team === 2,
      title: unit.type.toUpperCase(),
      subtitle: `${teamLabel} // ${unit.cost} ⒸB`,
      locusTag,
      hp: unit.hp,
      maxHp: unit.maxHp,
      stats: `MOV:${unit.move}  SCN:${effScan}${inNebula ? "(N)" : ""}  FP:${unit.firepower}  RNG:${unit.range}`,
      flags,
      lines: []
    };
  };

  const buildTerrainTelemetryModel = function (deps, gx, gy, coordStr) {
    const isVis = deps.cellVisible(gx, gy);
    if (!isVis) {
      return {
        coordTag: coordStr,
        kind: "terrain",
        isHostile: false,
        title: "UNSCANNED FOG OF WAR",
        subtitle: "Outside friendly sensor envelope",
        locusTag: "",
        hp: 0,
        maxHp: 0,
        stats: "",
        flags: [],
        lines: ["Move a sensor vessel within scan range to unmask."]
      };
    }
    const t = deps.terrainAt(gx, gy);
    if (t === "ASTEROID") {
      return {
        coordTag: coordStr,
        kind: "terrain",
        isHostile: false,
        title: "SOLID ASTEROID CLUSTER",
        subtitle: "Impassable planetoid mass",
        locusTag: "",
        hp: 0,
        maxHp: 0,
        stats: "",
        flags: [],
        lines: ["Blocks helm movement and weapon fire rays."]
      };
    }
    if (t === "NEBULA") {
      return {
        coordTag: coordStr,
        kind: "terrain",
        isHostile: false,
        title: "PURPLE FOG NEBULA",
        subtitle: "Ionized plasma cloud (effectiveScan = 1)",
        locusTag: "",
        hp: 0,
        maxHp: 0,
        stats: "",
        flags: [],
        lines: ["Cloaks occupant unless enemy is within d <= 1.0."]
      };
    }
    return {
      coordTag: coordStr,
      kind: "terrain",
      isHostile: false,
      title: "OPEN DEEP SPACE",
      subtitle: "Clear sector vacuum",
      locusTag: "",
      hp: 0,
      maxHp: 0,
      stats: "",
      flags: [],
      lines: ["Unobstructed movement, fire LOS, and sensors."]
    };
  };

  // ---- the two cards for this frame -------------------------------------
  let hoveredTelemetry;
  if (!input.state.hoveredCell) {
    hoveredTelemetry = {
      coordTag: "[-- , --]",
      kind: "none",
      isHostile: false,
      title: "AWAITING SENSOR CURSOR...",
      subtitle: "",
      hp: 0,
      maxHp: 0,
      stats: "",
      flags: [],
      lines: []
    };
  } else {
    const { x, y } = input.state.hoveredCell;
    const coordStr = `[${String(x).padStart(2, "0")} , ${String(y).padStart(2, "0")}]`;
    const unit = deps.getUnitAt(x, y);
    const spotted = unit && deps.isSpotted(unit);
    if (spotted) {
      hoveredTelemetry = buildUnitTelemetryModel(deps, unit, coordStr);
    } else {
      hoveredTelemetry = buildTerrainTelemetryModel(deps, x, y, coordStr);
    }
  }

  let selectedTelemetry;
  const selUnit = input.selectedUnit;
  if (!selUnit || selUnit.team !== 1) {
    selectedTelemetry = {
      coordTag: "[-- , --]",
      kind: "none",
      title: "NO FRIENDLY VESSEL SELECTED",
      subtitle: "Click any Blue Fleet vessel to inspect or issue orders.",
      locusTag: "",
      hp: 0,
      maxHp: 0,
      stats: "",
      flags: []
    };
  } else {
    const coordStr = `[${String(selUnit.x).padStart(2, "0")} , ${String(selUnit.y).padStart(2, "0")}]`;
    selectedTelemetry = buildUnitTelemetryModel(deps, selUnit, coordStr);
  }

  return { hoveredTelemetry, selectedTelemetry };
};
