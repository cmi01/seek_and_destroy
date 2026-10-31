"use strict";

// ============================================================
// endgameStatus.js — job: detect endgame from the unit list.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("endgameStatus", () => {
  function checkEndgameStatus(units){
    const us = units || [];
    let t1 = 0, t2 = 0;
    for (let i = 0; i < us.length; i++){
      const u = us[i];
      if (u.hp > 0 && u.flags.has("!flagship")){
        if (u.team === 1) t1++;
        else if (u.team === 2) t2++;
      }
    }
    const anyFlagships = (t1 + t2) > 0;
    return { t1Flagships: t1, t2Flagships: t2, t1Defeated: anyFlagships && t1 === 0, t2Defeated: anyFlagships && t2 === 0 };
  }

  return {
    checkEndgameStatus
  };
});
