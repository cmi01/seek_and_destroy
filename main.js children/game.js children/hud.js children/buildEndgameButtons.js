"use strict";

// ============================================================
// buildEndgameButtons.js — job: build the endgame panel's two verdict buttons.
// Owner: hud.js. Holds no state.
// ============================================================

// The endgame panel's two verdict buttons plus the panel rect and wrapped
// body lines. Pure: modal model + input in, plain data out. This file is
// just this one function; the composing parent captures the binding when it
// loads the file.
const buildEndgameButtons = function (input, modal) {
  const wrapLines = function (text, availW, advance) {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let cur = "";
    const step = advance > 0 ? advance : 1;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word) continue;
      const test = cur ? (cur + " " + word) : word;
      if (cur && test.length * step > availW) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const ui = input.metrics.ui || null;
  const px = function (design) { return Math.round(design * US); };
  const textPx = (ui && ui.textPx) || px(15);
  const charW = (ui && ui.charW) || Math.max(1, textPx * 0.64);
  const mw = Math.min(DS - px(36), (ui && ui.endgamePanelW) || px(430));
  const btnW = Math.min((ui && ui.endgameBtnW) || px(156), Math.floor((mw - px(28)) / 2));
  const btnH = (ui && ui.buttonHMd) || px(28);
  const gap = px(12);
  const lineH = px(14);
  const innerW = mw - px(32);
  const bodyLines = wrapLines(modal && modal.body, innerW, charW);
  const contentH = px(18) + px(20) + bodyLines.length * lineH + px(12) + btnH + px(16);
  const designH = (ui && ui.endgamePanelH) || px(172);
  let mh = Math.max(designH, contentH);
  const maxH = DS - px(8);
  if (mh > maxH) mh = maxH;
  const mx = Math.round((DS - mw) * 0.5);
  const my = Math.round((DS - mh) * 0.5);
  const b1X = Math.round(mx + (mw - (btnW * 2 + gap)) * 0.5);
  const b2X = b1X + btnW + gap;
  const btnY = my + mh - btnH - px(16);
  const bodyTop = my + px(46);
  const room = btnY - bodyTop - px(6);
  const maxLines = Math.max(0, Math.floor(room / Math.max(1, lineH)));
  const lines = bodyLines.slice(0, maxLines);
  return {
    buttons: [
      { id: "ENDGAME_RETRY", label: "REDEPLOY SECTOR", x: b1X, y: btnY, w: btnW, h: btnH, enabled: true, active: !(modal && modal.isVictory) },
      { id: "ENDGAME_MAP",   label: "SECTOR MAP",      x: b2X, y: btnY, w: btnW, h: btnH, enabled: true, active: Boolean(modal && modal.isVictory) }
    ],
    panel: { x: mx, y: my, w: mw, h: mh },
    lines: lines,
    lineH: lineH
  };
};
