"use strict";

// ============================================================
// buildHelpPanel.js — job: build the HELP panel geometry — wrapped rows, panel rect and close button.
// Owner: hud.js. Holds no state.
// ============================================================

// The HELP panel geometry: fixed-size canvas panel holding the text that is
// otherwise hidden from the HUD. Rows wrap within the estimated budget and the
// panel height tracks the row count. Pure: lines + input in, out. This file is
// just this one function; the composing parent captures the binding when it
// loads the file.
const buildHelpPanel = function (input, lines) {
  // ---- private row wrapper (this file's one function only) --------------
  // Wrap help rows to the panel width. Pure: no measuring context here, so
  // the row budget uses the monospace advance estimate (0.64em, deliberately
  // conservative). The renderer fits every row to the panel as a hard
  // guarantee, so a slightly short row budget only costs an extra row.
  const wrapHelpRows = function (lines, availW, fontPx) {
    const charW = Math.max(1, fontPx * 0.64);
    const perRow = Math.max(12, Math.floor(availW / charW));
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = String(lines[i] || "");
      const isHead = raw.charAt(0) === "#";
      const words = (isHead ? raw.slice(1) : raw).split(" ");
      let cur = "";
      let first = true;
      for (let j = 0; j < words.length; j++) {
        const word = words[j];
        if (!cur.length) { cur = word; }
        else if ((cur + " " + word).length <= perRow) { cur += " " + word; }
        else { rows.push({ text: cur, head: isHead && first }); first = false; cur = word; }
      }
      rows.push({ text: cur, head: isHead && first });
    }
    return rows;
  };

  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const hw = Math.min(DS - Math.round(36 * US), Math.round(620 * US));
  const lineH = Math.round(24 * US);
  const textPx = Math.max(8, Math.round(15 * US));
  const rows = wrapHelpRows(lines, hw - Math.round(36 * US), textPx);
  const hh = Math.round(88 * US) + rows.length * lineH;
  const hx = Math.round((DS - hw) * 0.5);
  const hy = Math.round((DS - hh) * 0.5);
  const closeW = Math.round(112 * US);
  const closeH = Math.round(30 * US);
  const closeBtn = {
    id: "CLOSE_MODAL", label: "CLOSE",
    x: hx + hw - closeW - Math.round(14 * US),
    y: hy + hh - closeH - Math.round(14 * US),
    w: closeW, h: closeH, enabled: true, active: false
  };
  return { rows, rect: { x: hx, y: hy, w: hw, h: hh }, closeBtn };
};
