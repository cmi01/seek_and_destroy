"use strict";

// ============================================================
// buildDeploymentModel.js — job: build the pre-battle deployment view —
// flagship locked on, remaining hulls togglable up to corner capacity.
// Owner: hud.js. Holds no state.
// ============================================================
const buildDeploymentModel = function (deps, input) {
  const d = (input.state && input.state.deployment) ? input.state.deployment : {};
  const fleet = Array.isArray(d.fleet) ? d.fleet : [];
  const cap = (typeof d.capacity === "number") ? d.capacity : fleet.length;
  const selected = Array.isArray(d.selected) ? d.selected.slice() : [];
  const rows = [];
  for (let i = 0; i < fleet.length; i++){
    const entry = fleet[i] || {};
    const hull = entry.hull || entry.type || "?";
    const locked = entry.flagship === true || String(hull).indexOf("Flagship") !== -1;
    const on = locked || selected.indexOf(i) !== -1;
    // M4 (DESIGN §4.5): a non-flagship hull under 50% crew cannot deploy
    // ("insufficient crew"); the flagship always deploys (Q2 — warp locus).
    const maxCrew = (typeof entry.maxCrew === "number") ? entry.maxCrew : -1;
    const insufficient = !locked && maxCrew > 0 && (entry.crew || 0) < maxCrew * 0.5;
    rows.push({
      index: i,
      hull: hull,
      flagship: locked,
      selected: on && !insufficient,
      locked: locked,
      insufficient: insufficient
    });
  }
  let onCount = 0;
  for (let i = 0; i < rows.length; i++) if (rows[i].selected) onCount++;
  return {
    title: "DEPLOYMENT",
    capText: "DEPLOY " + onCount + " / " + cap + " CORNER SLOTS — FLAGSHIP IS ALWAYS ON",
    capacity: cap,
    onCount: onCount,
    wallet: (input.state && typeof input.state.wallet === "number") ? input.state.wallet : 0,
    rows: rows
  };
};
