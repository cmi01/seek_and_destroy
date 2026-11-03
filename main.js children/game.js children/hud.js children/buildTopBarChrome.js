"use strict";

// ============================================================
// buildTopBarChrome.js — job: build the top-bar chrome geometry — action-button rows, edge metrics and the top-bar rect.
// Owner: hud.js. Holds no state.
// ============================================================

// The chrome geometry: two buttons top-right (reinforce + menu), one
// bottom-right (end turn), and the top-left bar rect sized to the buttons'
// left edge — the fixed-size 768 design grid scaled by uiScale. Pure: input
// in, plain metrics/button data out. This file is just this one function; the
// composing parent captures the binding when it loads the file.
const buildTopBarChrome = function (input, menuOpen) {
  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const isPlayerTurn = input.state.activeTeam === 1 && !input.state.gameOver;

  const ui = input.metrics.ui || null;
  const px = function (design) { return Math.round(design * US); };
  const btnH = (ui && ui.buttonH) || px(30);
  const gap = px(6);
  const padRight = (ui && ui.padSm) || px(10);
  const topY = px(10);
  const botY = DS - btnH - px(10);

  const topDefs = [
    { id: "REINFORCEMENTS", label: "REINFORCEMENTS", w: (ui && ui.reinforceW) || px(156), enabled: isPlayerTurn, active: false },
    { id: "MENU",           label: menuOpen ? "MENU ^" : "MENU v",          w: (ui && ui.menuW) || px(80), enabled: true,         active: menuOpen }
  ];

  const botDefs = [
    { id: "END_TURN", label: "END TURN", w: (ui && ui.endTurnW) || px(112), enabled: isPlayerTurn, active: false }
  ];

  const topButtons = [];
  let curRight = DS - padRight;
  for (let i = topDefs.length - 1; i >= 0; i--) {
    const d = topDefs[i];
    const bw = d.w;
    const x = curRight - bw;
    topButtons.unshift({ id: d.id, label: d.label, x, y: topY, w: bw, h: btnH, enabled: d.enabled, active: d.active });
    curRight = x - gap;
  }
  const topButtonsLeftEdge = topButtons.length > 0 ? topButtons[0].x : (DS - padRight);

  const bottomButtons = [];
  let botRight = DS - padRight;
  for (let i = botDefs.length - 1; i >= 0; i--) {
    const d = botDefs[i];
    const bw = d.w;
    const x = botRight - bw;
    bottomButtons.push({ id: d.id, label: d.label, x, y: botY, w: bw, h: btnH, enabled: d.enabled, active: d.active });
    botRight = x - gap;
  }

  const pad = (ui && ui.padSm) || Math.round(10 * US);
  const leftAvailW = Math.max(Math.round(160 * US), topButtonsLeftEdge - Math.round(18 * US));
  const barW = Math.min((ui && ui.topBarW) || Math.round(340 * US), leftAvailW);
  const barH = Math.round(46 * US);

  return {
    topButtons,
    bottomButtons,
    topButtonsLeftEdge,
    btnH,
    padRight,
    topY,
    botY,
    topBarRect: { x: pad, y: pad, w: barW, h: barH }
  };
};
