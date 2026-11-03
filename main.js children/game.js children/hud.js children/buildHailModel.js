"use strict";

// ============================================================
// buildHailModel.js — job: build the hailing-shell dialogue model for a
// map encounter (M3 voice placeholder until M6's dialogue banks).
// Owner: hud.js. Holds no state.
//
// Interface (roadmap-design §5.3): buildHailModel(encounter) →
// { speaker, lines, options: ("talk" | "threaten" | "leave")[] }.
// The encounter is the plain BattleSetup row the map produces; the shell
// carries placeholder voice text only — no behavior, no state, no side
// effects (transforms return NEW data).
// ============================================================

const buildHailModel = function (encounter){
  const e = encounter || {};
  const faction = String(e.encounterFaction || "unknown").toUpperCase();
  const who = e.kind === "location"
    ? (faction === "GARRISON" ? "LOCAL GARRISON" : (faction + " GARRISON"))
    : (faction + " VESSEL");
  const where = String(e.locationId || "local space").toUpperCase();

  return {
    speaker: who,
    lines: [
      "HAIL RECEIVED // " + who + " @ " + where,
      "\"...placeholder transmission. Stand by for voice traffic.\"",
      "(dialogue voice banks arrive with M6 — shell only.)"
    ],
    options: ["talk", "threaten", "leave"]
  };
};
