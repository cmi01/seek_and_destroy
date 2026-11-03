"use strict";

// ============================================================
// aiPreservationQueries.js — job: answer the AI's hull-preservation queries (a hull's preservation tier and retreat threshold).
// Owner: aiLogic.js. Holds no state.
// ============================================================

// ONE composing function. The operation name selects which of this file's
// single-function children answers — the two hull-preservation views. Each
// child is a classic script loaded by the central loader before this function
// is ever called, so each is visible here by name: no registrar, no globals.

const queryAIHullPreservation = function (env, ctx, operation, u){
  if (operation === "preservationTier") return hullPreservationTier(env, ctx, u);
  if (operation === "shouldRetreat") return shouldHullRetreat(env, ctx, u);
  throw new Error("[S&D AI] Unknown hull-preservation query: " + operation);
};
