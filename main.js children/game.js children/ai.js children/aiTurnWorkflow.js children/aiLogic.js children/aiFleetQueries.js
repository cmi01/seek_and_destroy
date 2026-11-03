"use strict";

// ============================================================
// aiFleetQueries.js — job: answer the AI's fleet queries (capability gaps, warp-in loci).
// Owner: aiLogic.js. Holds no state.
// ============================================================

// ONE composing function. The operation name selects which of this file's
// single-function children answers — the two fleet views. Each child is a
// classic script loaded by the central loader before this function is ever
// called, so each is visible here by name: no registrar, no globals.

const queryAIFleet = function (env, ctx, operation){
  if (operation === "fleetGap") return assessFleetGap(env, ctx);
  if (operation === "warpLoci") return listWarpLoci(env, ctx);
  throw new Error("[S&D AI] Unknown fleet query: " + operation);
};
