"use strict";

// ============================================================
// aiTurnWorkflow.js — job: sequence the AI turn's action beats.
// Owner: ai.js. Holds no state.
// ============================================================

// ONE composing function. Its children — the decision composition and the
// reservation bookkeeping — are classic scripts loaded by the central loader
// (the shell) before this function is ever called, so each child's single
// binding is visible here by name: no load handshake, no registrar.

// One-way boundary: nothing is written onto snapshot. The decision's
// plain result flows up with reservations recomputed here.
const evaluateTurnStep = function (env, snapshot){
  const fallback = () => (env && typeof env.fallbackEvaluate === "function")
    ? env.fallbackEvaluate(snapshot)
    : {
        action: "NONE", coord: [-1, -1], decision: null, selectedPlan: null,
        reservations: new Map(), lastSeenEnemies: new Map(),
        aiEmergencyMode: false, aiScoreTrace: []
      };
  if (!snapshot) return fallback();
  const prioritiesObj = env && env.priorities ? env.priorities(snapshot) : null;

  let result = null;
  try {
    result = evaluateAITurn(snapshot, prioritiesObj);
  } catch (err) {
    // Keep the AI turn alive (fallback below), but never hide the cause.
    console.error("[S&D AI] GetAIAction threw; using fallback action:", err);
    result = null;
  }

  if (result && typeof result === "object"){
    const cfg = env && env.cfg ? env.cfg(snapshot) : { focusFire: true };
    result.reservations = computeUpdatedReservations(
      snapshot,
      result.selectedPlan,
      Boolean(cfg && cfg.focusFire)
    );
    return result;
  }
  return fallback();
};
