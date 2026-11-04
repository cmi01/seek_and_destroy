"use strict";

// ============================================================
// assessFleetGap.js — job: report the fleet's capability gaps (flagship threat, scout, long range, boarding, AA).
// Owner: aiFleetQueries.js. Holds no state.
// ============================================================

const assessFleetGap = function (env, ctx){
  const rf = (env.priorities(ctx) && env.priorities(ctx).reinforcement && env.priorities(ctx).reinforcement.fleetGap) || {};
  const buf = (rf.flagshipThreatRangeBuffer !== undefined) ? rf.flagshipThreatRangeBuffer : 1.0;
  const scoutScan = (rf.scoutMinScan !== undefined) ? rf.scoutMinScan : 5;
  const exclScout = rf.excludedScoutType || "Flagship Battlecruiser";
  const lrMin = (rf.longRangeMinRange !== undefined) ? rf.longRangeMinRange : 6;
  const aaMin = (rf.aaMinFirepower !== undefined) ? rf.aaMinFirepower : 4;
  const mine = env.myUnits(ctx), sp = env.spottedEnemies(ctx), fl = mine.find(u => u.flags.has("!flagship"));
  const ft = !!fl && sp.some(p => env.fpOf(p) > 0 && !p.flags.has("-attacked") && env.inRange(p, fl, Math.max(1, env.rngOf(p) + buf)) && env.hasLineOfSight(ctx, p.x, p.y, fl.x, fl.y, "WEAPON"));
  return {
    flagshipThreatened: ft,
    lacksScout: !mine.some(u => u.scan >= scoutScan && u.type !== exclScout),
    lacksLongRange: !mine.some(u => env.rngOf(u) >= lrMin && env.fpOf(u) > 0),
    lacksBoarding: !mine.some(u => u.flags.has("#space marines") && !u.flags.has("-sent boarding party")),
    lacksAA: !mine.some(u => env.fpOf(u) >= aaMin)
  };
};
