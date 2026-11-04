"use strict";

// ============================================================
// planDeployment.js — job: split a roster into deployed ships and overflow
// reserve given a corner-cell capacity and an optional player pick.
// Owner: reservePlacement.js (pure). Holds no state.
//
// M2 interface (roadmap-design §5.2): planDeployment(deployable, capacity,
// choice?) → { deployed, overflow }. Default (roadmap Q2): the player pick
// in `choice` (indices or hull ids) is honoured; with no pick, the flagship
// deploys first and the rest fill in roster order up to capacity.
// ============================================================
const planDeployment = function (deployable, capacity, choice){
  const list = Array.isArray(deployable) ? deployable.slice() : [];
  const cap = Math.max(0, Number(capacity) || 0);

  function isFlag(entry){
    if (!entry) return false;
    if (entry.flagship === true) return true;
    const hull = entry.hull || entry.type || "";
    return hull.indexOf("Flagship") !== -1;
  }

  // M4 (DESIGN §4.5): a non-flagship hull under 50% crew cannot be
  // deployed to a battle ("insufficient crew"); the flagship ALWAYS deploys
  // (Q2 — it is the warp locus and the permadeath target, so an
  // incapacitated crew still rides along and simply cannot act).
  function crewBlocked(entry){
    if (!entry || isFlag(entry)) return false;
    const max = (typeof entry.maxCrew === "number") ? entry.maxCrew : -1;
    return max > 0 && (entry.crew || 0) < max * 0.5;
  }

  const taken = new Array(list.length);
  for (let i = 0; i < taken.length; i++) taken[i] = false;
  const deployed = [];

  function take(idx){
    if (idx < 0 || idx >= list.length || taken[idx]) return false;
    if (deployed.length >= cap) return false;
    if (crewBlocked(list[idx])) return false;
    taken[idx] = true;
    deployed.push(list[idx]);
    return true;
  }

  // Flagship always occupies a deploy slot when one exists.
  for (let i = 0; i < list.length; i++){
    if (isFlag(list[i])) { take(i); break; }
  }

  if (Array.isArray(choice)){
    for (let c = 0; c < choice.length; c++){
      const token = choice[c];
      if (typeof token === "number"){
        take(token);
      } else {
        for (let i = 0; i < list.length; i++){
          if (!taken[i] && (list[i].hull === token || list[i].id === token)){
            take(i);
            break;
          }
        }
      }
    }
  }

  for (let i = 0; i < list.length; i++){
    if (deployed.length >= cap) break;
    take(i);
  }

  const overflow = [];
  for (let i = 0; i < list.length; i++){
    if (!taken[i]) overflow.push(list[i]);
  }
  return { deployed: deployed, overflow: overflow };
};
