"use strict";

// ============================================================
// payWages.js — job: run the campaign month clock and pay crew wages on
// each month rollover.
// Owner: economy.js (pure). Holds no state.
//
// M4 interface (roadmap-design §5.4): payWages(state) → { state, unpaid }.
// 5 ⒸB × Σ crew per in-game month (DESIGN §4.5; Q6: the bill rounds UP —
// 17.5 crew at 5 ⒸB is 87.5, charged as 88). 1 month = 30 map turns (Q6
// default; the map rules table carries monthTurns). The month clock lives
// here: each map turn passes through this transform, and every month
// boundary crossed since the last tick advances clock.month/year and
// charges one wage bill (fleet crews + the cargo crew pool). Unpaid ⇒
// desertion: crew leave the most expensive ships first until the payroll
// balances (the shortfall's worth of crew, ceil(short / rate) heads, drawn
// from the priciest hulls down, then the cargo pool).
//
// `state` is the whole campaign section (wallet, cargo, fleet, clock, map,
// market — the wage rate travels inside market, built from the campaign
// data module's frozen trade table; R9). No rollover ⇒ the same state is
// returned and unpaid is 0. Transforms return NEW state.
// ============================================================

const payWages = function (state){
  if (!state || typeof state !== "object") return { state: null, unpaid: 0 };
  const market = state.market || {};
  const rate = (typeof market.wagePerCrewMonth === "number" && market.wagePerCrewMonth > 0) ? market.wagePerCrewMonth : 5;
  const rules = (state.map && state.map.rules) || {};
  const monthTurns = (typeof rules.monthTurns === "number" && rules.monthTurns > 0) ? rules.monthTurns : 30;
  const turn = (state.map && typeof state.map.turn === "number") ? state.map.turn : 1;

  const clock = state.clock || {};
  let month = (typeof clock.month === "number") ? clock.month : 1;
  let year = (typeof clock.year === "number") ? clock.year : 2401;
  // Absolute month arithmetic: the clock stores calendar month/year while
  // the target is months-since-start (campaign start = month 1, 2401 per
  // the starting package's clock) — compare and advance on the absolute
  // count so year rollovers cannot loop.
  const BASE_YEAR = 2401;
  const elapsed = (year - BASE_YEAR) * 12 + (month - 1);
  const targetAbs = Math.floor(Math.max(0, turn - 1) / monthTurns);
  if (targetAbs <= elapsed) return { state: state, unpaid: 0 };

  const fleet = (Array.isArray(state.fleet) ? state.fleet : []).map(function (e){
    return Object.assign({}, e);
  });
  const prevCargo = state.cargo || {};
  let pool = prevCargo.crew || 0;
  let wallet = (typeof state.wallet === "number") ? state.wallet : 0;
  let unpaid = 0;

  function totalCrew(){
    let n = pool;
    for (let i = 0; i < fleet.length; i++) n += fleet[i].crew || 0;
    return n;
  }

  // Most expensive hulls first (market hull base price), then the pool.
  function desertionOrder(){
    const order = [];
    for (let i = 0; i < fleet.length; i++) order.push(i);
    order.sort(function (a, b){
      const wa = market.wares ? (market.wares["hull:" + fleet[a].hull] || {}) : {};
      const wb = market.wares ? (market.wares["hull:" + fleet[b].hull] || {}) : {};
      return (wb.priceBase || 0) - (wa.priceBase || 0);
    });
    return order;
  }

  while ((year - BASE_YEAR) * 12 + (month - 1) < targetAbs){
    month += 1;
    if (month > 12){ month = 1; year += 1; }
    const bill = Math.ceil(rate * totalCrew());
    const paid = Math.min(wallet, bill);
    wallet -= paid;
    const short = bill - paid;
    if (short > 0){
      unpaid += short;
      let toGo = Math.ceil(short / rate);
      const order = desertionOrder();
      for (let o = 0; o < order.length && toGo > 0; o++){
        const e = fleet[order[o]];
        const take = Math.min(e.crew || 0, toGo);
        if (take > 0){
          fleet[order[o]] = Object.assign({}, e, { crew: (e.crew || 0) - take });
          toGo -= take;
        }
      }
      if (toGo > 0) pool = Math.max(0, pool - toGo);
    }
  }

  return {
    state: Object.assign({}, state, {
      fleet: fleet,
      wallet: wallet,
      cargo: Object.assign({}, prevCargo, { crew: pool }),
      clock: { month: month, year: year }
    }),
    unpaid: unpaid
  };
};
