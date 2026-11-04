"use strict";

// ============================================================
// collectBattleResult.js — job: snapshot a finished board into the
// BattleResult DTO the campaign fold seam consumes.
// Owner: campaignState.js (pure). Holds no state.
//
// Living team-1 hulls that match the deployed snapshot are survivors;
// leftover living team-1 hulls match the overflow snapshot (summoned
// reserve ships) and are captured; unmatched deployed and unmatched
// opponents are scrapped. Remaining reserve rides through unchanged.
// Battle units carry their mount list (the loadout is the weapon truth),
// so each entry's loadout is taken from the unit when present.
// ============================================================
const collectBattleResult = function (units, reserve, snapshot, status){
  const us = Array.isArray(units) ? units : [];
  const living1 = [];
  const living2 = [];
  for (let i = 0; i < us.length; i++){
    const u = us[i];
    if (!u || !(u.hp > 0)) continue;
    if (u.team === 1) living1.push(u);
    else if (u.team === 2) living2.push(u);
  }

  function toEntry(src, roster){
    const flags = src.flags;
    const isFlag = (src.flagship === true) ||
      (flags && typeof flags.has === "function" && flags.has("!flagship")) ||
      String(src.type || src.hull || "").indexOf("Flagship") !== -1;
    const hull = src.hull || src.type;
    const entry = {
      hull: hull,
      hp: src.hp,
      maxHp: src.maxHp,
      crew: src.crew,
      flagship: isFlag
    };
    // M5: the unit's mount list is the weapon truth; carry it over (the
    // roster snapshot entry is the fallback for pre-M5 battle records, or
    // the key is left off and the fold defaults it).
    const unitLoadout = Array.isArray(src.loadout) ? src.loadout : null;
    const rosterLoadout = (roster && Array.isArray(roster.loadout)) ? roster.loadout : null;
    const loadout = unitLoadout || rosterLoadout;
    if (loadout) entry.loadout = loadout.slice();
    return entry;
  }

  function hullOf(e){ return e.hull || e.type; }

  function takeFrom(list, taken, hull){
    for (let i = 0; i < list.length; i++){
      if (!taken[i] && hullOf(list[i]) === hull){
        taken[i] = true;
        return i;
      }
    }
    return -1;
  }

  const snap = snapshot || {};
  const deployed = Array.isArray(snap.deployed) ? snap.deployed : [];
  const overflow = Array.isArray(snap.overflow) ? snap.overflow : [];
  const opponent = Array.isArray(snap.opponent) ? snap.opponent : [];
  const taken1 = living1.map(function (){ return false; });
  const taken2 = living2.map(function (){ return false; });
  const takenOverflow = overflow.map(function (){ return false; });

  const survivors = [];
  const scrapped = [];
  for (let i = 0; i < deployed.length; i++){
    const hull = hullOf(deployed[i]);
    const hit = takeFrom(living1, taken1, hull);
    if (hit >= 0) survivors.push(toEntry(living1[hit], deployed[i]));
    else scrapped.push({ hull: hull });
  }

  const captured = [];
  for (let i = 0; i < living1.length; i++){
    if (!taken1[i]){
      const src = living1[i];
      const from = takeFrom(overflow, takenOverflow, hullOf(src));
      captured.push(toEntry(src, from >= 0 ? overflow[from] : null));
    }
  }

  for (let i = 0; i < opponent.length; i++){
    const hull = hullOf(opponent[i]);
    const hit = takeFrom(living2, taken2, hull);
    if (hit < 0) scrapped.push({ hull: hull });
  }

  const leftoverReserve = Array.isArray(reserve) ? reserve.slice() : [];
  const st = status || {};
  const playerLost = Boolean(st.t1Defeated) || st.reason === "flagship-lost";
  const playerWon = Boolean(st.t2Defeated);
  return {
    winner: playerWon ? "player" : (playerLost ? "syndicate" : null),
    survivors: survivors,
    captured: captured,
    scrapped: scrapped,
    reserve: leftoverReserve,
    playerFlagshipLost: playerLost,
    payouts: {}
  };
};
