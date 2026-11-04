"use strict";

// ============================================================
// mapSuite.js — job: run the campaign-map self-tests through the game-side test bridge.
// Owner: gameTests.js. Holds no state.
// ============================================================
const mapSuite = function (bridge, testName) {
  const suite = {

    // M3 AC: the exact move cost — ships x distance x 1 unit per ship per
    // distance unit, hyperspace x3 (Q5). Asserted on the query and on a real
    // move's event + fuel decrement.
    testMapFuelFormula() {
      const fleet = { ships: [{}, {}, {}] };
      const normal = bridge.travelCost(fleet, 4, "normal");
      const hyper = bridge.travelCost(fleet, 4, "hyperspace");
      const zero = bridge.travelCost(fleet, 0, "hyperspace");
      const m = bridge.mapFromTable();
      const pf = m.fleets.find(f => f.faction === "player");
      const res = bridge.travel(m, "player", { x: pf.x + 3, y: pf.y });
      const ev = res.events[0] || {};
      const movedFleet = res.mapState.fleets.find(f => f.id === "player");
      const moveCost = pf.ships.length * 3;
      const pass = normal === 12 && hyper === 36 && zero === 0 &&
        ev.kind === "fleetMoved" && ev.space === "normal" && ev.cost === moveCost &&
        movedFleet.fuel === pf.fuel - moveCost && ev.fuelLeft === movedFleet.fuel;
      return {
        name: "M3 FUEL FORMULA (ships x distance x space)",
        pass,
        detail: pass
          ? "3 ships x 4 -> 12 normal / 36 hyper; 5-ship move of 3 cost exactly 15"
          : ("q=" + normal + "/" + hyper + "/" + zero + " ev=" + ev.kind + ":" + ev.space + ":" + ev.cost + " fuel=" + movedFleet.fuel)
      };
    },

    // M3 AC: an unfuelled fleet's move is rejected and produces the
    // merchant-fleet event with the placeholder offer model attached.
    testMapUnfuelledMoveRejected() {
      const m = bridge.mapFromTable();
      const pf = m.fleets.find(f => f.faction === "player");
      const dry = { ...m, fleets: m.fleets.map(f => f.id === pf.id ? { ...f, fuel: 0 } : f) };
      const res = bridge.travel(dry, "player", { x: pf.x + 3, y: pf.y });
      const ev = res.events[0] || {};
      const still = res.mapState.fleets.find(f => f.id === "player");
      const offer = ev.offer || {};
      const pass = ev.kind === "merchantFleetEvent" && ev.reason === "no-fuel" &&
        ev.needed === pf.ships.length * 3 && ev.held === 0 &&
        still.x === pf.x && still.y === pf.y && res.mapState.turn === m.turn &&
        offer.kind === "merchant" && offer.buyMultiplier === 1.3 && offer.sellMultiplier === 0.7 &&
        offer.fuelUnitPrice === 500 && Array.isArray(offer.wares);
      return {
        name: "M3 UNFUELLED MOVE REJECTED + MERCHANT EVENT",
        pass,
        detail: pass
          ? "move refused (fuel 0), merchant offer attached (buy x1.3 / sell x0.7)"
          : ("ev=" + ev.kind + ":" + ev.reason + " offer=" + offer.kind + " pos=" + still.x + "," + still.y)
      };
    },

    // M3: a flagship under 50% crew cannot move — the move is rejected with
    // the merchant event (roadmap M3 fuel paragraph).
    testMapFlagshipCrewGate() {
      const m = bridge.mapFromTable();
      const pf = m.fleets.find(f => f.faction === "player");
      const hurt = {
        ...m,
        fleets: m.fleets.map(f => f.id === pf.id
          ? { ...f, fuel: 999, ships: f.ships.map(s => s.flagship ? { ...s, crew: Math.floor(s.maxCrew * 0.49) } : s) }
          : f)
      };
      const res = bridge.travel(hurt, "player", { x: pf.x + 3, y: pf.y });
      const ev = res.events[0] || {};
      const still = res.mapState.fleets.find(f => f.id === "player");
      const pass = ev.kind === "merchantFleetEvent" && ev.reason === "flagship-crew-low" &&
        still.x === pf.x && Boolean(ev.offer);
      return {
        name: "M3 FLAGSHIP UNDER 50% CREW CANNOT MOVE",
        pass,
        detail: pass ? "move refused at 49% crew, merchant event produced" : ("ev=" + ev.kind + ":" + ev.reason)
      };
    },

    // M3: fleet speed = slowest ship — the travelled distance is capped.
    testMapSlowestShipCapsMove() {
      const m = bridge.mapFromTable();
      const pf = m.fleets.find(f => f.faction === "player");
      const speeds = pf.ships.map(s => s.speed);
      const slowest = Math.min.apply(null, speeds);
      const res = bridge.travel(m, "player", { x: pf.x + 50, y: pf.y });
      const ev = res.events[0] || {};
      const pass = ev.kind === "fleetMoved" && ev.distance === slowest && ev.capped === true &&
        ev.to.x === pf.x + slowest;
      return {
        name: "M3 FLEET SPEED = SLOWEST SHIP",
        pass,
        detail: pass
          ? "long haul capped at " + slowest + " (speeds " + speeds.join(",") + ")"
          : ("ev=" + ev.kind + " d=" + ev.distance + " capped=" + ev.capped)
      };
    },

    // M3 (Q4): the map is frozen while a battle is active — no movement and
    // no merchant event, just the refusal.
    testMapFrozenDuringBattle() {
      const m = bridge.mapFromTable();
      const pf = m.fleets.find(f => f.faction === "player");
      const frozen = { ...m, battleActive: true };
      const res = bridge.travel(frozen, "player", { x: pf.x + 3, y: pf.y });
      const ev = res.events[0] || {};
      const pass = res.events.length === 1 && ev.kind === "moveRejected" && ev.reason === "map-frozen";
      return {
        name: "M3 MAP FROZEN DURING BATTLE (Q4)",
        pass,
        detail: pass ? "move refused while a battle is active" : ("ev=" + ev.kind + ":" + ev.reason)
      };
    },

    // M3 AC: save/restore round-trip includes the map, and a pre-map (M2-era)
    // save migrates onto the map schema with the saved anchor kept as the
    // fleet's location.
    testMapSaveRoundTripAndMigration() {
      const bad = [];
      const fail = (why) => bad.push(why);
      bridge.initializeCampaign();
      const before = bridge.campaign.map;
      if (!before || !Array.isArray(before.locations) || before.locations.length === 0) fail("init map has no locations");
      if (!Array.isArray(before.fleets) || before.fleets.length === 0) fail("init map has no fleets");
      const snapshot = JSON.stringify(before);

      const save = bridge.saveState();
      bridge.resetState();
      const loadOk = bridge.loadState(save);
      const restored = loadOk ? JSON.stringify(bridge.campaign.map) : "null";
      if (restored !== snapshot) fail("map not JSON-identical across save/restore");

      const fixture = {
        schema: "seek-and-destroy.beginning-game-state",
        version: "M1-1.0",
        state: {
          theme: "default",
          levelId: 101,
          turnNumber: 2,
          activeTeam: 1,
          ap: 4,
          credits: { 1: 1200, 2: 0 },
          income: { 1: 100, 2: 0 },
          gameOver: false,
          viewX: 0,
          viewY: 0,
          viewSpan: 16,
          campaign: {
            fleet: [{ hull: "Fighter", loadout: ["Dual Light Assault Cannon"], hp: 2, maxHp: 2, crew: 5 }],
            wallet: 25000,
            cargo: { goods: 0, fuel: 20, crew: 0, parts: 5 },
            reputation: {},
            clock: { month: 1, year: 2401 },
            map: { locationId: "khepri-station" }
          }
        }
      };
      if (!bridge.loadState(fixture)) fail("pre-map fixture rejected");
      const migrated = bridge.campaign.map;
      const anchor = bridge.mapFromTable().locations.find(l => l.id === "khepri-station");
      const pf = migrated && Array.isArray(migrated.fleets) ? migrated.fleets.find(f => f.faction === "player") : null;
      if (!migrated || !Array.isArray(migrated.locations) || migrated.locations.length === 0) fail("migrated map has no locations");
      if (!pf) fail("migrated map has no player fleet");
      if (pf && anchor && (pf.x !== anchor.x || pf.y !== anchor.y)) fail("player fleet not placed at the saved anchor");
      if (migrated && migrated.locationId !== "khepri-station") fail("saved anchor lost: " + (migrated && migrated.locationId));

      return {
        name: "M3 MAP SAVE ROUND-TRIP + MIGRATION",
        pass: bad.length === 0,
        detail: bad.length ? bad.slice(0, 4).join("; ") : "map JSON-identical across save/restore; pre-map save migrated to the anchor"
      };
    },


    // M3 (Q5): a hyperspace jump transit costs the x3 multiplier over the
    // edge-to-edge jump distance, departs the origin system's edge and lands
    // on the destination well's edge (gravity wells are destinations only).
    testMapJumpTransit() {
      const m = bridge.mapFromTable();
      const pf = m.fleets.find(f => f.faction === "player");
      const before = JSON.stringify(m.fleets.find(f => f.id === "player"));
      const res = bridge.mapJump(m, "player", "aurora-prime");
      const ev = res.events[0] || {};
      const landed = res.mapState.fleets.find(f => f.id === "player");
      const sol = m.locations.find(l => l.id === "sol-gate");
      const aur = m.locations.find(l => l.id === "aurora-prime");
      const fromEdgeOk = ev.from && Math.abs(Math.hypot(ev.from.x - sol.x, ev.from.y - sol.y) - sol.well) < 1e-9;
      const toEdgeOk = ev.to && Math.abs(Math.hypot(ev.to.x - aur.x, ev.to.y - aur.y) - aur.well) < 1e-9;
      const costOk = ev.cost === pf.ships.length * ev.distance * 3;
      const pass = ev.kind === "fleetJumped" && ev.space === "hyperspace" && costOk &&
        fromEdgeOk && toEdgeOk && landed.x === ev.to.x && landed.y === ev.to.y &&
        landed.fuel === pf.fuel - ev.cost && res.mapState.locationId === "aurora-prime" &&
        res.mapState.turn === m.turn + 1 && before !== JSON.stringify(landed);
      return {
        name: "M3 HYPERSPACE JUMP (Q5: edge-to-edge, x3 fuel)",
        pass,
        detail: pass
          ? ("jump " + ev.from.system + " -> " + ev.to.system + " d=" + ev.distance.toFixed(2) + " cost=" + ev.cost.toFixed(2))
          : ("ev=" + ev.kind + " costOk=" + costOk + " edges=" + fromEdgeOk + "/" + toEdgeOk + " loc=" + res.mapState.locationId)
      };
    },

    // M3 (Q5): jump points are at system edges and gravity wells are the
    // only destinations — deep space cannot jump and cannot be jumped to.
    testMapJumpPointRules() {
      const m = bridge.mapFromTable();
      const open = JSON.parse(JSON.stringify(m));
      const pf = open.fleets.find(f => f.faction === "player");
      open.fleets = open.fleets.map(f => f.id === pf.id ? { ...f, x: 20, y: 30 } : f);
      const fromOpen = bridge.mapJump(open, "player", "aurora-prime");
      const toOpen = bridge.mapJump(m, "player", "deep-space");
      const same = bridge.mapJump(m, "player", "sol-gate");
      const pass = fromOpen.events[0].reason === "no-jump-point" &&
        toOpen.events[0].reason === "unknown-target" &&
        same.events[0].reason === "already-there";
      return {
        name: "M3 JUMP POINTS AT EDGES, WELLS ONLY (Q5)",
        pass,
        detail: pass
          ? "deep space refused at both ends; same-well refused"
          : ("r1=" + fromOpen.events[0].reason + " r2=" + toOpen.events[0].reason + " r3=" + same.events[0].reason)
      };
    },

    // M3: an unfuelled jump is rejected with the merchant event + offer.
    testMapJumpUnfuelled() {
      const m = bridge.mapFromTable();
      const pf = m.fleets.find(f => f.faction === "player");
      const dry = { ...m, fleets: m.fleets.map(f => f.id === pf.id ? { ...f, fuel: 0 } : f) };
      const res = bridge.mapJump(dry, "player", "aurora-prime");
      const ev = res.events[0] || {};
      const pass = ev.kind === "merchantFleetEvent" && ev.reason === "no-fuel" &&
        ev.offer && ev.offer.kind === "merchant" && res.mapState === dry;
      return {
        name: "M3 UNFUELLED JUMP REJECTED + MERCHANT EVENT",
        pass,
        detail: pass ? "jump refused (fuel 0), offer attached" : ("ev=" + ev.kind + ":" + ev.reason)
      };
    },

    // M3 AC (render contract): the map DTO is plain data for the map scene —
    // kind "map", the view window, and hyperspace true only when the player
    // fleet is outside every gravity well.
    testMapFrameDto() {
      const m = bridge.mapFromTable();
      const v = bridge.mapView(m, { x: 0, y: 0, span: 64 });
      const pf = m.fleets.find(f => f.faction === "player");
      const open = JSON.parse(JSON.stringify(m));
      open.fleets = open.fleets.map(f => f.id === pf.id ? { ...f, x: 20, y: 30 } : f);
      const v2 = bridge.mapView(open, null);
      const pass = v.kind === "map" && v.span === 64 && v.hyperspace === false &&
        v2.hyperspace === true && Array.isArray(v.locations) && v.locations.length === 12 &&
        Array.isArray(v.fleets) && v.fleets.some(f => f.isPlayer) &&
        v.screen === "map" && typeof v.turn === "number";
      return {
        name: "M3 MAP DTO (kind/view/hyperspace flag)",
        pass,
        detail: pass
          ? "in-well hyperspace=false, deep-space hyperspace=true, 12 locations"
          : ("kind=" + v.kind + " hs=" + v.hyperspace + "/" + v2.hyperspace + " locs=" + (v.locations || []).length)
      };
    },


    // M3(c): fleets are detected at N squares = N ships (map visibility).
    testMapDetectionRadius() {
      const m = bridge.mapFromTable();
      const pf = m.fleets.find(f => f.faction === "player");
      const probe = JSON.parse(JSON.stringify(m));
      probe.fleets = probe.fleets.filter(f => f.faction === "player");
      probe.fleets.push({ id: "probe-fleet", faction: "Syndicate", x: pf.x + 4, y: pf.y, fuel: 0, ships: [{}, {}, {}] });
      const near = bridge.mapScan(probe, "player");
      probe.fleets[1].x = pf.x + 6;
      const far = bridge.mapScan(probe, "player");
      const pass = near.detectedFleets.some(f => f.id === "probe-fleet") &&
        !far.detectedFleets.some(f => f.id === "probe-fleet") &&
        near.detectedFleets.filter(f => f.faction === "player").length === 1;
      return {
        name: "M3 DETECTION RADIUS = SHIP COUNT (N squares = N ships)",
        pass,
        detail: pass
          ? ("5-ship fleet detects probe at d=4, hides it at d=6")
          : ("near=" + near.detectedFleets.map(f => f.id).join(",") + " far=" + far.detectedFleets.map(f => f.id).join(","))
      };
    },

    // M3(c): nebula squares hide battles (never reserves).
    testNebulaHidesBattles() {
      const m = bridge.mapFromTable();
      const withBattles = JSON.parse(JSON.stringify(m));
      withBattles.locations.push({ id: "syn-nebula", kind: "nebula", name: "Syn Nebula", x: 60, y: 60, well: 6 });
      withBattles.battles = [
        { x: 60, y: 60, locationId: "syn-nebula" },
        { x: 2, y: 2, locationId: "open-space" }
      ];
      const vis = bridge.mapScan(withBattles, "player");
      const pass = vis.battles.length === 1 && vis.battles[0].locationId === "open-space";
      return {
        name: "M3 NEBULA SQUARES HIDE BATTLES",
        pass,
        detail: pass
          ? ("nebula battle hidden, open-space battle visible")
          : ("battles=" + vis.battles.map(b => b.locationId).join(","))
      };
    },

    // M3(c): entering a fleet/location opens it (the encounter resolver) with the
    // nearest map-relative entry edge; empty space opens nothing.
    testMapEncounterOpensOnEntry() {
      const m = bridge.mapFromTable();
      const foe = m.fleets.find(f => f.faction !== "player");
      const fleetEv = bridge.mapBattleEvent(m, m.locationId, { x: foe.x, y: foe.y });
      const m2 = JSON.parse(JSON.stringify(m));
      m2.locations.push({ id: "syn-fort", kind: "planet", name: "Syn Fort", x: 62, y: 62, well: 6, defenders: ["Fighter"], levelId: 102 });
      const locEv = bridge.mapBattleEvent(m2, "syn-fort", { x: 58, y: 62 });
      const empty = bridge.mapBattleEvent(m, "", { x: 2, y: 2 });
      const edgeOk = locEv && locEv.entry && Math.abs(locEv.entry.x - 56) < 1e-9 && Math.abs(locEv.entry.y - 62) < 1e-9 && locEv.entry.edge === "W";
      const pass = fleetEv && fleetEv.kind === "fleet" && fleetEv.joinNextTurn === true &&
        locEv && locEv.kind === "location" && locEv.levelId === 102 && edgeOk &&
        empty === null;
      return {
        name: "M3 ENCOUNTER OPENS ON ENTRY (fleet/location; edge = nearest)",
        pass,
        detail: pass
          ? ("fleet + defended-location setups; entry W edge at (56,62)")
          : ("fleetEv=" + (fleetEv && fleetEv.kind) + " locEv=" + (locEv && locEv.kind) + " edgeOk=" + edgeOk + " empty=" + empty)
      };
    },

    // M3(c) Q4: a fleet entering an in-progress battle joins at the nearest
    // map-relative edge on the NEXT turn.
    testMapJoinNextTurnQ4() {
      const m = bridge.mapFromTable();
      const foe = m.fleets.find(f => f.faction !== "player");
      const frozen = JSON.parse(JSON.stringify(m));
      frozen.battleActive = true;
      const join = bridge.mapBattleEvent(frozen, frozen.locationId, { x: foe.x, y: foe.y });
      const pass = join && join.kind === "join" && join.joinNextTurn === true &&
        join.entry && typeof join.entry.edge === "string";
      return {
        name: "M3 ENTERING FLEET JOINS AT NEAREST EDGE NEXT TURN (Q4)",
        pass,
        detail: pass
          ? ("join setup kind=" + join.kind + " edge=" + join.entry.edge)
          : ("join=" + JSON.stringify(join))
      };
    },

    // M3(c): an opened encounter enters battle on the NEXT turn through the
    // M2 seam (startSector -> the deployment step), and the map stays the
    // encounter source (the level ladder is retired).
    testMapEncounterNextTurnLaunch() {
      const m = bridge.mapFromTable();
      const foe = m.fleets.find(f => f.faction !== "player");
      const before = JSON.parse(JSON.stringify(m));
      before.fleets = before.fleets.map(f => f.faction === "player" ? { ...f, x: foe.x - 1, y: foe.y } : f);
      before.pendingEncounter = null;
      bridge.mapSet(before);
      bridge.mapTravelLive({ x: foe.x, y: foe.y });
      const after = bridge.mapSection();
      const opened = Boolean(after.pendingEncounter && after.pendingEncounter.kind === "fleet");
      const hail = opened ? bridge.hailModel(after.pendingEncounter) : null;
      const hailOk = Boolean(hail && hail.options.join(",") === "talk,threaten,leave");
      // The NEXT turn commits the encounter to battle (M2 seam: deploy step).
      bridge.mapEndTurn();
      const launched = bridge.activeModal() === "deploy";
      bridge.closeDeploy();
      bridge.mapSet(before);
      const pass = opened && hailOk && launched;
      return {
        name: "M3 ENCOUNTER -> BATTLE NEXT TURN VIA M2 SEAM (ladder retired)",
        pass,
        detail: pass
          ? ("entry opened fleet encounter; next-turn commit reached the deployment step")
          : ("opened=" + opened + " hailOk=" + hailOk + " launched=" + launched + " modal=" + bridge.activeModal())
      };
    },

    // M3(c): the map HUD + hailing shell models (the HUD composer's children).
    testMapHudAndHailModels() {
      const m = bridge.mapFromTable();
      const hud = bridge.mapHudModel(m, { wallet: 25000 });
      const hail = bridge.hailModel({ kind: "fleet", encounterFaction: "Syndicate", locationId: "sol-gate" });
      const hudHail = bridge.mapHudModel(m, { wallet: 25000, hail });
      const btnOk = hudHail.hail && hudHail.hail.buttons.map(b => b.id).join(",") === "HAIL_TALK,HAIL_THREATEN,HAIL_LEAVE";
      const pass = hud.levelTag.indexOf("MAP // ") === 0 && hud.detection === hud.ships &&
        hud.turn === m.turn && hud.ships > 0 &&
        hail.speaker.toUpperCase().indexOf("SYNDICATE") !== -1 &&
        hail.options.join(",") === "talk,threaten,leave" &&
        hudHail.hail && hudHail.hail.visible === true && btnOk;
      return {
        name: "M3 MAP HUD + HAILING SHELL MODELS (voice placeholder)",
        pass,
        detail: pass
          ? ("tag=" + hud.levelTag + " hail buttons HAIL_TALK/THREATEN/LEAVE")
          : ("tag=" + hud.levelTag + " btnOk=" + btnOk + " opts=" + (hail && hail.options))
      };
    },

    runAll() {
      return [
        this.testMapFuelFormula(),this.testMapUnfuelledMoveRejected(),
        this.testMapFlagshipCrewGate(),this.testMapSlowestShipCapsMove(),
        this.testMapFrozenDuringBattle(),this.testMapSaveRoundTripAndMigration(),
        this.testMapJumpTransit(),this.testMapJumpPointRules(),this.testMapJumpUnfuelled(),
        this.testMapFrameDto(),this.testMapDetectionRadius(),this.testNebulaHidesBattles(),
        this.testMapEncounterOpensOnEntry(),this.testMapJoinNextTurnQ4(),
        this.testMapEncounterNextTurnLaunch(),this.testMapHudAndHailModels()
      ];
    }
  };

  if (testName && typeof suite[testName] === "function") return suite[testName]();
  return suite.runAll();
};
