"use strict";

// ============================================================
// buildDialogueModel.js — job: build one hail interaction's dialogue
// model from the pair's reputation band and the faction voice bank.
// Owner: factions.js (pure). Holds no state.
//
// M6 interface (roadmap-design §5.6): buildDialogueModel(state, encounter)
// → DialogueModel — the frozen two-argument spelling is the interface and
// the stem injects the voice bank and the band reader as the optional
// trailing deps, so this file never names a sibling. The line is picked
// deterministically from the campaign clock (deps.lineHint overrides the
// index so a repeated "talk" can advance the voice). Q11: interactions are
// hail + trade + fight — trade leads the option list.
// ============================================================
const buildDialogueModel = function (state, encounter, deps){
  const d = deps || {};
  const e = encounter || {};
  const faction = String(e.encounterFaction || "");
  const voice = (d.voice && faction && d.voice[faction]) ? d.voice[faction] : null;
  const band = (typeof d.bandOf === "function")
    ? d.bandOf((state && state.reputation) || {}, faction)
    : "neutral";
  const pool = (voice && voice.lines && Array.isArray(voice.lines[band]) && voice.lines[band].length)
    ? voice.lines[band]
    : ["(no transmission)"];
  const turn = (state && state.map && typeof state.map.turn === "number") ? state.map.turn : 1;
  const idx = (typeof d.lineHint === "number")
    ? Math.abs(Math.trunc(d.lineHint))
    : Math.abs(Math.trunc(turn));
  return {
    faction: faction || "unknown",
    band: band,
    tone: (voice && typeof voice.tone === "string") ? voice.tone : "",
    line: pool[idx % pool.length],
    options: ["trade", "talk", "threaten", "leave"]
  };
};
// Loading convention: this file defines buildDialogueModel at top level;
// the owner captures it after the boot list resolves.
