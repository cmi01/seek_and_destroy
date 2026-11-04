"use strict";

// ============================================================
// applyMapOrder.js — job: resolve one NPC map order into the new map state
// and its visible outcome events.
// Owner: campaignMap.js (pure). Holds no state.
//
// M6 (roadmap-design §5.6, D4): trades convert a fleet's goods into station
// commerce (a visible outcome line), fights resolve by fleet strength with
// seeded jitter (the loser is destroyed, the winner takes damage), and
// moves run through the injected shared mover — the same movement rules the
// player uses (the composer injects it; siblings never name each other).
// ============================================================
const applyMapOrder = function (mapState, order, rng, deps){
  const d = deps || {};
  const s = mapState || {};
  const o = order || {};
  const r = (typeof rng === "function") ? rng : Math.random;
  const fleets = Array.isArray(s.fleets) ? s.fleets : [];
  function find(id){ for (let i = 0; i < fleets.length; i++){ if (fleets[i] && fleets[i].id === id) return fleets[i]; } return null; }
  function replace(nextFleets){
    return Object.assign({}, s, { fleets: nextFleets });
  }
  function powerOf(f){ return (f && Array.isArray(f.ships)) ? f.ships.length : 0; }
  const me = find(o.fleetId);
  if (!me) return { mapState: s, events: [] };

  if (o.kind === "trade"){
    const moved = fleets.map(function (f){ return f === me ? Object.assign({}, f, { fuel: (f.fuel || 0) + 1 }) : f; });
    return {
      mapState: replace(moved),
      events: [{ kind: "npcTrade", faction: me.faction, fleetId: me.id, locationId: o.locationId,
        text: (me.faction || "A") + " fleet " + me.id + " traded at " + o.locationId + "." }]
    };
  }
  if (o.kind === "fight"){
    const foe = find(o.targetId);
    if (!foe) return { mapState: s, events: [] };
    const mine = powerOf(me) + r(), theirs = powerOf(foe) + r();
    const meWins = mine >= theirs;
    const survivor = meWins ? me : foe;
    const fallen = meWins ? foe : me;
    const survivors = fleets
      .filter(function (f){ return f !== fallen; })
      .map(function (f){
        return f === survivor
          ? Object.assign({}, f, { ships: f.ships.slice(0, Math.max(1, f.ships.length - 1)) })
          : f;
      });
    return {
      mapState: replace(survivors),
      events: [
        { kind: "npcBattle", factions: [me.faction, foe.faction], fleetIds: [me.id, foe.id],
          text: me.faction + " " + me.id + " engaged " + foe.faction + " " + foe.id + "." },
        { kind: "npcBattleOutcome", winner: survivor.faction, loser: fallen.faction,
          text: survivor.faction + " " + survivor.id + " won; " + fallen.faction + " " + fallen.id + " was destroyed." }
      ]
    };
  }
  if (o.kind === "move" && typeof d.move === "function"){
    const res = d.move(s, me.id, { x: o.x, y: o.y }, d.moveOpts || {});
    return { mapState: (res && res.mapState) || s, events: (res && res.events) || [] };
  }
  return { mapState: s, events: [] };
};
// Loading convention: this file defines applyMapOrder at top level; the
// owner captures it after the boot list resolves.
