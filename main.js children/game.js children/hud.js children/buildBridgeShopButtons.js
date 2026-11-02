"use strict";

// ============================================================
// buildBridgeShopButtons.js — job: build the bridge shop's button grid — resume button plus one cell per ship card.
// Owner: hud.js. Holds no state.
// ============================================================

// The shop's button grid: resume button plus one grid cell per ship card.
// Pure: input + the card list in, plain button list out. This file is just
// this one function; the composing parent captures the binding when it loads
// the file.
const buildBridgeShopButtons = function (input, bridgeModal) {
  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const pad = Math.max(12, Math.round(18 * US));
  const mx = pad, my = pad;
  const mw = DS - pad * 2, mh = DS - pad * 2;
  const hdrH = Math.round(74 * US);
  const uiTextPx = Math.max(8, Math.round(15 * US));
  const closeW = Math.max(88, Math.round(106 * US), Math.round(12 * 0.64 * uiTextPx) + Math.round(20 * US));
  const closeH = Math.max(22, Math.round(26 * US));
  const closeX = mx + mw - closeW - Math.round(10 * US);
  const closeY = my + Math.round(11 * US);
  const buttons = [
    { id: "CLOSE_MODAL", label: "RESUME [SPC]", x: closeX, y: closeY, w: closeW, h: closeH, enabled: true, active: false }
  ];
  const cards = Array.isArray(bridgeModal.cards) ? bridgeModal.cards : [];
  const cols = 3;
  const rows = Math.ceil(Math.max(1, cards.length) / cols);
  const gridPad = Math.round(10 * US);
  const gap = Math.round(7 * US);
  const gridX = mx + gridPad;
  const gridY = my + hdrH + gridPad;
  const gridW = mw - gridPad * 2;
  const gridH = mh - hdrH - gridPad * 2;
  const cardW = Math.floor((gridW - gap * (cols - 1)) / cols);
  const cardH = Math.floor((gridH - gap * (rows - 1)) / rows);
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    buttons.push({
      id: "SHOP_BUY:" + c.shipName,
      label: c.shipName,
      x: gridX + col * (cardW + gap),
      y: gridY + row * (cardH + gap),
      w: cardW,
      h: cardH,
      enabled: c.affordable,
      active: false
    });
  }
  return buttons;
};
