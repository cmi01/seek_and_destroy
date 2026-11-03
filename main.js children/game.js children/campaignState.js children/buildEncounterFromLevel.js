"use strict";

// ============================================================
// buildEncounterFromLevel.js — job: turn a campaign level row into the
// encounter DTO the battle-setup seam consumes (opponent entities + corner capacity).
// Owner: campaignState.js (pure). Holds no state.
//
// Until the map exists the ladder table is the encounter SOURCE only: hull
// names become roster entities here. Battle-state building stays in the
// seam. Injected roster table so this child never names a sibling file.
// ============================================================
const buildEncounterFromLevel = function (levelSpec, shipSpecs, opts){
  const spec = levelSpec || {};
  const specs = shipSpecs || {};
  const o = opts || {};

  function asEntry(hull){
    const s = specs[hull] || {};
    return {
      hull: hull,
      loadout: Array.isArray(s.defaultLoadout) ? s.defaultLoadout.slice() : [],
      hp: s.hp || 0,
      maxHp: s.hp || 0,
      crew: s.crew || 0,
      flagship: Array.isArray(s.flags) && s.flags.indexOf("!flagship") !== -1
    };
  }

  const opponent = [];
  const listed = Array.isArray(spec.t2SpawnList) ? spec.t2SpawnList : [];
  for (let i = 0; i < listed.length; i++) opponent.push(asEntry(listed[i]));

  let remBudget = spec.t2CompositionBudget || 0;
  const pool = spec.t2ArchetypePool || [];
  const rnd = typeof o.rnd === "function" ? o.rnd : null;
  let safety = 0;
  while (rnd && remBudget >= 5 && pool.length > 0 && safety < 50){
    safety++;
    const affordable = pool.filter(function (name){
      const s = specs[name];
      return s && s.cost <= remBudget && s.cost > 0;
    });
    if (affordable.length === 0) break;
    const pickName = affordable[Math.floor(rnd() * affordable.length)];
    opponent.push(asEntry(pickName));
    remBudget -= (specs[pickName] || {}).cost || 0;
  }

  const cap = (o.capacity !== undefined && o.capacity !== null) ? o.capacity : 4;
  return {
    playerFaction: o.playerFaction || "player",
    opponentFaction: o.opponentFaction || "syndicate",
    opponent: opponent,
    capacity: cap,
    seed: (typeof o.seed === "number") ? o.seed : 0,
    choice: o.choice
  };
};
