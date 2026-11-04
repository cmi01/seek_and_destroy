"use strict";

// ============================================================
// applyDialogueOutcome.js — job: resolve one hail choice into the NEW
// campaign section and the plain events it emits.
// Owner: factions.js (pure). Holds no state.
//
// M6 interface (roadmap-design §5.6): applyDialogueOutcome(state,
// encounter, choice) → { state, events } — the frozen three-argument
// spelling is the interface and the stem injects the open-square finder as
// the optional trailing deps, so this file never names a sibling.
// Choices (Q11): talk / threaten / leave, trade first. "leave" ends the
// interaction and re-places the moving (player) fleet on one of the
// nearest open squares (DESIGN §4.4); "threaten" signals the fight path;
// "trade" signals the storefront. Transforms return NEW state.
// ============================================================
const applyDialogueOutcome = function (state, encounter, choice, deps){
  const d = deps || {};
  const e = encounter || {};
  const faction = String(e.encounterFaction || "");
  const s = state || {};
  const c = String(choice || "");

  if (c === "trade"){
    return { state: s, events: [{ kind: "dialogueTrade", faction: faction }] };
  }
  if (c === "talk"){
    return { state: s, events: [{ kind: "dialogueTalk", faction: faction }] };
  }
  if (c === "threaten"){
    return { state: s, events: [{ kind: "dialogueThreaten", faction: faction, fight: true }] };
  }
  if (c === "leave"){
    // Re-place the player fleet on the nearest open square (DESIGN §4.4).
    const map = s.map || {};
    const fleets = Array.isArray(map.fleets) ? map.fleets : [];
    const mine = fleets.find(function (f){ return f && f.faction === "player"; }) || null;
    let nextMap = map;
    if (mine && typeof d.nearestOpen === "function"){
      // The mover's old square frees up — search against the OTHER fleets.
      const others = Object.assign({}, map, {
        fleets: fleets.filter(function (f){ return f !== mine; })
      });
      const spot = d.nearestOpen(others, { x: mine.x, y: mine.y }, d.rng);
      if (spot && (spot.x !== mine.x || spot.y !== mine.y)){
        nextMap = Object.assign({}, map, {
          fleets: fleets.map(function (f){
            return (f === mine) ? Object.assign({}, f, { x: spot.x, y: spot.y }) : f;
          })
        });
      }
    }
    return {
      state: (nextMap === map) ? s : Object.assign({}, s, { map: nextMap }),
      events: [{ kind: "dialogueLeave", faction: faction }]
    };
  }
  return { state: s, events: [] };
};
// Loading convention: this file defines applyDialogueOutcome at top level;
// the owner captures it after the boot list resolves.
