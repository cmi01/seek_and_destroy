"use strict";

// ============================================================
// findMerchantOfferEvent.js — job: the first merchant-fleet event in an event list, or null (findMerchantOfferEvent).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const findMerchantOfferEvent = function (events){
  const list = Array.isArray(events) ? events : [];
  for (let i = 0; i < list.length; i++){
    const e = list[i];
    if (e && e.kind === "merchantFleetEvent"){
      return e;
    }
  }
  return null;
};
