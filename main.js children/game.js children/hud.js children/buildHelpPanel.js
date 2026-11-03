"use strict";

// ============================================================
// buildHelpPanel.js — job: build the HELP panel geometry — wrapped rows, panel rect and close button.
// Owner: hud.js. Holds no state.
// ============================================================

// The HELP panel geometry: canvas panel holding the text that is otherwise
// hidden from the HUD. Rows wrap within the estimated budget and the panel
// stays inside the canvas. Pure: lines + input in, out. This file is just
// this one function; the composing parent captures the binding when it loads
// the file.
const buildHelpPanel = function (input, lines) {
  const wrapHelpRows = function (lines, availW, fontPx, advance) {
    const charW = advance > 0 ? advance : Math.max(1, fontPx * 0.64);
    const perRow = Math.max(8, Math.floor(availW / charW));
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
  const ui = input.metrics.ui || null;
  const px = function (design) { return Math.round(design * US); };
  const margin = (ui && ui.padSm) || px(10);
  const hw = Math.min(DS - px(36), px(620));
  const lineH = (ui && ui.lineLg) || px(24);
  const textPx = (ui && ui.textPx) || px(15);
  const charW = (ui && ui.charW) || Math.max(1, textPx * 0.64);
  const rows = wrapHelpRows(lines, hw - px(36), textPx, charW);
  const closeW = (ui && ui.closeHelpW) || px(112);
  const closeH = (ui && ui.buttonH) || px(30);
  const chrome = (ui && ui.helpChrome) || px(88);
  let hh = chrome + rows.length * lineH;
  const maxH = DS - margin * 2;
  if (hh > maxH) hh = maxH;
  if (hh < closeH + px(28)) hh = Math.min(maxH, closeH + px(28));
  const hx = Math.round((DS - hw) * 0.5);
  let hy = Math.round((DS - hh) * 0.5);
  if (hy < margin) hy = margin;
  if (hy + hh > DS - margin) hy = Math.max(margin, DS - margin - hh);
  const closeBtn = {
    id: "CLOSE_MODAL", label: "CLOSE",
    x: hx + hw - closeW - px(14),
    y: hy + hh - closeH - px(14),
    w: closeW, h: closeH, enabled: true, active: false
  };
  return { rows, rect: { x: hx, y: hy, w: hw, h: hh }, closeBtn };
};
