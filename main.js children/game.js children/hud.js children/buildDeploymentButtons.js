"use strict";

// ============================================================
// buildDeploymentButtons.js — job: build the deployment panel geometry —
// one toggle per non-flagship hull plus CONFIRM, using v107 metrics.ui.
// Owner: hud.js. Holds no state.
// ============================================================
const buildDeploymentButtons = function (input, modal) {
  const DS = input.metrics.displaySize;
  const US = input.metrics.uiScale;
  const ui = input.metrics.ui || null;
  const px = function (design) { return Math.round(design * US); };
  const rows = (modal && Array.isArray(modal.rows)) ? modal.rows : [];
  const mw = Math.min(DS - px(36), (ui && ui.endgamePanelW) || px(430));
  const btnH = (ui && ui.buttonHMd) || px(28);
  const rowH = (ui && ui.buttonHSm) || px(26);
  const gap = px(6);
  const pad = (ui && ui.padMd) || px(18);
  const inner = rows.length * (rowH + gap) + btnH + px(70);
  let mh = Math.max((ui && ui.endgamePanelH) || px(172), inner);
  const maxH = DS - px(8);
  if (mh > maxH) mh = maxH;
  const mx = Math.round((DS - mw) * 0.5);
  const my = Math.round((DS - mh) * 0.5);
  const buttons = [];
  let y = my + px(52);
  for (let i = 0; i < rows.length; i++){
    const r = rows[i];
    buttons.push({
      id: r.locked ? ("DEPLOY_LOCK:" + r.index) : ("DEPLOY_TOGGLE:" + r.index),
      label: (r.selected ? "[ON] " : "[  ] ") + r.hull + (r.flagship ? "  (FLAGSHIP)" : "") + (r.insufficient ? "  (LOW CREW)" : ""),
      x: mx + pad,
      y: y,
      w: mw - pad * 2,
      h: rowH,
      enabled: !r.locked && !r.insufficient,
      active: Boolean(r.selected)
    });
    y += rowH + gap;
  }
  const confirmW = Math.min((ui && ui.endgameBtnW) || px(156), mw - pad * 2);
  buttons.push({
    id: "DEPLOY_CONFIRM",
    label: "CONFIRM DEPLOYMENT",
    x: Math.round(mx + (mw - confirmW) * 0.5),
    y: my + mh - btnH - px(16),
    w: confirmW,
    h: btnH,
    enabled: true,
    active: true
  });
  return {
    buttons: buttons,
    panel: { x: mx, y: my, w: mw, h: mh }
  };
};
