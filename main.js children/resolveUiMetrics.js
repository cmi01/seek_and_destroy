"use strict";

// ============================================================
// resolveUiMetrics.js — job: resolve design-unit tokens into CSS-px UI metrics.
// Owner: main.js. Holds no state.
// ============================================================

// One pure function: tokens + scale facts in, plain CSS-px numbers out.
// The only floor is the stroke hairline (sub-pixel case). Widget code
// must not invent its own.
const resolveUiMetrics = function (tokens, scaleFacts) {
  const t = tokens || {};
  const facts = scaleFacts || {};
  const us = (typeof facts.uiScale === "number" && facts.uiScale > 0) ? facts.uiScale : 1;
  const rs = (typeof facts.renderScale === "number" && facts.renderScale > 0) ? facts.renderScale : 1;
  const px = function (design) { return Math.round((design || 0) * us); };
  const textPx = px(t.textPx || 15);
  const advance = (typeof t.charAdvanceEm === "number") ? t.charAdvanceEm : 0.64;
  const charW = Math.max(1, textPx * advance);
  const inset = (typeof t.buttonInset === "number") ? t.buttonInset : 22;
  const labels = t.labels || {};
  const fit = function (label, designW) {
    const chars = String(label || "").length;
    const fromLabel = Math.round(chars * charW + inset * us);
    return Math.max(px(designW || 0), fromLabel);
  };
  const stroke = function (w) {
    const scaled = (w || 1) * us;
    return Math.max(1 / rs, scaled);
  };
  return {
    textPx: textPx,
    charW: charW,
    fontFamily: t.fontFamily || "monospace",
    minimap: px(t.minimap || 120),
    padSm: px(t.padSm || 10),
    padMd: px(t.padMd || 18),
    padLg: px(t.padLg || 20),
    lineSm: px(t.lineSm || 12),
    lineMd: px(t.lineMd || 17),
    lineLg: px(t.lineLg || 24),
    buttonH: px(t.buttonH || 30),
    buttonHSm: px(t.buttonHSm || 26),
    buttonHMd: px(t.buttonHMd || 28),
    headerCampaign: px(t.headerCampaign || 48),
    headerBridge: px(t.headerBridge || 74),
    nodeR: px(t.nodeR || 34),
    helpChrome: px(t.helpChrome || 88),
    endgamePanelW: px(t.endgamePanelW || 430),
    endgamePanelH: px(t.endgamePanelH || 172),
    topBarW: px(t.topBarW || 340),
    cardW: px(t.cardW || 308),
    reinforceW: fit(labels.reinforce, t.reinforceW || 156),
    menuW: fit(labels.menu, t.menuW || 80),
    endTurnW: fit(labels.endTurn, t.endTurnW || 112),
    closeCampaignW: fit(labels.closeCampaign, t.closeCampaignW || 98),
    closeBridgeW: fit(labels.closeBridge, t.closeBridgeW || 106),
    closeHelpW: fit(labels.closeHelp, t.closeHelpW || 112),
    endgameBtnW: fit(labels.endgame, t.endgameBtnW || 156),
    confirmDeployW: fit(labels.confirmDeploy, t.confirmDeployW || 176),
    stroke: {
      hairline: stroke(t.strokeHairline || 1),
      thin: stroke(t.strokeThin || 1.2),
      mid: stroke(t.strokeMid || 1.4),
      regular: stroke(t.strokeRegular || 1.5),
      heavy: stroke(t.strokeHeavy || 2),
      focus: stroke(t.strokeFocus || 2.2)
    }
  };
};
