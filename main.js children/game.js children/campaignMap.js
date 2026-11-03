"use strict";

// ============================================================
// campaignMap.js — job: compose the campaign-map handle over its
// per-operation children (map build / move / fuel / merchant quote).
// Owner: game.js. Holds no state unless it is a core.
//
// M3 boundary (roadmap-design §4.3): these children operate on MapState +
// the campaign section only. Sibling functions never reference each other —
// the composer injects the cost function into the mover, and attaches the
// placeholder merchant offer to the move-rejection event here, one level up.
// ============================================================

const campaignMap = function (){
  // The composer's own glue: rejection events carry the placeholder offer.
  function withOffers(res){
    const events = res.events.map(function (e){
      return (e && e.kind === "merchantFleetEvent")
        ? Object.assign({}, e, { offer: merchantOffer(res.mapState, e.fleetId, e.reason) })
        : e;
    });
    return { mapState: res.mapState, events: events };
  }
  function costOpts(opts){
    const o = opts || {};
    return {
      mult: o.mult,
      costFn: function (fleet, distance, space, mult){ return fuelCost(fleet, distance, space, mult); }
    };
  }
  return {
    BuildMapState(campaignData, shipSpecs, rng){ return buildMapState(campaignData, shipSpecs, rng); },
    FuelCost(fleet, distance, space, mult){ return fuelCost(fleet, distance, space, mult); },
    MerchantOffer(mapState, fleetId, reason){ return merchantOffer(mapState, fleetId, reason); },
    MoveFleet(mapState, fleetId, dest, opts){
      return withOffers(moveFleet(mapState, fleetId, dest, costOpts(opts)));
    },
    HyperspaceJump(mapState, fleetId, target, opts){
      return withOffers(hyperspaceJump(mapState, fleetId, target, costOpts(opts)));
    },
    MapFrame(mapState, view){ return mapFrame(mapState, view); }
  };
};
