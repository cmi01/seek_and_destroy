"use strict";

// ============================================================
// frameStatus.js — job: build the render frame's match-status slice: turn,
// phase, action points and resources.
// Owner: core/game.js (pure child). Holds no state.
// ============================================================
Game._registerModule("frameStatus", () => {

  function build(p){
    // p = { state, maxAp } — state-shape params in, plain status slice out.
    const st = p.state;

    return {
      levelId: st.levelId,
      turnNumber: st.turnNumber,
      activeTeam: st.activeTeam,
      ap: st.ap,
      maxAp: p.maxAp,
      gameOver: Boolean(st.gameOver),
      credits: st.credits ? { ...st.credits } : { 1: 0, 2: 0 },
      income: st.income ? { ...st.income } : { 1: 0, 2: 0 }
    };
  }

  return { build };
});
