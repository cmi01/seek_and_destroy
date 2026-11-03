"use strict";

// ============================================================
// aiStateQueries.js — job: answer the AI's contact-picture state queries (own living units, spotted enemies, active beliefs).
// Owner: aiLogic.js. Holds no state.
// ============================================================

// ONE composing function. The operation name selects which of this file's
// single-function children answers — the contact picture's three views. Each
// child is a classic script loaded by the central loader before this function
// is ever called, so each is visible here by name: no registrar, no globals.
// Every child gets the AI env facade plus the state snapshot and returns
// plain data; nothing here holds anything between calls.

const queryAIState = function (env, ctx, operation){
  if (operation === "myUnits") return listMyUnits(env, ctx);
  if (operation === "spottedEnemies") return listSpottedEnemies(env, ctx);
  if (operation === "activeBeliefs") return listActiveBeliefs(env, ctx);
  throw new Error("[S&D AI] Unknown contact-picture query: " + operation);
};
