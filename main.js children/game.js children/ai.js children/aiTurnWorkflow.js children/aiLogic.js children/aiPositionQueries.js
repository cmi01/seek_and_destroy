"use strict";

// ============================================================
// aiPositionQueries.js — job: answer the AI's move-destination queries (reachable cells, ranked toward contacts).
// Owner: aiLogic.js. Holds no state.
// ============================================================

// ONE composing function. The operation name selects which of this file's
// single-function children answers — the two move-destination views. Each
// child is a classic script loaded by the central loader before this function
// is ever called, so each is visible here by name: no registrar, no globals.
// `arg` is the ranking destination for one operation and the cell cap for the
// other; every child returns plain data and nothing is held between calls.

const queryAIMoveOptions = function (env, ctx, operation, u, arg){
  if (operation === "moveHeuristic") return rankMoveTargets(env, ctx, u, arg);
  if (operation === "reachableCells") return listReachableCells(env, ctx, u, arg);
  throw new Error("[S&D AI] Unknown move-destination query: " + operation);
};
