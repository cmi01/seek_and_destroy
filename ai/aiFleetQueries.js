"use strict";

// ============================================================
// aiFleetQueries.js — job: answer the AI's fleet queries (capability gaps, warp-in loci).
// Owner: ai/aiLogic.js. Holds no state unless it is a core.
// ============================================================
(() => {
  function fleetGap(env, ctx){
    const rf = (env.priorities(ctx) && env.priorities(ctx).reinforcement && env.priorities(ctx).reinforcement.fleetGap) || {};
    const buf = (rf.flagshipThreatRangeBuffer !== undefined) ? rf.flagshipThreatRangeBuffer : 1.0;
    const scoutScan = (rf.scoutMinScan !== undefined) ? rf.scoutMinScan : 5;
    const exclScout = rf.excludedScoutType || "Flagship Battlecruiser";
    const lrMin = (rf.longRangeMinRange !== undefined) ? rf.longRangeMinRange : 6;
    const aaMin = (rf.aaMinFirepower !== undefined) ? rf.aaMinFirepower : 4;
    const mine = env.myUnits(ctx), sp = env.spottedEnemies(ctx), fl = mine.find(u => u.flags.has("!flagship"));
    const ft = !!fl && sp.some(p => p.firepower > 0 && !p.flags.has("-attacked") && env.inRange(p, fl, Math.max(1, p.range + buf)) && env.hasLineOfSight(ctx, p.x, p.y, fl.x, fl.y, "WEAPON"));
    return {
      flagshipThreatened: ft,
      lacksScout: !mine.some(u => u.scan >= scoutScan && u.type !== exclScout),
      lacksLongRange: !mine.some(u => u.range >= lrMin && u.firepower > 0),
      lacksBoarding: !mine.some(u => u.flags.has("#space marines") && !u.flags.has("-sent boarding party")),
      lacksAA: !mine.some(u => u.firepower >= aaMin)
    };
  }

  function warpLoci(env, ctx){
    const rf = (env.priorities(ctx) && env.priorities(ctx).reinforcement) || {};
    const capMult = (rf.capitalLocusCostMultiplier !== undefined) ? rf.capitalLocusCostMultiplier : 1;
    const emRad = (rf.emergencyLocusRadius !== undefined) ? rf.emergencyLocusRadius : 3;
    const emMult = (rf.emergencyLocusCostMultiplier !== undefined) ? rf.emergencyLocusCostMultiplier : 1.5;
    const sr = (ctx && ctx.spawnRadius !== undefined) ? ctx.spawnRadius : env.spawnRadius;
    const mine = env.myUnits(ctx);
    const caps = mine.filter(u => u.flags.has("#capital ship") && env.getValidWarpCells(ctx, u, sr).length > 0);
    if (caps.length > 0) return caps.map(u => ({ unit: u, radius: sr, costMult: capMult }));
    return mine.filter(u => env.getValidWarpCells(ctx, u, emRad).length > 0).map(u => ({ unit: u, radius: emRad, costMult: emMult }));
  }

  AILogic._register("fleetQueries", {
    fleetGap,
    warpLoci
  });
})();
