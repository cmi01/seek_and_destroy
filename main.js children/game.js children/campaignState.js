"use strict";

// ============================================================
// campaignState.js — job: compose the campaign state handle over its
// per-operation children (initialize / patch / roster read / battle seam).
// Owner: game.js. Holds no state unless it is a core.
//
// M1 boundary (roadmap-design §4.1): campaignState children are pure
// transforms over the campaign section of state only — they never touch
// battle state, rendering or storage.
// M2 seam (roadmap-design §4.2): beginBattle / applyBattleResult are the
// only battle↔campaign translators. Sibling transforms (deployment split,
// crew-lost) arrive as injected arguments so this file never names them.
// ============================================================

const campaignState = function (){
  return {
    InitializeCampaignState(campaignData, shipSpecs){ return initializeCampaignState(campaignData, shipSpecs); },
    TryPatchCampaignState(state, patch){ return tryPatchCampaignState(state, patch); },
    RosterOf(section, filter){ return rosterOf(section, filter); },
    BeginBattle(section, encounter, deployFn){ return beginBattle(section, encounter, deployFn); },
    ApplyBattleResult(section, battleResult, shipSpecs, crewLostFn){ return applyBattleResult(section, battleResult, shipSpecs, crewLostFn); }
  };
};
