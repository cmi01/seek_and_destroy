"use strict";

// ============================================================
// buildEndgameButtons.js — job: build the endgame panel's two verdict buttons.
// Owner: hud.js. Holds no state.
// ============================================================

// The endgame panel's two verdict buttons. Pure: modal model + input in,
// plain button list out. This file is just this one function; the composing
// parent captures the binding when it loads the file.
const buildEndgameButtons = function (input, modal) {
  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const mw = Math.min(DS - Math.round(36 * US), Math.round(430 * US));
  const mh = Math.round(172 * US);
  const mx = Math.round((DS - mw) * 0.5);
  const my = Math.round((DS - mh) * 0.5);
  const btnW = Math.round(156 * US);
  const btnH = Math.max(24, Math.round(28 * US));
  const gap = Math.round(12 * US);
  const b1X = Math.round(mx + (mw - (btnW * 2 + gap)) * 0.5);
  const b2X = b1X + btnW + gap;
  const btnY = my + mh - btnH - Math.round(16 * US);
  return [
    { id: "ENDGAME_RETRY", label: "REDEPLOY SECTOR", x: b1X, y: btnY, w: btnW, h: btnH, enabled: true, active: !modal.isVictory },
    { id: "ENDGAME_MAP",   label: "SECTOR MAP",      x: b2X, y: btnY, w: btnW, h: btnH, enabled: true, active: Boolean(modal.isVictory) }
  ];
};
