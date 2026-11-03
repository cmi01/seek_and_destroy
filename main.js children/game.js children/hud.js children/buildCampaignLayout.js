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
    return lines.length ? lines : [""];
  };

  const computeStarmapLayout = function (cards, DS, US, ui) {
    const px = function (design) { return Math.round(design * US); };
    const pad = (ui && ui.padLg) || px(20);
    const mx = pad, my = pad;
    const mw = DS - pad * 2, mh = DS - pad * 2;
    const textPx = (ui && ui.textPx) || px(15);
    const charW = (ui && ui.charW) || Math.max(1, textPx * 0.64);
    const lineH = (ui && ui.lineMd) || px(17);
    const closeW = Math.min((ui && ui.closeCampaignW) || px(98), Math.max(px(40), mw - px(24)));
    const closeH = (ui && ui.buttonHSm) || px(26);
    const closeX = mx + mw - closeW - px(10);
    const closeY = my + px(11);
    const closeBtn = { id: "CLOSE_MODAL", label: "CLOSE [ESC]", x: closeX, y: closeY, w: closeW, h: closeH, enabled: true, active: false };
    const textX = mx + px(12);
    const hdrTextW = Math.max(px(40), closeX - textX - px(8));
    const title = "CAMPAIGN STARMAP // SECTOR NAVIGATION";
    const subtitle = "Select a sector node to deploy. Eliminate all Syndicate !flagship vessels to secure it.";
    const titleLines = wrapLines(title, hdrTextW, charW);
    const subtitleLines = wrapLines(subtitle, hdrTextW, charW);
    const hdrH = Math.max((ui && ui.headerCampaign) || px(48), px(8) + (titleLines.length + subtitleLines.length) * lineH + px(10));

    const list = Array.isArray(cards) ? cards : [];
    const n = Math.max(1, list.length);
    const sideM = px(84);
    const contentX0 = mx + sideM;
    const contentX1 = mx + mw - sideM;
    const contentTop = my + hdrH + px(44);
    const contentBot = my + mh - px(58);
    const midY = (contentTop + contentBot) * 0.5;
    const amp = (contentBot - contentTop) * 0.5 * 0.62;
    const r = (ui && ui.nodeR) || px(34);
    const labelBand = px(28);
    const hitW = Math.max(2 * r + px(10), px(132));
    const hitH = 2 * r + px(40);

    const nodes = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const t = n > 1 ? i / (n - 1) : 0.5;
      let cx = Math.round(contentX0 + (contentX1 - contentX0) * t);
      let cy = Math.round(midY - Math.cos(i * Math.PI) * amp);
      const minCy = contentTop + r;
      const maxCy = contentBot - r - labelBand;
      if (maxCy > minCy) cy = Math.max(minCy, Math.min(maxCy, cy));
      const minCx = mx + r + px(8);
      const maxCx = mx + mw - r - px(8);
      cx = Math.max(minCx, Math.min(maxCx, cx));
      nodes.push({
        id: c.id,
        cx, cy, r,
        hitX: Math.round(cx - hitW * 0.5),
        hitY: Math.round(cy - r - px(5)),
        hitW, hitH
      });
    }
    return { mx, my, mw, mh, hdrH, closeBtn, nodes, titleLines, subtitleLines, lineH };
  };

  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const ui = input.metrics.ui || null;
  const layout = computeStarmapLayout(cards, DS, US, ui);
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
      hdrH: layout.hdrH, closeBtn: layout.closeBtn,
      titleLines: layout.titleLines, subtitleLines: layout.subtitleLines, lineH: layout.lineH
    }
  };
};
