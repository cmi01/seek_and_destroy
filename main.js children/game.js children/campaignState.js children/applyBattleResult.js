"use strict";

// ============================================================
// applyBattleResult.js — job: fold a finished battle back into the campaign
// section (payouts, crew transfer, captured hulls, permadeath).
// Owner: campaignState.js (pure). Holds no state.
//
// M2 interface (roadmap-design §5.2): applyBattleResult(section, battleResult)
// → { state, events }. The composer injects the roster table and the crew-lost
// transform so this child never names a sibling file. Payout default (roadmap
// Q1): parts at 50% of hull slot value; captured ships retained; crew auto-
// transfers to the flagship.
// ============================================================
const applyBattleResult = function (section, battleResult, shipSpecs, crewLostFn){
  const events = [];
  if (!section) return { state: null, events: events };
  const result = battleResult || {};
  const specs = shipSpecs || {};

  function isFlag(entry){
    if (!entry) return false;
    if (entry.flagship === true) return true;
    const hull = entry.hull || entry.type || "";
    return hull.indexOf("Flagship") !== -1;
  }

  function copyEntry(src){
    const hull = src.hull || src.type;
    const spec = specs[hull] || {};
    const maxHp = (src.maxHp !== undefined) ? src.maxHp : (spec.hp || 0);
    const hp = (src.hp !== undefined) ? src.hp : maxHp;
    let crew = (src.crew !== undefined) ? src.crew : (spec.crew || 0);
    const damage = Math.max(0, maxHp - hp);
    if (typeof crewLostFn === "function" && damage > 0){
      crew = Math.max(0, crew - crewLostFn(damage, maxHp, crew));
    }
    return {
      hull: hull,
      loadout: Array.isArray(src.loadout) ? src.loadout.slice() : (spec.defaultLoadout ? spec.defaultLoadout.slice() : []),
      hp: hp,
      maxHp: maxHp,
      crew: crew,
      maxCrew: (typeof src.maxCrew === "number") ? src.maxCrew : (spec.crew || 0)
    };
  }

  const nextFleet = [];
  let crewToCargo = 0;
  const survivors = Array.isArray(result.survivors) ? result.survivors : [];
  for (let i = 0; i < survivors.length; i++) nextFleet.push(copyEntry(survivors[i]));

  const captured = Array.isArray(result.captured) ? result.captured : [];
  for (let i = 0; i < captured.length; i++){
    const entry = copyEntry(captured[i]);
    nextFleet.push(entry);
    events.push({ kind: "capturedRetained", hull: entry.hull });
  }

  // Crew auto-transfer: other surviving ships fill the flagship first.
  let flagIdx = -1;
  for (let i = 0; i < nextFleet.length; i++){
    if (isFlag(nextFleet[i])) { flagIdx = i; break; }
  }
  if (flagIdx >= 0){
    const flag = nextFleet[flagIdx];
    const flagSpec = specs[flag.hull] || {};
    const flagMax = flagSpec.crew || flag.crew;
    let pool = 0;
    for (let i = 0; i < nextFleet.length; i++){
      if (i === flagIdx) continue;
      pool += nextFleet[i].crew;
      nextFleet[i] = Object.assign({}, nextFleet[i], { crew: 0 });
    }
    const fill = Math.min(flagMax, flag.crew + pool);
    const leftover = Math.max(0, flag.crew + pool - fill);
    nextFleet[flagIdx] = Object.assign({}, flag, { crew: fill });
    events.push({ kind: "crewTransferred", flagship: flag.hull, crew: fill });
    if (leftover > 0){
      crewToCargo = leftover;
      events.push({ kind: "crewToCargo", crew: leftover });
    }
  }

  let parts = (result.payouts && typeof result.payouts.parts === "number") ? result.payouts.parts : null;
  let credits = (result.payouts && typeof result.payouts.credits === "number") ? result.payouts.credits : 0;
  if (parts === null){
    parts = 0;
    const scrapped = Array.isArray(result.scrapped) ? result.scrapped : [];
    for (let i = 0; i < scrapped.length; i++){
      const hull = scrapped[i].hull || scrapped[i].type;
      const spec = specs[hull] || {};
      const slotValue = (typeof spec.capacity === "number") ? spec.capacity : 0;
      parts += Math.floor(slotValue * 0.5);
    }
  }

  const wallet = (typeof section.wallet === "number" ? section.wallet : 0) + credits;
  const prevCargo = section.cargo || {};
  const cargo = {
    goods: prevCargo.goods || 0,
    fuel: prevCargo.fuel || 0,
    crew: (prevCargo.crew || 0) + crewToCargo,
    parts: (prevCargo.parts || 0) + parts,
    weapons: Object.assign({}, prevCargo.weapons || {})
  };
  events.push({ kind: "payout", parts: parts, credits: credits });

  const leftoverReserve = Array.isArray(result.reserve) ? result.reserve : [];
  for (let i = 0; i < leftoverReserve.length; i++){
    nextFleet.push(copyEntry(leftoverReserve[i]));
  }

  const flagshipLost = Boolean(result.playerFlagshipLost) || flagIdx < 0;
  if (flagshipLost){
    events.push({ kind: "campaignOver", reason: "flagship-lost" });
  }

  const next = {
    fleet: nextFleet,
    wallet: wallet,
    cargo: cargo,
    reputation: section.reputation,
    clock: section.clock,
    map: section.map,
    market: section.market
  };
  return { state: next, events: events };
};
