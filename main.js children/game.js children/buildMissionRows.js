"use strict";

// ============================================================
// buildMissionRows.js — job: contract-board rows for a station with status and accept/complete action (buildMissionRows).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const buildMissionRows = function (p){
  const locId = p.locId;
  const rows = [];
  // M6(d): the mission board — the station's fixed contracts (Q9) with
  // status, progress toward target, and the accept/complete action.
  const board = p.contracts || {};
  const activeIds = Array.isArray(board.active) ? board.active : [];
  const doneIds = Array.isArray(board.done) ? board.done : [];
  const prog = board.progress || {};
  const all = p.missions || [];
  for (let i = 0; i < all.length; i++){
    const m = all[i];
    if (!m || m.locationId !== locId) continue;
    const isActive = activeIds.indexOf(m.id) !== -1;
    const isDone = doneIds.indexOf(m.id) !== -1;
    const made = prog[m.id] || {};
    const target = m.target || {};
    const tKeys = Object.keys(target);
    let met = true;
    const progParts = [];
    for (let j = 0; j < tKeys.length; j++){
      const k = tKeys[j];
      const have = Number(made[k]) || 0;
      if (have < (Number(target[k]) || 0)) met = false;
      progParts.push(k.toUpperCase() + " " + have + "/" + target[k]);
    }
    rows.push({
      id: m.id,
      kind: "mission",
      label: m.title,
      sub: m.brief,
      priceText: "PAYOUT " + m.payout + " ⒸB",
      ownedText: isDone ? "COMPLETE" : (isActive ? ("ACTIVE // " + progParts.join(" ")) : String(m.faction || "").toUpperCase()),
      actionId: isDone ? "" : (isActive ? ("MISSION_COMPLETE:" + m.id) : ("MISSION_ACCEPT:" + m.id)),
      actionLabel: isDone ? "DONE" : (isActive ? "COMPLETE" : "ACCEPT"),
      canAct: !isDone && (!isActive || met),
      active: isActive
    });
  }
  return rows;
};
