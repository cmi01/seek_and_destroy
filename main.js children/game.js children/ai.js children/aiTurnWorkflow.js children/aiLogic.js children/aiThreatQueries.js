"use strict";

// ============================================================
// aiThreatQueries.js — job: answer the AI's danger queries over spotted enemies (railgun danger zones, flagship-threat clearance).
// Owner: aiLogic.js. Holds no state.
// ============================================================

// ONE composing function. The operation name selects which of this file's
// single-function children answers — the two danger views. Each child is a
// classic script loaded by the central loader before this function is ever
// called, so each is visible here by name: no registrar, no globals.

const queryAIDanger = function (env, ctx, operation){
  if (operation === "railgunDangerZones") return listRailgunDangerZones(env, ctx);
  if (operation === "canEliminateAllFlagshipThreats") return canClearFlagshipThreats(env, ctx);
  throw new Error("[S&D AI] Unknown danger query: " + operation);
};
