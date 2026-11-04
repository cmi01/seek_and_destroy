"use strict";

// ============================================================
// economySuite.js — job: run the station-economy self-tests through the game-side test bridge.
// Owner: gameTests.js. Holds no state.
// ============================================================
const economySuite = function (bridge, testName) {
  // RNG pin (T-9 flake, t_39002303): the planner's per-unit plan pick draws a
  // "mistake" roll from the seeded RNG seam — unseeded it is Math.random —
  // and a roll below the difficulty's mistake chance swaps in the 2nd-best
  // plan. Unseeded, T-9's composite-plan assertion flipped at that 12% rate
  // (observed at v139: 35/300 isolated and 3/15 full-suite runs, failing
  // detail "2-AP plan apCost: 1"; 14 of 100 seeds reproduce it).
  // clearBoard() re-seeds to the canonical fixture seed (42, pinned with its
  // observed outcomes in the test-architecture seed fixture) so every board
  // test starts from the same stream position — no cross-test RNG drift —
  // and the runner tail restores the caller's RNG afterwards.
  const PIN_SEED = 42;
  const suite = {
    // Fresh state from the single template (profile kept), then only the
    // test-specific board: open space, AI has credits, player has none.
    clearBoard() {
      bridge.resetState();
      bridge.setSeed(PIN_SEED);
      const st = bridge.state;
      const gridSize = bridge.gridSize;
      st.terrain = Array.from({ length: gridSize }, () => Array(gridSize).fill("EMPTY"));
      st.asteroidSeeds = Array.from({ length: gridSize }, (_, x) => Array.from({ length: gridSize }, (__, y) => ((x * 73 + y * 37) % 100) / 100));
      st.credits = { 1: 0, 2: 20000 }; st.income = { 1: 0, 2: 0 };
    },

    // ---- M4(a): seeded market + trade transforms ----------------------
    // T-M4a-1: same seed ⇒ identical price table over goods/hulls/weapons
    // x locations x times; a different seed yields a different table.
    testMarketPriceDeterminism() {
      function table(seed) {
        const m = bridge.marketFromTable();
        m.seed = seed;
        const goods = ["goods", "fuel", "crew", "parts", "hull:Fighter", "weapon:Light Cannon"];
        const locs = ["sol-gate", "khepri-station", ""];
        const times = [1, 21, 41];
        const rows = [];
        for (let i = 0; i < goods.length; i++) {
          for (let j = 0; j < locs.length; j++) {
            for (let k = 0; k < times.length; k++) {
              rows.push(goods[i] + "|" + locs[j] + "|" + times[k] + "=" + bridge.economyPrice(m, goods[i], locs[j], times[k]));
            }
          }
        }
        return rows.join(";");
      }
      const base = bridge.marketFromTable();
      const a = table(base.seed);
      const b = table(base.seed);
      const c = table(base.seed + 1);
      const pass = a === b && a !== c;
      return {
        name: "M4 SEEDED PRICE DETERMINISM (same seed = same table)",
        pass: pass,
        detail: "repeat identical: " + (a === b) + "; seed+1 differs: " + (a !== c)
      };
    },

    // T-M4a-2: a buy-then-sell round-trip at one quote loses exactly the
    // spread (M4 acceptance); buying nudges the local price for the next
    // quote (DESIGN "buying moves the local price").
    testSpreadRoundTrip() {
      bridge.initializeCampaign();
      const st = JSON.parse(JSON.stringify(bridge.campaign));
      st.wallet = 100000;
      const loc = "sol-gate";
      const qty = 5;
      const unit = bridge.economyQuote(st, "goods", loc, st.map.turn);
      const buyRes = bridge.economyTrade(st, "goods", qty, loc, unit);
      const sold = buyRes && buyRes.state ? bridge.economyTrade(buyRes.state, "goods", -qty, loc, unit) : null;
      const gap = unit.buy - unit.sell;
      const expectedLoss = qty * gap;
      const loss = sold && sold.state ? st.wallet - sold.state.wallet : NaN;
      const movedUp = Boolean(buyRes && buyRes.state && buyRes.state.market.prices[loc].goods > 1);
      const spreadExact = gap === Math.round(unit.buy * st.market.spread);
      const pass = Boolean(sold && sold.state && loss === expectedLoss && spreadExact && movedUp);
      return {
        name: "M4 BUY-THEN-SELL LOSES EXACTLY THE SPREAD",
        pass: pass,
        detail: "buy=" + unit.buy + " sell=" + unit.sell + " gap=" + gap + " loss=" + loss + "/" + expectedLoss + " localMoved=" + movedUp
      };
    },

    // T-M4a-3: buying a hull updates wallet + fleet consistently (the
    // browser acceptance criterion in pure form): wallet drops by the quote,
    // the roster gains a full-crewed hull record.
    testTradeHullConsistency() {
      bridge.initializeCampaign();
      const st = JSON.parse(JSON.stringify(bridge.campaign));
      const loc = "sol-gate";
      const unit = bridge.economyQuote(st, "hull:Fighter", loc, st.map.turn);
      const before = st.fleet.length;
      const res = bridge.economyTrade(st, "hull:Fighter", 1, loc, unit);
      const s = res ? res.state : null;
      const added = s && s.fleet.length === before + 1 ? s.fleet[s.fleet.length - 1] : null;
      const spec = bridge.shipSpecs["Fighter"];
      const pass = Boolean(s && s.wallet === st.wallet - unit.buy && added && added.hull === "Fighter" &&
        added.hp === spec.hp && added.crew === spec.crew && added.maxCrew === spec.crew &&
        JSON.stringify(s.cargo) === JSON.stringify(st.cargo));
      return {
        name: "M4 BUY A HULL UPDATES WALLET/CARGO/FLEET",
        pass: pass,
        detail: "wallet " + st.wallet + " -> " + (s ? s.wallet : "?") + " quote " + unit.buy + " fleet " + before + " -> " + (s ? s.fleet.length : "?")
      };
    },

    // T-M4a-4: illegal trades return { state: null }: no funds, no stock,
    // unknown good, and the flagship is never sold (permadeath locus).
    testTradeRejections() {
      bridge.initializeCampaign();
      const st = JSON.parse(JSON.stringify(bridge.campaign));
      const loc = "sol-gate";
      const unit = bridge.economyQuote(st, "parts", loc, st.map.turn);
      const poor = bridge.economyTrade({ wallet: 1, cargo: st.cargo, fleet: st.fleet, map: st.map, market: st.market }, "parts", 1, loc, unit);
      const noStock = bridge.economyTrade(st, "goods", -3, loc, unit);
      const badGood = bridge.economyTrade(st, "warp drives", 1, loc, unit);
      const flagUnit = bridge.economyQuote(st, "hull:Flagship Battlecruiser", loc, st.map.turn);
      const sellFlag = bridge.economyTrade(st, "hull:Flagship Battlecruiser", -1, loc, flagUnit);
      const pass = poor.state === null && noStock.state === null && badGood.state === null && sellFlag.state === null;
      return {
        name: "M4 ILLEGAL TRADES REJECTED (funds/stock/unknown/flagship)",
        pass: pass,
        detail: "poor=" + (poor.state === null) + " noStock=" + (noStock.state === null) + " unknown=" + (badGood.state === null) + " flagship=" + (sellFlag.state === null)
      };
    },

    // ---- M4(b): the station storefront -------------------------------
    // T-M4b-1: the station model lays out posted quotes (rows carry the
    // same buy/sell numbers the economy seam quotes) and the map HUD offers
    // the STATION opener when docked.
    testStationModel() {
      bridge.initializeCampaign();
      const dock = bridge.stationDock();
      const st = JSON.parse(JSON.stringify(bridge.campaign));
      const bundle = bridge.stationBundle();
      const model = bridge.mapHudModel(st.map, { wallet: st.wallet, station: dock ? { name: dock.name } : null });
      const b = bridge.stationBundle();
      const tab = bridge.stationSetTab("hulls");
      const hullRows = tab.rows.filter(r => r.kind === "ware");
      const row = hullRows.find(r => r.id === "hull:Fighter");
      const unit = bridge.economyQuote(st, "hull:Fighter", dock ? dock.id : "", st.map.turn);
      const open = bridge.stationOpen();
      const btnOk = Boolean(model.station && model.station.buttons.some(x => x.id === "STATION_OPEN"));
      bridge.stationClose();
      const pass = Boolean(dock && b.open && row && row.priceText === "BUY " + unit.buy + " / SELL " + unit.sell &&
        btnOk && open === "station" && hullRows.length > 0);
      return {
        name: "M4 STATION MODEL + POSTED QUOTES + MAP OPENER",
        pass: pass,
        detail: "dock=" + (dock ? dock.id : "none") + " hullRows=" + hullRows.length + " fighter=" + (row ? row.priceText : "?") + " openerBtn=" + btnOk + " modal=" + open
      };
    },

    // T-M4b-2: repair/refit consume parts at the market rates (proportional
    // HP restore; per swapped weapon).
    testRepairRefitParts() {
      bridge.initializeCampaign();
      const st = JSON.parse(JSON.stringify(bridge.campaign));
      st.fleet[1].hp = 1;                      // Fighter at 1/2 HP
      st.cargo.parts = 10;
      const perHp = st.market.repairPartsPerHp;
      const repair = bridge.stationService(st, { kind: "repair", ship: 1 });
      const rep = repair.state;
      const cost = Math.round((st.fleet[1].maxHp - 1) * perHp);
      // Refit: give the Fighter a non-default loadout, then refit it home.
      const dirty = JSON.parse(JSON.stringify(st));
      dirty.fleet[1].loadout = ["Light Cannon"];
      const want = st.market.wares["hull:Fighter"].defaultLoadout;
      const swaps = want.filter((w, i) => dirty.fleet[1].loadout[i] !== w).length + Math.max(0, dirty.fleet[1].loadout.length - want.length);
      const refit = bridge.stationService(dirty, { kind: "refit", ship: 1 });
      const refCost = swaps * st.market.refitPartsPerSwap;
      const none = bridge.stationService(st, { kind: "refit", ship: 1 });   // already default
      const pass = Boolean(rep && rep.fleet[1].hp === st.fleet[1].maxHp && rep.cargo.parts === 10 - cost &&
        refit && refit.state && JSON.stringify(refit.state.fleet[1].loadout) === JSON.stringify(want) &&
        refit.state.cargo.parts === 10 - refCost && none.state === null);
      return {
        name: "M4 REPAIR/REFIT CONSUME PARTS",
        pass: pass,
        detail: "repairCost=" + cost + " parts=" + (rep ? rep.cargo.parts : "?") + " refitCost=" + refCost + " refitParts=" + (refit && refit.state ? refit.state.cargo.parts : "?") + " noopRejected=" + (none.state === null)
      };
    },

    // T-M4b-3: the browser acceptance in pure-live form — at a station buy
    // a hull and observe wallet/cargo/fleet update consistently, and the
    // save round-trip preserves it exactly.
    testStationHullBuySaveRoundTrip() {
      bridge.initializeCampaign();
      const before = JSON.parse(JSON.stringify(bridge.campaign));
      const live = bridge.stationTradeLive("hull:Fighter", 1);
      const walletOk = live.wallet < before.wallet && live.fleet.length === before.fleet.length + 1;
      const saved = bridge.saveState();
      bridge.stationTradeLive("hull:Fighter", 1);      // drift the live state
      const restored = bridge.loadState(saved) && JSON.parse(JSON.stringify(bridge.campaign));
      const roundTrip = Boolean(restored && restored.wallet === live.wallet && restored.fleet.length === live.fleet.length &&
        JSON.stringify(restored.market.prices) === JSON.stringify(live.market.prices));
      bridge.initializeCampaign();
      const pass = Boolean(walletOk && roundTrip);
      return {
        name: "M4 STATION HULL BUY: WALLET/FLEET + SAVE ROUND-TRIP",
        pass: pass,
        detail: "wallet " + before.wallet + " -> " + live.wallet + " fleet " + before.fleet.length + " -> " + live.fleet.length + " roundTrip=" + roundTrip
      };
    },

    // ---- M4(c): crew model — casualties, incapacitation, wages --------
    // T-M4c-1: casualties = half the HP-lost percentage (DESIGN §4.5, the
    // combat-math casualty transform); a fully crewed ship cannot be
    // incapacitated in one battle (100% damage leaves exactly 50% crew —
    // strictly-under gate).
    testCrewCasualtyFormula() {
      const a = bridge.crewKilled(10, 10, 20);
      const b = bridge.crewKilled(5, 10, 20);
      const c = bridge.crewKilled(0, 10, 20);
      const d = bridge.crewKilled(1, 10, 5);
      const after = { crew: 20 - a, maxCrew: 20 };
      const pass = a === 10 && b === 5 && c === 0 && d === 0 && bridge.crewVerdict(after) === "ok";
      return {
        name: "M4 CREW CASUALTY FORMULA (half the HP-lost percentage)",
        pass: pass,
        detail: "100%->" + a + " 50%->" + b + " 0%->" + c + " tiny->" + d + " fullCrewedPost=" + bridge.crewVerdict(after)
      };
    },

    // T-M4c-2: the 50% incapacitation gate — a ship under 50% crew cannot
    // act in battle (verdicts refuse it) or be deployed (the plan excludes
    // it even when picked); the flagship ALWAYS deploys (Q2) but cannot act.
    testCrewStatusGate() {
      this.clearBoard();
      bridge.state.activeTeam = 1;
      bridge.state.ap = 4;
      const u = bridge.createUnit("Attack Frigate", 1, 16, 16, false);
      u.flags.delete("+shield");
      const okFull = bridge.canShield(u, { x: 16, y: 16 });
      u.crew = Math.floor(u.maxCrew * 0.49);
      const okLow = bridge.canShield(u, { x: 16, y: 16 });
      u.crew = u.maxCrew * 0.5;
      const okHalf = bridge.canShield(u, { x: 16, y: 16 });
      const fleet = [
        { hull: "Flagship Battlecruiser", crew: 5, maxCrew: 60, flagship: true },
        { hull: "Fighter", crew: 2, maxCrew: 5 },
        { hull: "Probe", crew: 5, maxCrew: 5 }
      ];
      const plan = bridge.deployPlan(fleet, 3, [1]);
      const deployedHulls = plan.deployed.map(e => e.hull).join(",");
      const pass = Boolean(okFull && !okLow && okHalf &&
        plan.deployed.length === 2 && plan.deployed[0].flagship === true &&
        deployedHulls.indexOf("Probe") !== -1 && plan.overflow.length === 1 && plan.overflow[0].hull === "Fighter");
      return {
        name: "M4 CREW 50% GATE: ACT + DEPLOY (flagship deploys, Q2)",
        pass: pass,
        detail: "act full=" + okFull + " low=" + okLow + " half=" + okHalf + " deployed=" + deployedHulls + " overflow=" + plan.overflow.map(e => e.hull).join(",")
      };
    },

    // T-M4c-3: wages on the campaign clock — 5 ⒸB/crew/month rounding up
    // (87.5 -> 88), month = 30 map turns (Q6), year rollover, and unpaid
    // bills desert crew from the most expensive hulls first.
    testWagesMonthTick() {
      bridge.initializeCampaign();
      const st = JSON.parse(JSON.stringify(bridge.campaign));
      st.fleet = [{ hull: "Fighter", loadout: [], hp: 2, maxHp: 2, crew: 17.5, maxCrew: 5 }];
      st.cargo.crew = 0;
      st.wallet = 1000;
      st.map.turn = 31;
      const res = bridge.wageTick(st);
      const rounded = res.state.wallet === 1000 - 88 && res.unpaid === 0 && res.state.clock.month === 2;

      const st2 = JSON.parse(JSON.stringify(bridge.campaign));
      st2.fleet = [
        { hull: "Battleship", loadout: [], hp: 1, maxHp: 1, crew: 10, maxCrew: 20 },
        { hull: "Fighter", loadout: [], hp: 2, maxHp: 2, crew: 10, maxCrew: 5 }
      ];
      st2.cargo.crew = 0;
      st2.wallet = 50;
      st2.map.turn = 31;
      const res2 = bridge.wageTick(st2);
      const desert = res2.unpaid === 50 && res2.state.wallet === 0 &&
        res2.state.fleet[0].crew === 0 && res2.state.fleet[1].crew === 10;

      const st3 = JSON.parse(JSON.stringify(bridge.campaign));
      st3.fleet = [];
      st3.cargo.crew = 0;
      st3.wallet = 0;
      st3.clock = { month: 12, year: 2401 };
      st3.map.turn = 391;
      const res3 = bridge.wageTick(st3);
      const rollover = res3.state.clock.year === 2402 && res3.state.clock.month === 2;
      const pass = Boolean(rounded && desert && rollover);
      return {
        name: "M4 WAGES MONTH TICK (87.5 -> 88; desertion; year rollover)",
        pass: pass,
        detail: "bill88=" + rounded + " desert=" + desert + " (unpaid " + res2.unpaid + " battleship " + res2.state.fleet[0].crew + " fighter " + res2.state.fleet[1].crew + ") year=" + res3.state.clock.year + "/" + res3.state.clock.month
      };
    },

    // ---- M4(d): merchant-fleet flow ---------------------------------
    // T-M4d-1: a rejected move (no fuel) opens the merchant storefront
    // (the M3 offer wired for real): provisions (crew/fuel) priced at the
    // inflated multiplier, anything-on-sale at the discount; buying fuel
    // rescues the stranded fleet and the next move goes through.
    testMerchantFlowRescue() {
      bridge.initializeCampaign();
      const m0 = JSON.parse(JSON.stringify(bridge.mapSection()));
      m0.fleets = m0.fleets.map(f => f.faction === "player" ? { ...f, fuel: 0 } : f);
      bridge.mapSet(m0);
      const evs = bridge.mapTravelLive({ x: 10, y: 30 });
      const offered = evs.some(e => e && e.kind === "merchantFleetEvent");
      const mapAfter = bridge.mapSection();
      const pending = mapAfter.pendingMerchant;
      const b = bridge.stationBundle();
      const modal = bridge.activeModal();

      const st = JSON.parse(JSON.stringify(bridge.campaign));
      const turn = st.map.turn;
      const midFuel = bridge.economyPrice(st.market, "fuel", st.map.locationId, turn);
      const midCrew = bridge.economyPrice(st.market, "crew", st.map.locationId, turn);
      const fuelRow = b.rows.find(r => r.id === "fuel");
      const crewRow = b.rows.find(r => r.id === "crew");
      const quotesOk = Boolean(fuelRow && crewRow &&
        fuelRow.priceText === "BUY " + Math.round(midFuel * 1.3) + " / SELL " + Math.round(midFuel * 0.7) &&
        crewRow.priceText === "BUY " + Math.round(midCrew * 1.3) + " / SELL " + Math.round(midCrew * 0.7));

      // Provisions only: no hulls/weapons on the merchant's buy side.
      const provisionsOnly = b.rows.every(r => r.id === "crew" || r.id === "fuel");

      // Rescue: buy a fuel lot at the posted inflated price, then move.
      const walletBefore = st.wallet;
      bridge.stationTradeLive("fuel", 1);
      const afterBuy = JSON.parse(JSON.stringify(bridge.campaign));
      const tank = afterBuy.map.fleets.find(f => f.faction === "player").fuel;
      const paid = walletBefore - afterBuy.wallet;
      const evs2 = bridge.mapTravelLive({ x: 12, y: 30 });
      const rescued = evs2.some(e => e && e.kind === "fleetMoved");
      const cleared = !bridge.mapSection().pendingMerchant;
      bridge.initializeCampaign();

      const pass = Boolean(offered && pending && pending.offer &&
        pending.offer.buyMultiplier === 1.3 && pending.offer.sellMultiplier === 0.7 &&
        b.mode === "merchant" && modal === "station" && quotesOk && provisionsOnly &&
        tank > 0 && paid === 50 * Math.round(midFuel * 1.3) && rescued && cleared);
      return {
        name: "M4 MERCHANT FLOW: STRANDED FLEET RESCUED (x1.3 provisions / x0.7 sale)",
        pass: pass,
        detail: "offered=" + offered + " mode=" + b.mode + " quotesOk=" + quotesOk + " provisionsOnly=" + provisionsOnly +
          " tank=" + tank + " paid=" + paid + " rescued=" + rescued + " cleared=" + cleared
      };
    },

    // T-M4d-2: the merchant's sale side takes anything at the discount.
    testMerchantSaleDiscount() {
      bridge.initializeCampaign();
      const m0 = JSON.parse(JSON.stringify(bridge.mapSection()));
      m0.fleets = m0.fleets.map(f => f.faction === "player" ? { ...f, fuel: 0 } : f);
      bridge.mapSet(m0);
      bridge.mapTravelLive({ x: 10, y: 30 });   // rejected -> merchant
      bridge.stationSetTab("sell");
      const b = bridge.stationBundle();
      const st = JSON.parse(JSON.stringify(bridge.campaign));
      st.cargo.goods = 10;
      bridge.state.campaign.cargo.goods = 10;   // hold goods to sell
      const midGoods = bridge.economyPrice(st.market, "goods", st.map.locationId, st.map.turn);
      const goodsRow = b.rows.find(r => r.id === "goods");
      // Sell 10 goods at the discount: wallet gains 10 x round(mid x 0.7).
      const walletBefore = st.wallet;
      bridge.stationTradeLive("goods", -1);
      const after = JSON.parse(JSON.stringify(bridge.campaign));
      const gained = after.wallet - walletBefore;
      const pass = Boolean(goodsRow && goodsRow.canBuy === false &&
        goodsRow.priceText === "BUY " + Math.round(midGoods * 1.3) + " / SELL " + Math.round(midGoods * 0.7) &&
        gained === 10 * Math.round(midGoods * 0.7) && after.cargo.goods === 0);
      bridge.initializeCampaign();
      return {
        name: "M4 MERCHANT SALE: ANYTHING AT THE DISCOUNT (x0.7)",
        pass: pass,
        detail: "goodsRow=" + (goodsRow ? goodsRow.priceText : "?") + " gained=" + gained + " expected=" + (10 * Math.round(midGoods * 0.7)) + " cargo=" + after.cargo.goods
      };
    },

    runAll() {
      return [
        this.testMarketPriceDeterminism(),this.testSpreadRoundTrip(),
        this.testTradeHullConsistency(),this.testTradeRejections(),this.testStationModel(),
        this.testRepairRefitParts(),this.testStationHullBuySaveRoundTrip(),
        this.testCrewCasualtyFormula(),this.testCrewStatusGate(),this.testWagesMonthTick(),
        this.testMerchantFlowRescue(),this.testMerchantSaleDiscount()
      ];
    }
  };

  if (testName && typeof suite[testName] === "function") return suite[testName]();
  return suite.runAll();
};
