"use strict";

// ============================================================
// hudTelemetry.js — job: build the hovered/selected telemetry-card models, the card-height estimate and the card rects.
// Owner: core/hud.js. Holds no state unless it is a core.
// ============================================================
(() => {
  function estimateTelemetryCardHeight(model, inspectMode, US) {
    if (!model || model.kind === "none") return 0;
    const padY = Math.round(6 * US);
    const headerH = Math.max(16, Math.round(18 * US));
    const lineH = Math.max(15, Math.round(17 * US));
    // Compact card: header + HP row + stats row; flag details in inspect mode.
    let rows = 2;
    if (model.kind === "unit") {
      if (inspectMode) rows += 1 + (model.locusTag ? 1 : 0);
    } else {
      rows += 1 + (Array.isArray(model.lines) ? model.lines.length : 0);
    }
    return Math.max(Math.round(52 * US), padY * 2 + headerH + rows * lineH);
  }

  function buildUnitTelemetryModel(deps, unit, coordStr) {
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
  }

  function buildTerrainTelemetryModel(deps, gx, gy, coordStr) {
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
  }

  // The hovered + selected card models for one input frame. Pure: query deps
  // + input state in, plain telemetry models out.
  function buildTelemetryModels(deps, input) {
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
  }

  // Card placement for the right-edge stack: selected card above the hovered
  // card, both anchored off the bottom button row and the minimap rect.
  // `chrome` is the top-bar child's metrics fragment (padRight/botY); heights
  // stick across frames via the previous panelRects. Pure: plain data out.
  function buildTelemetryCardRects(input, view, chrome, mmRect) {
    const DS = input.metrics.displaySize;
    const US = input.metrics.uiScale;

    const cardW = Math.min(Math.round(308 * US), Math.max(Math.round(190 * US), DS - (mmRect.x + mmRect.w) - Math.round(24 * US)));
    const cardX = DS - chrome.padRight - cardW;
    let nextCardBottom = chrome.botY - Math.round(7 * US);
    let selRect = null;
    let hovRect = null;

    if (view.selectedTelemetry && view.selectedTelemetry.kind === "unit") {
      const sh = (view.panelRects.selectedCard && view.panelRects.selectedCard.h)
        ? view.panelRects.selectedCard.h
        : estimateTelemetryCardHeight(view.selectedTelemetry, input.state.inspectMode, US);
      const sy = Math.max(Math.round(8 * US), nextCardBottom - sh);
      selRect = { x: cardX, y: sy, w: cardW, h: sh };
      nextCardBottom = sy - Math.round(6 * US);
    }

    const hoverSameAsSelected = Boolean(
      selRect &&
      input.state.selectedCell &&
      input.state.hoveredCell &&
      input.state.hoveredCell.x === input.state.selectedCell.x &&
      input.state.hoveredCell.y === input.state.selectedCell.y
    );
    if (input.state.inspectMode && input.state.hoveredCell && !hoverSameAsSelected && view.hoveredTelemetry && view.hoveredTelemetry.kind !== "none") {
      const hh = (view.panelRects.hoveredCard && view.panelRects.hoveredCard.h)
        ? view.panelRects.hoveredCard.h
        : estimateTelemetryCardHeight(view.hoveredTelemetry, input.state.inspectMode, US);
      const hy = Math.max(Math.round(8 * US), nextCardBottom - hh);
      hovRect = { x: cardX, y: hy, w: cardW, h: hh };
    }

    return { selectedCard: selRect, hoveredCard: hovRect };
  }

  createHud._register("telemetry", {
    buildTelemetryModels,
    buildTelemetryCardRects
  });
})();
