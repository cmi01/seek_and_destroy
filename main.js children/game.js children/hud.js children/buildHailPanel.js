"use strict";

// ============================================================
// buildHailPanel.js — job: lay out the open hailing shell's panel from
// the encounter and its dialogue model.
// Owner: hud.js. Holds no state.
//
// M6 (roadmap-design §4.6): the hail panel grows the M3 shell with the
// faction voice — the dialogue model's tone, band and line lead the
// panel, and its Q11 options (trade first) drive the button row the map
// HUD model turns into HAIL_* ids. Plain data in, plain data out.
// ============================================================
const buildHailPanel = function (encounter, dialogue){
  const e = encounter || {};
  const d = dialogue || {};
  const faction = String(e.encounterFaction || d.faction || "unknown").toUpperCase();
  const who = e.kind === "location"
    ? (faction === "GARRISON" ? "LOCAL GARRISON" : (faction + " GARRISON"))
    : (faction + " VESSEL");
  const where = String(e.locationId || "local space").toUpperCase();
  const lines = [];
  lines.push("HAIL OPEN // " + who + " @ " + where);
  if (d.tone) lines.push("TONE: " + String(d.tone).toUpperCase() + " // STANDING: " + String(d.band || "neutral").toUpperCase());
  lines.push("\"" + (d.line || "...static...") + "\"");
  return {
    speaker: who,
    faction: String(e.encounterFaction || d.faction || "unknown"),
    band: d.band || "neutral",
    tone: d.tone || "",
    lines: lines,
    options: Array.isArray(d.options) && d.options.length
      ? d.options.slice()
      : ["talk", "threaten", "leave"]
  };
};
// Loading convention: this file defines buildHailPanel at top level; the
// owner captures it after the boot list resolves.
