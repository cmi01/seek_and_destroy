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
  return {
    BuildMapState(campaignData, shipSpecs, rng){ return buildMapState(campaignData, shipSpecs, rng); },
    FuelCost(fleet, distance, space, mult){ return fuelCost(fleet, distance, space, mult); },
    MerchantOffer(mapState, fleetId, reason){ return merchantOffer(mapState, fleetId, reason); },
    MoveFleet(mapState, fleetId, dest, opts){
      const o = opts || {};
      const res = moveFleet(mapState, fleetId, dest, {
        mult: o.mult,
        costFn: function (fleet, distance, space, mult){ return fuelCost(fleet, distance, space, mult); }
      });
      const events = res.events.map(function (e){
        return (e && e.kind === "merchantFleetEvent")
          ? Object.assign({}, e, { offer: merchantOffer(res.mapState, e.fleetId, e.reason) })
          : e;
      });
      return { mapState: res.mapState, events: events };
    }
  };
};
