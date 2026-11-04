"use strict";

// ============================================================
// resolveHullThemes.js — job: per-team hull palette plus the faction stripe band (resolveHullThemes).
// Owner: game.js (pure child). Holds no state.
// ============================================================
// M6(a): per-team hull identity for the frame — plain data; the renderer
// paints the faction stripe band and the minimap ramp from it. Team 1 keeps
// the active theme's hull ramp; team 2 wears the battle faction's theme
// (the battle stays team 1/2-keyed). Missing entries fall through to the
// theme palette inside the renderer.
const resolveHullThemes = function (p){
  const themeData = p.themeData;
  const base = (themeData && themeData.palettes && themeData.palettes[p.themeKey]) || null;
  const baseHull = (base && base.hull) || {};
  const out = {
    1: baseHull[1] ? Object.assign({}, baseHull[1]) : null,
    2: baseHull[2] ? Object.assign({}, baseHull[2]) : null
  };
  const fkey = p.factionThemeKey;
  const ft = (fkey && themeData && themeData.factionThemes && themeData.factionThemes[fkey]) || null;
  if (ft){
    out[2] = Object.assign({}, out[2] || {}, ft.hull || {},
      (typeof ft.stripe === "string") ? { stripe: ft.stripe } : {});
  }
  return out;
};
