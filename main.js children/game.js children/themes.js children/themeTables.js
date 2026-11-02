"use strict";

// ============================================================
// themeTables.js — job: freeze and return the theme tables the theme handle reads.
// Owner: themes.js (pure). Holds no state.
// ============================================================

const themeTables = function (THEME_DATA) {
  function deepFreeze(o){
    Object.values(o).forEach(v => { if (v && typeof v === "object") deepFreeze(v); });
    return Object.freeze(o);
  }
  const order = Object.freeze(THEME_DATA.order.slice());
  const aliases = THEME_DATA.aliases || {};
  const palettes = {};
  order.forEach(t => { palettes[t] = deepFreeze(JSON.parse(JSON.stringify(THEME_DATA.palettes[t]))); });
  return {
    order,
    aliases,
    palettes,
    colorRemap: THEME_DATA.colorRemap || {},
    spriteAtlas: deepFreeze(JSON.parse(JSON.stringify(THEME_DATA.spriteAtlas)))
  };
};
