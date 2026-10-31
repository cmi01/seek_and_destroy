"use strict";

// ============================================================
// themes.js — job: resolve theme keys and colour remaps.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("themes", THEME_DATA => {
  const ORDER = Object.freeze(THEME_DATA.order.slice());
  const ALIASES = THEME_DATA.aliases || {};

  function deepFreeze(o){
    Object.values(o).forEach(v => { if (v && typeof v === "object") deepFreeze(v); });
    return Object.freeze(o);
  }
  const PALETTES = {};
  ORDER.forEach(t => { PALETTES[t] = deepFreeze(JSON.parse(JSON.stringify(THEME_DATA.palettes[t]))); });

  function normalize(raw){
    const key = String(raw == null ? "" : raw).trim().toLowerCase();
    if (ORDER.includes(key)) return key;
    if (Object.prototype.hasOwnProperty.call(ALIASES, key)) return ALIASES[key];
    return ORDER[0];
  }

  function next(current){
    const i = ORDER.indexOf(normalize(current));
    return ORDER[(i + 1) % ORDER.length];
  }

  // `theme` is REQUIRED: Game owns the active theme and passes it explicitly.
  function palette(theme){
    return PALETTES[normalize(theme)];
  }

  // ---- Colour remap -------------------------------------------------------
  const RGB_RE = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

  function remapLiteral(lit, map){
    const s = String(lit).trim();
    if (s[0] === "#") {
      const hit = map[s.toLowerCase()];
      return hit || s;
    }
    const m = RGB_RE.exec(s);
    if (!m) return s;
    const hit = map[m[1] + "," + m[2] + "," + m[3]];
    if (!hit) return s;
    return m[4] !== undefined ? `rgba(${hit.split(",").join(", ")}, ${m[4]})` : `rgb(${hit.split(",").join(", ")})`;
  }

  // `theme` is REQUIRED. No memo cache: the remap is a cheap pure lookup.
  function color(lit, theme){
    const key = normalize(theme);
    if (key === ORDER[0]) return lit;
    const map = (THEME_DATA.colorRemap || {})[key];
    if (!map) return lit;
    return remapLiteral(lit, map);
  }

  return {
    ORDER,
    normalize,
    next,
    palette,
    color,
    spriteAtlas: deepFreeze(JSON.parse(JSON.stringify(THEME_DATA.spriteAtlas)))
  };
});
