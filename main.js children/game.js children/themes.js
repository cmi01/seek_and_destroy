"use strict";

// ============================================================
// themes.js — job: compose the theme handle over the frozen theme tables and its key/colour children.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const themes = function (THEME_DATA){
  const tables = themeTables(THEME_DATA);
  return {
    ORDER: tables.order,
    normalize(raw){ return normalizeThemeKey(tables, raw); },
    next(current){ return nextTheme(tables.order, normalizeThemeKey(tables, current)); },
    palette(theme){ return themePalette(tables, normalizeThemeKey(tables, theme)); },
    color(lit, theme){ return remapColor(tables, lit, normalizeThemeKey(tables, theme)); },
    spriteAtlas: tables.spriteAtlas
  };
};
