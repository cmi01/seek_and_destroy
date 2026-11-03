"use strict";

// ============================================================
// uiTokens_DATA.js — job: return the 768-grid UI size tokens.
// Owner: main.js. Holds no state unless it is a core.
// ============================================================

// Design units for the square UI grid. Shared sizes live here once;
// the shell resolves them into CSS px. No widget reads this table.
const uiTokensTable = {
  designGrid: 768,
  textPx: 15,
  charAdvanceEm: 0.64,
  fontFamily: "'JetBrains Mono','Share Tech Mono','Consolas','Courier New',monospace",
  minimap: 120,
  padSm: 10,
  padMd: 18,
  padLg: 20,
  lineSm: 12,
  lineMd: 17,
  lineLg: 24,
  buttonH: 30,
  buttonHSm: 26,
  buttonHMd: 28,
  buttonInset: 22,
  headerCampaign: 48,
  headerBridge: 74,
  nodeR: 34,
  helpChrome: 88,
  endgamePanelW: 430,
  endgamePanelH: 172,
  topBarW: 340,
  reinforceW: 156,
  menuW: 80,
  endTurnW: 112,
  closeCampaignW: 98,
  closeBridgeW: 106,
  closeHelpW: 112,
  endgameBtnW: 156,
  cardW: 308,
  strokeHairline: 1,
  strokeThin: 1.2,
  strokeMid: 1.4,
  strokeRegular: 1.5,
  strokeHeavy: 2,
  strokeFocus: 2.2,
  labels: {
    closeCampaign: "CLOSE [ESC]",
    closeBridge: "RESUME [SPC]",
    closeHelp: "CLOSE",
    endgame: "REDEPLOY SECTOR",
    reinforce: "REINFORCEMENTS",
    menu: "MENU v",
    endTurn: "END TURN"
  }
};
