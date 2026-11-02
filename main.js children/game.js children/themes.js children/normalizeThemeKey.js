"use strict";

// ============================================================
// normalizeThemeKey.js — job: resolve any accepted theme name to a theme key.
// Owner: themes.js (pure). Holds no state.
// ============================================================

const normalizeThemeKey = function (tables, raw){
  const key = String(raw == null ? "" : raw).trim().toLowerCase();
  if (tables.order.includes(key)) return key;
  if (Object.prototype.hasOwnProperty.call(tables.aliases, key)) return tables.aliases[key];
  return tables.order[0];
};
