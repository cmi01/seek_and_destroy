"use strict";

// ============================================================
// buildReserveButtons.js — job: build the reserve-view button grid — resume
// plus one cell per reserve hull (summon, 1 AP, 0 credits).
// Owner: hud.js. Holds no state.
// ============================================================
const buildReserveButtons = function (input, bridgeModal) {
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
      id: "RESERVE_SUMMON:" + c.shipName,
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
