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
  const ui = input.metrics.ui || null;
  const px = function (design) { return Math.round(design * US); };
  const pad = (ui && ui.padMd) || px(18);
  const mx = pad, my = pad;
  const mw = DS - pad * 2, mh = DS - pad * 2;
  const hdrH = (ui && ui.headerBridge) || px(74);
  const closeW = Math.min((ui && ui.closeBridgeW) || px(106), Math.max(px(40), mw - px(24)));
  const closeH = (ui && ui.buttonHSm) || px(26);
  const closeX = mx + mw - closeW - px(10);
  const closeY = my + px(11);
  const buttons = [
    { id: "CLOSE_MODAL", label: "RESUME [SPC]", x: closeX, y: closeY, w: closeW, h: closeH, enabled: true, active: false }
  ];
  const cards = Array.isArray(bridgeModal.cards) ? bridgeModal.cards : [];
  const cols = 3;
  const rows = Math.ceil(Math.max(1, cards.length) / cols);
  const gridPad = px(10);
  const gap = px(7);
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
  return {
    buttons: buttons,
    layout: { mx: mx, my: my, mw: mw, mh: mh, hdrH: hdrH, pad: pad, closeBtn: buttons[0] }
  };
};
