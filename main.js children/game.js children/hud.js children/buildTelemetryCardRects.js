"use strict";

// ============================================================
// buildTelemetryCardRects.js — job: place the selected/hovered telemetry cards on the right-edge stack.
// Owner: hud.js. Holds no state.
// ============================================================

// Card placement for the right-edge stack: selected card above the hovered
// card, both anchored off the bottom button row and the minimap rect.
// `chrome` is the top-bar metrics fragment (padRight/botY); heights stick
// across frames via the previous panelRects. Pure: plain data out. This file
// is just this one function; the composing parent captures the binding when
// it loads the file.
const buildTelemetryCardRects = function (input, view, chrome, mmRect) {
  // ---- private height estimate (this file's one function only) ----------
  const estimateTelemetryCardHeight = function (model, inspectMode, US) {
    if (!model || model.kind === "none") return 0;
    const ui = input && input.metrics && input.metrics.ui;
    const padY = Math.round(6 * US);
    const headerH = (ui && ui.lineMd) ? Math.round(18 * US) : Math.round(18 * US);
    const lineH = (ui && ui.lineMd) || Math.round(17 * US);
    // Compact card: header + HP row + stats row; flag details in inspect mode.
    let rows = 2;
    if (model.kind === "unit") {
      if (inspectMode) rows += 1 + (model.locusTag ? 1 : 0);
      // M5(c) Q8: one row per mounted weapon on multi-weapon hulls (the
      // picker buttons live in those rows).
      rows += Array.isArray(model.weaponRows) ? model.weaponRows.length : 0;
    } else {
      rows += 1 + (Array.isArray(model.lines) ? model.lines.length : 0);
    }
    return padY * 2 + headerH + rows * lineH;
  };

  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;

  const cardW = Math.min((input.metrics.ui && input.metrics.ui.cardW) || Math.round(308 * US), Math.max(Math.round(190 * US), DS - (mmRect.x + mmRect.w) - Math.round(24 * US)));
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

  // M5(c) Q8: the weapon-picker buttons fill the selected card's weapon
  // rows (one per mount on a multi-weapon hull) — plain button rects, the
  // generic button renderer draws them.
  const weaponButtons = [];
  if (selRect && view.selectedTelemetry && Array.isArray(view.selectedTelemetry.weaponRows)) {
    const rowsW = view.selectedTelemetry.weaponRows;
    const lineH = ((input.metrics.ui && input.metrics.ui.lineMd) || Math.round(17 * US));
    const padY = Math.round(6 * US);
    for (let i = 0; i < rowsW.length; i++) {
      const r = rowsW[i];
      weaponButtons.push({
        id: r.id,
        label: r.name + "  D:" + r.dmg + " R:" + r.range,
        x: selRect.x + padY,
        y: selRect.y + selRect.h - padY - (rowsW.length - i) * lineH,
        w: selRect.w - padY * 2,
        h: Math.max(Math.round(8 * US), lineH - Math.round(2 * US)),
        enabled: true,
        active: Boolean(r.active)
      });
    }
  }

  return { selectedCard: selRect, hoveredCard: hovRect, weaponButtons: weaponButtons };
};
