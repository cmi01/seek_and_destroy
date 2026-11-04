"use strict";

// ============================================================
// economy.js — job: compose the campaign-economy handle over its
// per-operation children (market build / seeded price / trade / wages).
// Owner: game.js. Holds no state unless it is a core.
//
// M4 boundary (roadmap-design §4.4/§5.4): prices and rates live in
// campaign_DATA.js only (R9) and reach these children as the frozen trade
// table / seeded market state. Sibling functions never reference each
// other — the composer injects the child price into the trade applier the
// same way the map composer injects its cost function. Transforms return
// NEW state; game.js applies it.
//
// Quote rule (the buy/sell spread, expressed once, here): priceAt yields
// the integer mid price `buy`; the sell side is `buy − round(buy × spread)`,
// so a buy-then-sell round-trip at one quote loses exactly that spread.
// "Buying moves the local price" = applyTrade nudges the location's price
// multiplier for the NEXT quote. The executed quote is the one handed in —
// the price the station shows is the price the trade pays (a posted price),
// which is what makes the round-trip loss exactly the spread.
// ============================================================

const economy = function (){
  // The spread rule: quote one ware at one location/time.
  function quote(market, good, location, time){
    const buy = priceAt(market, good, location, time);
    const spread = (market && typeof market.spread === "number" && market.spread > 0) ? market.spread : 0;
    return { buy: buy, sell: buy - Math.round(buy * spread) };
  }

  return {
    BuildMarketState(trade, shipSpecs){ return buildMarketState(trade, shipSpecs); },
    PriceAt(market, good, location, time){ return priceAt(market, good, location, time); },
    Quote(state, good, location, time){ return quote(state && state.market, good, location, time); },
    ApplyTrade(state, good, qty, location, unit){
      // `unit` is the executed quote (optional trailing argument): when the
      // caller hands one in, the trade pays exactly that posted price.
      const u = unit || quote(state && state.market, good, location, (state && state.map && state.map.turn) || 1);
      return applyTrade(state, good, qty, location, { unit: u });
    }
  };
};
