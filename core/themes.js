"use strict";

// ============================================================
// THEMES — stateless pure theme normalizer and colour remapper.
// Privately registered with Game (core/game.js); holds zero mutable state
// and exposes zero globals.
// ============================================================
Game._registerModule("themes", (THEME_DATA, themeState) => {
  const ORDER = Object.freeze(THEME_DATA.order.slice());
  const ALIASES = THEME_DATA.aliases || {};

  function deepFreeze(o){
    Object.values(o).forEach(v => { if (v && typeof v === "object") deepFreeze(v); });
    return Object.freeze(o);
  }
  const PALETTES = {};
  ORDER.forEach(t => { PALETTES[t] = deepFreeze(JSON.parse(JSON.stringify(THEME_DATA.palettes[t]))); });

  if (themeState && !themeState.active) themeState.active = ORDER[0];
  if (themeState && !themeState.caches) themeState.caches = {};

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

  function getActive(){
    return (themeState && themeState.active) ? themeState.active : ORDER[0];
  }

  function setActive(theme){
    const nextTheme = normalize(theme);
    if (themeState) themeState.active = nextTheme;
    return nextTheme;
  }

  function palette(theme){
    return PALETTES[theme === undefined ? getActive() : normalize(theme)];
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

  function color(lit){
    const active = getActive();
    if (active === ORDER[0]) return lit;
    const map = (THEME_DATA.colorRemap || {})[active];
    if (!map) return lit;
    const caches = (themeState && themeState.caches) ? themeState.caches : null;
    if (!caches) return remapLiteral(lit, map);
    const cache = caches[active] || (caches[active] = new Map());
    let out = cache.get(lit);
    if (out === undefined) {
      out = remapLiteral(lit, map);
      cache.set(lit, out);
    }
    return out;
  }

  return {
    ORDER,
    normalize,
    next,
    palette,
    setActive,
    getActive,
    color,
    spriteAtlas: deepFreeze(JSON.parse(JSON.stringify(THEME_DATA.spriteAtlas)))
  };
});
