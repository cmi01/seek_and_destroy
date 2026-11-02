"use strict";

// ============================================================
// buildCampaignLayout.js — job: build the starmap's clickable node/button geometry from the campaign cards.
// Owner: hud.js. Holds no state.
// ============================================================

// The starmap's clickable geometry: one node per campaign level, connected in
// campaign order. Node geometry is shared with the renderer (it reads the same
// nodes/layout from the HUD snapshot), so the hit regions stored here exactly
// match what is drawn. Pure: cards + input in, plain data out. This file is
// just this one function; the composing parent captures the binding when it
// loads the file.
const buildCampaignLayout = function (input, cards) {
  // ---- private starmap layout (this file's one function only) -----------
  // Single deterministic source of truth for the campaign starmap. Both the
  // hit-test layout and the starmap renderer consume the node geometry
  // computed here, so the clickable regions always match what is drawn. Pure:
  // depends only on the card list and the canvas size.
  const computeStarmapLayout = function (cards, DS, US) {
    const pad = Math.max(12, Math.round(20 * US));
    const mx = pad, my = pad;
    const mw = DS - pad * 2, mh = DS - pad * 2;
    const hdrH = Math.round(48 * US);
    const closeW = Math.max(82, Math.round(98 * US));
    const closeH = Math.max(22, Math.round(26 * US));
    const closeX = mx + mw - closeW - Math.round(10 * US);
    const closeY = my + Math.round(11 * US);
    const closeBtn = { id: "CLOSE_MODAL", label: "CLOSE [ESC]", x: closeX, y: closeY, w: closeW, h: closeH, enabled: true, active: false };

    const list = Array.isArray(cards) ? cards : [];
    const n = Math.max(1, list.length);
    const sideM = Math.round(84 * US);
    const contentX0 = mx + sideM;
    const contentX1 = mx + mw - sideM;
    const contentTop = my + hdrH + Math.round(44 * US);
    const contentBot = my + mh - Math.round(58 * US);
    const midY = (contentTop + contentBot) * 0.5;
    const amp = (contentBot - contentTop) * 0.5 * 0.62;
    const r = Math.max(22, Math.round(34 * US));
    const hitW = Math.max(2 * r + Math.round(10 * US), Math.round(132 * US));
    const hitH = 2 * r + Math.round(40 * US); // circle + label band beneath

    const nodes = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const t = n > 1 ? i / (n - 1) : 0.5;
      const cx = Math.round(contentX0 + (contentX1 - contentX0) * t);
      const cy = Math.round(midY - Math.cos(i * Math.PI) * amp);
      nodes.push({
        id: c.id,
        cx, cy, r,
        hitX: Math.round(cx - hitW * 0.5),
        hitY: Math.round(cy - r - Math.round(5 * US)),
        hitW, hitH
      });
    }
    return { mx, my, mw, mh, hdrH, closeBtn, nodes };
  };

  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const layout = computeStarmapLayout(cards, DS, US);
  const buttons = [layout.closeBtn];
  for (let i = 0; i < layout.nodes.length; i++) {
    const node = layout.nodes[i];
    const c = cards[i] || {};
    buttons.push({
      id: "LEVEL_SELECT:" + node.id,
      label: c.title,
      x: node.hitX,
      y: node.hitY,
      w: node.hitW,
      h: node.hitH,
      enabled: true,
      active: c.isDone
    });
  }
  return {
    buttons,
    nodes: layout.nodes,
    layout: {
      mx: layout.mx, my: layout.my, mw: layout.mw, mh: layout.mh,
      hdrH: layout.hdrH, closeBtn: layout.closeBtn
    }
  };
};
