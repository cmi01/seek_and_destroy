"use strict";

// ============================================================
// listWarpLoci.js — job: list the warp-in loci (capital first, emergency radius as fallback).
// Owner: aiFleetQueries.js. Holds no state.
// ============================================================

const listWarpLoci = function (env, ctx){
  const rf = (env.priorities(ctx) && env.priorities(ctx).reinforcement) || {};
  const capMult = (rf.capitalLocusCostMultiplier !== undefined) ? rf.capitalLocusCostMultiplier : 1;
  const emRad = (rf.emergencyLocusRadius !== undefined) ? rf.emergencyLocusRadius : 3;
  const emMult = (rf.emergencyLocusCostMultiplier !== undefined) ? rf.emergencyLocusCostMultiplier : 1.5;
  const sr = (ctx && ctx.spawnRadius !== undefined) ? ctx.spawnRadius : env.spawnRadius;
  const mine = env.myUnits(ctx);
  const caps = mine.filter(u => u.flags.has("#capital ship") && env.getValidWarpCells(ctx, u, sr).length > 0);
  if (caps.length > 0) return caps.map(u => ({ unit: u, radius: sr, costMult: capMult }));
  return mine.filter(u => env.getValidWarpCells(ctx, u, emRad).length > 0).map(u => ({ unit: u, radius: emRad, costMult: emMult }));
};
