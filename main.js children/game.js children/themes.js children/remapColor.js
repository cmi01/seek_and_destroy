"use strict";

// ============================================================
// remapColor.js — job: remap a colour literal through a theme's colour map.
// Owner: themes.js (pure). Holds no state.
// ============================================================

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

// `key` is already normalized by the composer. No memo cache: the remap is a
// cheap pure lookup.
const remapColor = function (tables, lit, key){
  if (key === tables.order[0]) return lit;
  const map = tables.colorRemap[key];
  if (!map) return lit;
  return remapLiteral(lit, map);
};
