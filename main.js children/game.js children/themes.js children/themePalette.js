"use strict";

// ============================================================
// themePalette.js — job: return the board palette for a resolved theme key.
// Owner: themes.js (pure). Holds no state.
// ============================================================

// `key` is already normalized by the composer (a member of `palettes`' order).
const themePalette = function (tables, key){
  return tables.palettes[key];
};
