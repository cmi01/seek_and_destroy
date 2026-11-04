"use strict";

// ============================================================
// crewStatus.js — job: judge one unit's manning against the
// incapacitation threshold.
// Owner: actionLegality.js (pure). Holds no state.
//
// M4 interface (roadmap-design §5.4): crewStatus(unit, maxCrew?) →
// "ok" | "incapacitated". DESIGN §4.5: a ship under 50% crew cannot act in
// battle or be deployed to a battle ("crew incapacitated" in battle,
// "insufficient crew" out of battle) — strictly under half; exactly 50%
// stays operational. The manning maximum is read from unit.maxCrew (battle
// units and M4 roster entries carry it); an optional injected maxCrew
// covers callers holding the roster table (the frozen one-argument
// spelling is the interface). A unit whose manning maximum is unknown is
// not judged ("ok") — safe for pre-M4 saves before backfill.
// ============================================================

const crewStatus = function (unit, maxCrew){
  if (!unit || typeof unit !== "object") return "ok";
  const max = (typeof unit.maxCrew === "number" && unit.maxCrew > 0)
    ? unit.maxCrew
    : ((typeof maxCrew === "number" && maxCrew > 0) ? maxCrew : -1);
  if (max < 0) return "ok";
  return (unit.crew < max * 0.5) ? "incapacitated" : "ok";
};
