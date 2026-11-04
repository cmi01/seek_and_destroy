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
    MapVisibility(mapState, observerFaction){ return mapVisibility(mapState, observerFaction); },
    BattleEventAt(mapState, locationId, entering){ return battleEventAt(mapState, locationId, entering); },
    // M6(e) world life: the NPC turn — decisions per faction, applied through
    // the shared mover (injected here; siblings never name each other).
    MapAi(mapState, factionId, rng){ return mapAi(mapState, factionId, rng); },
    ApplyMapOrder(mapState, order, rng){
      return applyMapOrder(mapState, order, rng, { move: moveFleet, moveOpts: costOpts({}) });
    },
    NearestOpenSquare(mapState, from, rng){ return nearestOpenSquare(mapState, from, rng); },
    MapFrame(mapState, view){
      // The render sees only what the observer detects (map visibility:
      // N squares = N ships; nebula squares hide battles). The visibility
      // output arrives here as sibling data the composer injects — the
      // frame child never names its sibling.
      const vis = mapVisibility(mapState, "player");
      return mapFrame(mapState, view, {
        visibleFleets: vis.detectedFleets.map(function (f){ return f.id; }),
        battles: vis.battles
      });
    }
  };
};
