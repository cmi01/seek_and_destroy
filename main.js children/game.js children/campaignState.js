"use strict";

// ============================================================
// campaignState.js — job: compose the campaign state handle over its
// per-operation children (initialize / patch / roster read).
// Owner: game.js. Holds no state unless it is a core.
//
// M1 boundary (roadmap-design §4.1): campaignState children are pure
// transforms over the campaign section of state only — they never touch
// battle state, rendering or storage.
// ============================================================

const campaignState = function (){
  return {
    InitializeCampaignState(campaignData, shipSpecs){ return initializeCampaignState(campaignData, shipSpecs); },
    TryPatchCampaignState(state, patch){ return tryPatchCampaignState(state, patch); },
    RosterOf(campaignState, filter){ return rosterOf(campaignState, filter); }
  };
};
