"use strict";

// ============================================================
// computeUpdatedReservations.js — job: recompute the AI's damage reservations after one chosen plan.
// Owner: aiTurnWorkflow.js. Holds no state.
// ============================================================

// M5 adoption: `env` is the parent's seam (fpOf/rngOf/railOf) — weapon
// stats are read through it, never off unit fields.
const computeUpdatedReservations = function (ctx, plan, focusFireEnabled, env){
  const pv = (ctx && ctx.reservations) || new Map();
  const nx = new Map();
  const es = Array.from(pv.entries());
  for (let i = 0; i < es.length; i++){
    nx.set(es[i][0], { committedDmg: es[i][1].committedDmg, killers: es[i][1].killers.slice() });
  }
  if (!plan || !focusFireEnabled) return nx;
  const st0 = plan.steps[0];
  const st1 = plan.steps[1];
  const u = ((ctx && ctx.units) || []).find(x => x.id === plan.unitId);
  if (st0 && st0.kind === "SHOOT" && st0.target){
    // Plan steps carry {id,x,y} snapshots; resolve the unit for flag reads.
    const tgt = ((ctx && ctx.units) || []).find(x => x.id === st0.target.id) || st0.target;
    // Immediate SHOOT resolves on this beat (reducing target.hp directly),
    // so record the attacker in killers for focus-fire follow-up without
    // double-counting already-applied damage in committedDmg.
    const cur = nx.get(st0.target.id) || { committedDmg: 0, killers: [] };
    const prevPending = cur.killers.includes(plan.unitId)
      ? ((tgt.flags && tgt.flags.has("+shield") && u && !env.railOf(u)) ? 1 : (u ? env.fpOf(u) : 0))
      : 0;
    nx.set(st0.target.id, {
      committedDmg: Math.max(0, cur.committedDmg - prevPending),
      killers: cur.killers.includes(plan.unitId) ? cur.killers.slice() : cur.killers.concat([plan.unitId])
    });
  } else if (st0 && st0.kind === "MOVE" && st1 && st1.kind === "SHOOT" && st1.target){
    const tgt = ((ctx && ctx.units) || []).find(x => x.id === st1.target.id) || st1.target;
    const cur = nx.get(st1.target.id) || { committedDmg: 0, killers: [] };
    const effDmg = (tgt.flags && tgt.flags.has("+shield") && u && !env.railOf(u)) ? 1 : (u ? env.fpOf(u) : 0);
    nx.set(st1.target.id, {
      committedDmg: cur.committedDmg + effDmg,
      killers: cur.killers.includes(plan.unitId) ? cur.killers.slice() : cur.killers.concat([plan.unitId])
    });
  }
  return nx;
};
