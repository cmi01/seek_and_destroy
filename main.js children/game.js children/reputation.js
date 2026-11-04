"use strict";

// ============================================================
// reputation.js — job: compose the reputation handle over its band,
// stance, adjust and sharing children.
// Owner: game.js. Holds no state unless it is a core.
//
// M6 (roadmap-design §4.6/§5.6): the faction-relation seam — scores are
// pairwise numbers on the −100..200 scale (Q10), bands map scores to the
// five quintiles, stances map bands to relations, and the sharing child
// answers the DESIGN §2.7 place rules. Event deltas arrive as the frozen
// rate table the parent injects (kills ±10, missions ±15, trade ±2).
// ============================================================
const reputation = function (config){
  const rates = (config && config.rates) ? config.rates : {};

  function pairScoreOf(repState, a, b){
    const rep = repState || {};
    return (rep[a + "|" + b] !== undefined) ? rep[a + "|" + b]
      : ((rep[b + "|" + a] !== undefined) ? rep[b + "|" + a] : 0);
  }

  return {
    Band(score){ return reputationBand(score); },
    PairScore(repState, a, b){ return pairScoreOf(repState, a, b); },
    Stance(repState, a, b){ return stanceBetween(repState, a, b, { band: reputationBand }); },
    Adjust(repState, a, b, delta){ return adjustReputation(repState, a, b, delta); },
    SharesSensors(band, where){ return sharesSensors(band, where); },
    // Event hook surface: one named delta per event kind from the frozen
    // rates table. sign === -1 applies the opposite direction (a failed
    // mission, a hostile trade).
    ApplyEvent(repState, kind, a, b, sign){
      const d = (rates[kind] !== undefined) ? rates[kind] : 0;
      return adjustReputation(repState, a, b, (sign === -1) ? -d : d);
    },
    // Pair-table seed: every faction pair starts at 0 (the M1 shape) and
    // every player pair starts at the faction's default alignment.
    Init(factionIds, defaultOf){
      const ids = Array.isArray(factionIds) ? factionIds : [];
      const out = {};
      for (let i = 0; i < ids.length; i++){
        for (let j = i + 1; j < ids.length; j++){
          out[ids[i] + "|" + ids[j]] = 0;
        }
      }
      for (let i = 0; i < ids.length; i++){
        const d = (typeof defaultOf === "function") ? Number(defaultOf(ids[i])) : 0;
        out["player|" + ids[i]] = isFinite(d) ? Math.trunc(d) : 0;
      }
      return out;
    }
  };
};
// Loading convention: this file defines reputation at top level; the
// owner captures it after the boot list resolves.
