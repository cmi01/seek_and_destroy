"use strict";

// ============================================================
// materializeMirages.js — job: turn warping-in mirages of one team into
// real ships at the start of that team's next turn.
// Owner: game.js (pure). Holds no state.
//
// M2 interface (roadmap-design §5.2): materializeMirages(state) →
// { state, events }. unit.kind is "ship" | "mirage". Only the team's own
// mirages convert; a ram/hit against a still-mirage unit is combat, not
// this transform.
// ============================================================
const materializeMirages = function (state){
  const src = (state && Array.isArray(state.units)) ? state.units : [];
  const team = state && state.team;
  const events = [];
  const units = [];
  for (let i = 0; i < src.length; i++){
    const u = src[i];
    if (!u) continue;
    if (u.kind === "mirage" && (team === undefined || u.team === team)){
      const next = {};
      const keys = Object.keys(u);
      for (let k = 0; k < keys.length; k++) next[keys[k]] = u[keys[k]];
      if (u.flags && typeof u.flags === "object") next.flags = u.flags;
      next.kind = "ship";
      units.push(next);
      events.push({ kind: "mirageMaterialize", unitId: u.id });
    } else {
      units.push(u);
    }
  }
  const out = {};
  if (state){
    const sk = Object.keys(state);
    for (let i = 0; i < sk.length; i++) out[sk[i]] = state[sk[i]];
  }
  out.units = units;
  return { state: out, events: events };
};
