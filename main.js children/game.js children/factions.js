"use strict";

// ============================================================
// factions.js — job: compose the faction handle over its table and its
// doctrine-weighted fleet composer.
// Owner: game.js. Holds no state unless it is a core.
//
// M6 (roadmap-design §4.6): the faction personality seam — identity rows
// (name, default alignment, theme key, doctrine) from the frozen table,
// fleet composition from the composer child. The table is frozen at
// receipt here (data frozen at receipt); the roster the composer prices
// against is injected by the parent, so no child ever names a sibling.
// ============================================================
const factions = function (specs, deps){
  const d = deps || {};
  function freezeTree(value){
    if (value && typeof value === "object" && !Object.isFrozen(value)){
      Object.freeze(value);
      Object.keys(value).forEach(function (k){ freezeTree(value[k]); });
    }
    return value;
  }
  const table = freezeTree(factionsDataPayload);
  const rows = table && table.factions ? table.factions : {};
  // The per-faction voice banks (the dialogue child reads voices[id]).
  const voices = {};
  Object.keys(rows).forEach(function (id){ voices[id] = rows[id] ? rows[id].voice : null; });

  function row(id){ return rows[id] || null; }

  return {
    Ids(){ return Object.keys(rows).slice(); },
    Row(id){ return row(id); },
    ThemeOf(id){ const r = row(id); return r ? r.theme : null; },
    AlignmentOf(id){
      const r = row(id);
      return (r && typeof r.defaultAlignment === "number") ? r.defaultAlignment : 0;
    },
    TacticOf(id){ const r = row(id); return (r && r.doctrine) ? r.doctrine.tactic : null; },
    DoctrineProfile(id){ const r = row(id); return (r && r.doctrine) ? r.doctrine.profile : null; },
    ScorerWeights(id){
      const r = row(id);
      return (r && r.doctrine && r.doctrine.scorerWeights) ? r.doctrine.scorerWeights : null;
    },
    ComposeFleet(id, budget, rng){
      return composeFleet(rows, id, budget, rng, { specs: specs });
    },
    // M6(c): the hail dialogue — the voice bank is this file's own table;
    // the pair band and the open-square finder arrive injected.
    DialogueModel(state, encounter, lineHint){
      return buildDialogueModel(state, encounter, {
        voice: voices,
        bandOf: d.bandOf,
        lineHint: lineHint
      });
    },
    ApplyDialogueOutcome(state, encounter, choice, rng){
      return applyDialogueOutcome(state, encounter, choice, {
        nearestOpen: d.nearestOpen,
        rng: rng
      });
    }
  };
};
// Loading convention: this file defines factions at top level; the owner
// captures it after the boot list resolves.
