"use strict";

// ============================================================
// gameTests.js — job: run the game-side self-tests through the test bridge.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const runGameTests = function (bridge, testName) {
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

    aiTurnSync(maxBeats) {
      const st = bridge.state;
      const table = bridge.difficultyTable;
      const diff = bridge.difficulty;
      st.activeTeam = 2;
      st.ap = (table[diff] || table.NORMAL).ap;
      st.aiPlan = { reservations: new Map(), currentPlan: null, stepIndex: 0 };
      let n = 0;
      while (st.ap > 0 && n < maxBeats && !st.gameOver) { bridge.aiBeat(); n++; }
      return n;
    },

    // T-1 (E-1): A player ship kites at range+1. The AI must close and damage it.
    testKiting() {
      this.clearBoard();
      const st = bridge.state;
      bridge.createUnit("Attack Destroyer", 2, 16, 16, false);
      const pl = bridge.createUnit("Fighter", 1, 16, 10, false);
      let damaged = false;
      for (let t = 0; t < 3; t++) {
        this.aiTurnSync(8);
        if (pl.hp < pl.maxHp) { damaged = true; break; }
        pl.y = Math.max(0, pl.y - 3);
        pl.flags.delete("-moved"); pl.flags.delete("-attacked");
        st.turnNumber++;
        bridge.aiSyncMemory();
      }
      return { name: "T-1 KITING (E-1)", pass: damaged, detail: "player HP " + pl.hp + "/" + pl.maxHp };
    },

    // T-2 (E-3/E-5): The AI flagship is under threat. It must shield itself.
    testFlagshipGuard() {
      this.clearBoard();
      const flag = bridge.createUnit("Flagship Battlecruiser", 2, 16, 16, false);
      bridge.createUnit("Battleship", 1, 16, 13, false);
      this.aiTurnSync(8);
      const pass = flag.flags.has("+shield");
      return { name: "T-2 FLAGSHIP GUARD (E-3/E-5)", pass: pass, detail: "flagship shielded: " + pass };
    },

    // T-3 (W-11): Two AI ships, one weak player ship. They should focus it down.
    testFocusFire() {
      this.clearBoard();
      bridge.createUnit("Attack Destroyer", 2, 14, 16, false);
      bridge.createUnit("Attack Destroyer", 2, 18, 16, false);
      const pl = bridge.createUnit("Attack Frigate", 1, 16, 16, false);
      this.aiTurnSync(8);
      const pass = pl.hp <= 0;
      return { name: "T-3 FOCUS FIRE (W-11)", pass: pass, detail: "target HP " + pl.hp + "/" + pl.maxHp };
    },

    // T-4 (AC-5): Doctrine is legible — AGGRESSIVE_SWARM should close distance.
    testDoctrine() {
      this.clearBoard();
      const st = bridge.state;
      st.aiDoctrine = "AGGRESSIVE_SWARM";
      bridge.createUnit("Fighter", 2, 16, 20, false);
      const pl = bridge.createUnit("Flagship Battlecruiser", 1, 16, 4, false);
      const before = bridge.dist(st.units[0], pl);
      this.aiTurnSync(8);
      const after = bridge.dist(st.units[0], pl);
      st.aiDoctrine = "DEFENSIVE_HOLD";
      const pass = after < before;
      return { name: "T-4 DOCTRINE LEGIBILITY (AC-5)", pass: pass, detail: "distance " + before.toFixed(1) + " -> " + after.toFixed(1) };
    },

    // T-5: Flagship shields when threatened
    testFlagshipShieldAlwaysUp() {
      this.clearBoard();
      const flag = bridge.createUnit("Flagship Battlecruiser", 2, 16, 16, false);
      flag.flags.delete("+shield");
      bridge.createUnit("Attack Destroyer", 1, 16, 13, false);
      this.aiTurnSync(8);
      const pass = flag.flags.has("+shield");
      return { name: "T-5 FLAGSHIP SHIELD ALWAYS UP", pass: pass, detail: "flagship shielded: " + pass };
    },

    // T-6: Flagship avoids railgun danger zones
    testRailgunAvoidance() {
      this.clearBoard();
      const st = bridge.state;
      const flag = bridge.createUnit("Flagship Battlecruiser", 2, 16, 16, false);
      bridge.createUnit("Railgun Cruiser", 1, 16, 10, false);
      const beforeDist = bridge.dist(flag, st.units[1]);
      this.aiTurnSync(8);
      const afterDist = bridge.dist(flag, st.units[1] || { x: 16, y: 10 });
      const pass = afterDist >= beforeDist;
      return { name: "T-6 RAILGUN AVOIDANCE", pass: pass, detail: "distance " + beforeDist.toFixed(1) + " -> " + afterDist.toFixed(1) };
    },

    // T-7: Flagship flees when outgunned
    testFleeWhenOutgunned() {
      this.clearBoard();
      const flag = bridge.createUnit("Flagship Battlecruiser", 2, 16, 16, false);
      bridge.createUnit("Battleship", 1, 16, 13, false);
      bridge.createUnit("Battleship", 1, 16, 19, false);
      bridge.createUnit("Railgun Cruiser", 1, 13, 16, false);
      this.aiTurnSync(8);
      const moved = flag.x !== 16 || flag.y !== 16;
      return { name: "T-7 FLEE WHEN OUTGUNNED", pass: moved, detail: "flagship moved: " + moved + " to [" + flag.x + "," + flag.y + "]" };
    },

    // T-8: Receding horizon — plans are recalculated each beat
    testRecedingHorizon() {
      this.clearBoard();
      const st = bridge.state;
      bridge.createUnit("Attack Destroyer", 2, 16, 16, false);
      bridge.createUnit("Attack Frigate", 1, 16, 13, false);
      st.activeTeam = 2;
      st.ap = 4;
      st.aiPlan = { reservations: new Map(), currentPlan: null, stepIndex: 0 };
      const apBefore = st.ap;
      bridge.aiBeat();
      const apAfter = st.ap;
      const pass = apAfter === apBefore - 1;
      return { name: "T-8 RECEDING HORIZON (1 AP per beat)", pass: pass, detail: "AP " + apBefore + " -> " + apAfter };
    },

    // T-9: No plan exceeds remaining AP, and composite plans report their true apCost (2 AP).
    testBudgetAwarePlanning() {
      this.clearBoard();
      const st = bridge.state;
      bridge.createUnit("Attack Destroyer", 2, 16, 16, false);
      bridge.createUnit("Probe", 2, 16, 15, false);
      bridge.createUnit("Attack Frigate", 1, 16, 11, false);
      st.activeTeam = 2;
      st.ap = 2;
      st.aiPlan = { reservations: new Map(), currentPlan: null, stepIndex: 0 };
      const plan2 = bridge.aiChooseBestPlan();
      st.ap = 1;
      const plan1 = bridge.aiChooseBestPlan();
      const pass2 = Boolean(plan2 && plan2.apCost === 2 && plan2.steps && plan2.steps.length === 2);
      const pass1 = Boolean(!plan1 || plan1.apCost <= 1);
      const pass = pass2 && pass1;
      return {
        name: "T-9 BUDGET-AWARE PLANNING",
        pass: pass,
        detail: "2-AP plan apCost: " + (plan2 ? plan2.apCost : "none") + ", 1-AP plan apCost: " + (plan1 ? plan1.apCost : "none")
      };
    },

    // T-10 (AC-1): Cursor anchor drift must be ≤ 0.5 cells after a zoom step.
    testZoomAnchor() {
      const DS = 768;
      const viewX = 10, viewY = 10, viewSpan = 16;
      const mousePx = { x: 200, y: 300 };
      const cellPx = DS / viewSpan;
      const anchorGX = viewX + mousePx.x / cellPx;
      const anchorGY = viewY + mousePx.y / cellPx;

      const res = bridge.resolveZoom(viewX, viewY, viewSpan, mousePx, -100, DS);
      const newCellPx = DS / res.viewSpan;
      const newAnchorGX = res.viewX + mousePx.x / newCellPx;
      const newAnchorGY = res.viewY + mousePx.y / newCellPx;

      const pass = Math.abs(newAnchorGX - anchorGX) <= 0.5 &&
                   Math.abs(newAnchorGY - anchorGY) <= 0.5;
      return {
        name: "ZOOM ANCHOR (AC-1)",
        pass,
        detail: `drift (${(newAnchorGX - anchorGX).toFixed(2)}, ${(newAnchorGY - anchorGY).toFixed(2)})`
      };
    },

    // T-11 (AC-2/AC-5): Zoom clamps at ladder limits and board edges.
    testZoomClamp() {
      const DS = 768;
      const r1 = bridge.resolveZoom(0, 0, 5,  { x: 100, y: 100 }, -100, DS);
      const r2 = bridge.resolveZoom(0, 0, 32, { x: 100, y: 100 },  100, DS);
      const r3 = bridge.resolveZoom(0, 0, 16, { x: 0, y: 0 },     -100, DS);

      const pass1 = !r1.changed && r1.viewSpan === 5;
      const pass2 = !r2.changed && r2.viewSpan === 32;
      const pass3 = r3.viewX >= 0 && r3.viewY >= 0 &&
                    r3.viewSpan >= 5 && r3.viewSpan <= 32;

      return {
        name: "ZOOM CLAMP (AC-2/AC-5)",
        pass: pass1 && pass2 && pass3,
        detail: `min:${pass1} max:${pass2} edge:${pass3}`
      };
    },

    // M1 (roadmap AC-1): every hull row satisfies the DESIGN §3.1 invariants —
    // crew = ⌈cost ÷ 100⌉, flagship = 2.5× base with scan 8, Dreadnought =
    // 2× Battleship — and every default loadout fits its hull's slot capacity,
    // with weapon slot sizes = round(dmg × range), ×1.5 railguns.
    testCampaignRosterConformance() {
      const specs = bridge.shipSpecs;
      const weapons = bridge.weapons;
      const bad = [];
      const fail = (why) => bad.push(why);

      const hulls = Object.keys(specs);
      if (hulls.length !== 22) fail("hull count " + hulls.length + " != 22");
      const weaponNames = Object.keys(weapons);
      if (weaponNames.length !== 15) fail("weapon count " + weaponNames.length + " != 15");

      // Slot-size formula per DESIGN §3.2.
      weaponNames.forEach(w => {
        const wp = weapons[w];
        const expect = Math.round(wp.dmg * wp.range * (wp.class === "railgun" ? 1.5 : 1));
        if (wp.slots !== expect) fail(w + " slots " + wp.slots + " != " + expect);
      });

      hulls.forEach(name => {
        const s = specs[name];
        if (s.crew !== Math.ceil(s.cost / 100)) fail(name + " crew " + s.crew + " != ⌈" + s.cost + "/100⌉");
        // Default loadout fits capacity, and capacity equals its slot total (§3.3).
        const slotTotal = s.defaultLoadout.reduce((n, w) => n + (weapons[w] ? weapons[w].slots : 0), 0);
        if (slotTotal !== s.capacity) fail(name + " capacity " + s.capacity + " != loadout slots " + slotTotal);
        // Unarmed hulls have 0 slots; armed hulls' battle firepower/range match the weapon.
        if (s.defaultLoadout.length === 0) {
          if (s.capacity !== 0 || s.firepower !== 0) fail(name + " unarmed hull must have 0 slots/firepower");
        } else {
          const w = weapons[s.defaultLoadout[0]];
          if (!w) fail(name + " default weapon unknown");
          else if (w.dmg !== s.firepower || w.range !== s.range) fail(name + " fp/range != weapon dmg/range");
        }
        // Flagship invariants: 2.5× base cost, scan 8.
        if (s.flags.includes("!flagship")) {
          const baseName = name.startsWith("Flagship ") ? name.slice("Flagship ".length) : name.replace(/ Flagship$/, "");
          const base = specs[baseName];
          if (!base) fail(name + " has no base hull " + baseName);
          else {
            if (s.cost !== base.cost * 2.5) fail(name + " cost " + s.cost + " != 2.5×" + base.cost);
            if (s.scan !== 8) fail(name + " scan " + s.scan + " != 8");
          }
        }
      });

      // Dreadnought = 2× Battleship; flagship price default Q7 (8,750).
      if (specs["Dreadnought"].cost !== specs["Battleship"].cost * 2) fail("Dreadnought != 2× Battleship");
      if (specs["Flagship Battlecruiser"].cost !== 8750) fail("Flagship Battlecruiser cost != 8750");

      return {
        name: "CAMPAIGN ROSTER CONFORMANCE (M1)",
        pass: bad.length === 0,
        detail: bad.length ? bad.slice(0, 4).join("; ") : "22 hulls / 15 weapons conform to DESIGN §3"
      };
    },

    // M1 (roadmap AC-2): save → restore deep-equals (JSON) a campaign state
    // containing fleet, wallet, cargo, reputation and clock.
    testCampaignStateRoundTrip() {
      bridge.initializeCampaign();
      const before = bridge.campaign;
      const ok = Boolean(before && Array.isArray(before.fleet) && before.fleet.length === 5 &&
        before.wallet === 25000 && before.cargo && before.reputation && before.clock);
      if (!ok) return { name: "CAMPAIGN STATE ROUND-TRIP (M1)", pass: false, detail: "campaign state missing or wrong shape" };

      const snapshot = JSON.stringify(before);
      const save = bridge.saveState();
      const savedJson = JSON.stringify(save.state.campaign);

      bridge.resetState();                       // campaign section cleared (profile kept)
      if (bridge.campaign !== null) return { name: "CAMPAIGN STATE ROUND-TRIP (M1)", pass: false, detail: "reset did not clear campaign section" };

      const loadOk = bridge.loadState(save);
      const restoredJson = loadOk ? JSON.stringify(bridge.campaign) : "null";
      const pass = loadOk && savedJson === snapshot && restoredJson === snapshot;

      return {
        name: "CAMPAIGN STATE ROUND-TRIP (M1)",
        pass,
        detail: pass ? "save → restore JSON-identical (fleet/wallet/cargo/reputation/clock)" : "mismatch: " + (savedJson === snapshot ? "restore" : "save")
      };
    },

    // M1 §7: a v99-shaped save (V58-1.0, pre-×100 credits/income, no campaign
    // key) restores onto the M1 schema with money scaled ×100 and a campaign
    // section. Reloading that migrated save must not scale a second time.
    testCampaignV99SaveMigration() {
      const fixture = {
        schema: "seek-and-destroy.beginning-game-state",
        version: "V58-1.0",
        state: {
          theme: "default",
          levelId: 101,
          turnNumber: 3,
          activeTeam: 1,
          ap: 4,
          credits: { 1: 35, 2: 12 },
          income: { 1: 5, 2: 1 },
          gameOver: false,
          viewX: 4,
          viewY: 6,
          viewSpan: 16
        }
      };
      const bad = [];
      const fail = (why) => bad.push(why);
      if (!bridge.loadState(fixture)) fail("v99 fixture rejected");
      const st = bridge.state;
      if (!st.credits || st.credits[1] !== 3500 || st.credits[2] !== 1200) fail("credits not scaled ×100");
      if (!st.income || st.income[1] !== 500 || st.income[2] !== 100) fail("income not scaled ×100");
      if (st.turnNumber !== 3 || st.levelId !== 101 || st.viewSpan !== 16) fail("non-money fields were scaled");
      const section = st.campaign;
      const sectionOk = section && Array.isArray(section.fleet) && typeof section.wallet === "number" &&
        section.cargo && section.reputation && section.clock && section.map;
      if (!sectionOk) fail("migrated save has no campaign section");
      if (Object.prototype.hasOwnProperty.call(fixture.state, "campaign")) fail("fixture must omit campaign");

      const migrated = bridge.saveState();
      if (!migrated || migrated.version === "V58-1.0") fail("migrated save still on pre-M1 version");
      const scaled = st.credits[1];
      if (!bridge.loadState(migrated)) fail("migrated save rejected");
      if (bridge.state.credits[1] !== scaled) fail("migrated save scaled twice");

      return {
        name: "CAMPAIGN V99 SAVE MIGRATION (M1)",
        pass: bad.length === 0,
        detail: bad.length ? bad.slice(0, 4).join("; ") : "v99 credits/income ×100, campaign section present, no double-scale"
      };
    },

    // M2 AC: summon costs exactly 1 AP and 0 credits (DESIGN §2.8).
    testSummonCostsOneAp() {
      this.clearBoard();
      const st = bridge.state;
      st.ap = 4;
      st.credits = { 1: 9999, 2: 0 };
      st.activeTeam = 1;
      const flag = bridge.createUnit("Flagship Battlecruiser", 1, 16, 16, false);
      st.battleReserve = [{ hull: "Fighter", loadout: [], hp: 2, maxHp: 2, crew: 1 }];
      const ok = bridge.executeWarpIn(flag, "Fighter", false, 1, {});
      const spawned = st.units.find(u => u.type === "Fighter");
      const pass = Boolean(ok) && st.ap === 3 && st.credits[1] === 9999 && spawned && spawned.kind === "mirage";
      return {
        name: "M2 SUMMON 1 AP 0 CREDITS",
        pass: pass,
        detail: pass ? "AP 4→3, credits unchanged, mirage on board" : ("ok="+ok+" ap="+st.ap+" credits="+st.credits[1]+" kind="+(spawned && spawned.kind))
      };
    },

    // M2 AC: any hit destroys a mirage.
    testMirageAnyHitDestroys() {
      this.clearBoard();
      const st = bridge.state;
      st.ap = 4;
      st.activeTeam = 1;
      const shooter = bridge.createUnit("Fighter", 1, 16, 16, false);
      const mirage = bridge.createUnit("Probe", 2, 16, 17, false);
      mirage.kind = "mirage";
      bridge.executeShoot(shooter, mirage, false, 1);
      const alive = st.units.some(u => u.id === mirage.id && u.hp > 0);
      const pass = !alive;
      return { name: "M2 MIRAGE ANY HIT DESTROYS", pass: pass, detail: pass ? "mirage removed after one hit" : "mirage still alive hp=" + mirage.hp };
    },

    // M2 AC: ram against a mirage destroys both ships.
    testMirageRamDestroysBoth() {
      this.clearBoard();
      const st = bridge.state;
      st.ap = 4;
      st.activeTeam = 1;
      const rammer = bridge.createUnit("Fighter", 1, 16, 16, false);
      const mirage = bridge.createUnit("Probe", 2, 16, 17, false);
      mirage.kind = "mirage";
      const rammerId = rammer.id, mirageId = mirage.id;
      bridge.executeMove(rammer, { x: 16, y: 17 }, false, 1);
      const rammerAlive = st.units.some(u => u.id === rammerId && u.hp > 0);
      const mirageAlive = st.units.some(u => u.id === mirageId && u.hp > 0);
      const pass = !rammerAlive && !mirageAlive;
      return { name: "M2 MIRAGE RAM DESTROYS BOTH", pass: pass, detail: pass ? "both hulls destroyed" : "rammerAlive="+rammerAlive+" mirageAlive="+mirageAlive };
    },

    // M2 AC: losing the flagship yields campaign-over endgame status.
    testFlagshipLostCampaignOver() {
      this.clearBoard();
      const enemy = bridge.createUnit("Flagship Battlecruiser", 2, 16, 16, false);
      const status = bridge.checkEndgameStatus(bridge.state.units);
      const pass = status.over === true && status.reason === "flagship-lost" && status.t1Defeated === true;
      return { name: "M2 FLAGSHIP-LOST CAMPAIGN OVER", pass: pass, detail: pass ? "over/flagship-lost" : JSON.stringify(status) + " enemy=" + enemy.type };
    },

    // M2 AC: seeded carry-over — payout formula, crew transfer, captured hull retained.
    testBattleCarryOver() {
      bridge.initializeCampaign();
      const section = bridge.campaign;
      const specs = bridge.shipSpecs;
      const setup = bridge.openBattle(section, {
        seed: 7,
        capacity: 2,
        opponent: [{ hull: "Attack Destroyer", loadout: ["Dual Light Cannons"], hp: 5, maxHp: 5, crew: 8 }]
      });
      const overflowOk = setup.overflow.length === 3 && setup.deployments[0].units.length === 2;
      const flag = { hull: "Flagship Battlecruiser", loadout: specs["Flagship Battlecruiser"].defaultLoadout.slice(), hp: 6, maxHp: 12, crew: 88 };
      const fighter = { hull: "Fighter", loadout: specs["Fighter"].defaultLoadout.slice(), hp: 2, maxHp: 2, crew: 5 };
      const captured = { hull: "Probe", loadout: [], hp: 1, maxHp: 1, crew: 1 };
      const folded = bridge.foldBattle(section, {
        winner: "player",
        survivors: [flag, fighter],
        captured: [captured],
        scrapped: [{ hull: "Attack Destroyer" }]
      });
      const next = folded.state;
      const flagNext = next.fleet.find(e => e.hull === "Flagship Battlecruiser");
      const hasProbe = next.fleet.some(e => e.hull === "Probe");
      const expectParts = Math.floor(specs["Attack Destroyer"].capacity * 0.5);
      const lost = bridge.crewKilled(6, 12, 88);
      const expectFlagCrew = Math.min(specs["Flagship Battlecruiser"].crew, (88 - lost) + 5 + 1);
      const partsOk = next.cargo.parts === (section.cargo.parts + expectParts);
      const crewOk = flagNext && flagNext.crew === expectFlagCrew;
      const pass = overflowOk && partsOk && crewOk && hasProbe;
      return {
        name: "M2 BATTLE CARRY-OVER",
        pass: pass,
        detail: pass ? ("parts +"+expectParts+", flagship crew "+expectFlagCrew+", Probe retained") : ("overflow="+setup.overflow.length+" parts="+next.cargo.parts+" crew="+(flagNext && flagNext.crew)+" probe="+hasProbe)
      };
    },

    // F1: every initialState key belongs to exactly one lifetime; battleReserve
    // is a match key and round-trips through save/restore.
    testLifetimeMapCoversInitialState() {
      const st = bridge.state;
      const lives = bridge.getLifetimes();
      const seen = {};
      Object.keys(lives).forEach(lt => (lives[lt] || []).forEach(k => { seen[k] = (seen[k] || 0) + 1; }));
      const problems = [];
      Object.keys(st).forEach(k => { if (seen[k] !== 1) problems.push(k); });
      Object.keys(seen).forEach(k => { if (!Object.prototype.hasOwnProperty.call(st, k)) problems.push(k); });
      const inMatch = (lives.match || []).indexOf("battleReserve") !== -1;
      st.battleReserve = [{ hull: "Probe", loadout: [], hp: 1, maxHp: 1, crew: 1 }];
      const save = bridge.saveState();
      const saved = save && save.state && Array.isArray(save.state.battleReserve) && save.state.battleReserve.length === 1;
      bridge.resetState();
      const loaded = bridge.loadState(save);
      const restored = loaded && Array.isArray(bridge.state.battleReserve) && bridge.state.battleReserve[0] && bridge.state.battleReserve[0].hull === "Probe";
      const pass = problems.length === 0 && inMatch && saved && restored;
      return {
        name: "LIFETIME MAP COVERS INITIAL STATE",
        pass: pass,
        detail: pass ? "every key has one lifetime; battleReserve in match and persisted" : ("keys=" + problems.join(",") + " match=" + inMatch + " saved=" + saved + " restored=" + restored)
      };
    },


    testLivePathCarryOver() {
      bridge.initializeCampaign();
      const before = JSON.parse(JSON.stringify(bridge.campaign));
      bridge.startCampaignBattle({ levelId: 101 });
      const st = bridge.state;
      const t1 = st.units.filter(u => u.hp > 0 && u.team === 1);
      const reserve = Array.isArray(st.battleReserve) ? st.battleReserve : [];
      const overflowOk = reserve.length >= 1 && (t1.length + reserve.length) === before.fleet.length;
      const wallet0 = before.wallet;
      const parts0 = before.cargo.parts;
      const livingReserve = reserve.slice();
      st.units.forEach(u => { if (u.team === 2 && u.flags.has("!flagship")) u.hp = 0; });
      st.units = st.units.filter(u => u.hp > 0);
      const living1 = st.units.filter(u => u.team === 1);
      bridge.checkEndgame();
      const after = bridge.campaign;
      const expectFleet = living1.length + livingReserve.length;
      const partsGrew = after && after.cargo && after.cargo.parts >= parts0;
      const walletSame = after && after.wallet === wallet0;
      const fleetOk = after && Array.isArray(after.fleet) && after.fleet.length === expectFleet;
      const flagOk = after && after.fleet.some(e => String(e.hull).indexOf("Flagship") !== -1);
      const loadOk = after && after.fleet.every(e => before.fleet.some(b => b.hull === e.hull && JSON.stringify(b.loadout || []) === JSON.stringify(e.loadout || [])));
      const pass = overflowOk && walletSame && partsGrew && fleetOk && flagOk && loadOk;
      return {
        name: "M2 LIVE PATH CARRY-OVER",
        pass: pass,
        detail: pass ? ("reserve "+reserve.length+", fleet "+after.fleet.length+", parts "+parts0+"->"+after.cargo.parts) : JSON.stringify({ overflowOk, walletSame, partsGrew, fleetOk, flagOk, loadOk, t1: t1.length, reserve: reserve.length, afterFleet: after && after.fleet && after.fleet.length, parts: after && after.cargo && after.cargo.parts })
      };
    },

    testBattleCreditsFrozen() {
      bridge.initializeCampaign();
      bridge.startCampaignBattle({ levelId: 101 });
      const st = bridge.state;
      const c0 = st.credits[1];
      const i0 = st.income[1];
      const w0 = bridge.campaign.wallet;
      bridge.transitionToAITurn();
      const afterAI = st.credits[1] === c0 && st.income[1] === i0;
      st.activeTeam = 2;
      st.gameOver = false;
      bridge.transitionToPlayerTurn();
      const afterP = st.credits[1] === c0 && st.income[1] === i0 && bridge.campaign.wallet === w0;
      const pass = afterAI && afterP;
      return {
        name: "M2 BATTLE CREDITS FROZEN",
        pass: pass,
        detail: pass ? ("credits "+c0+" wallet "+w0+" across turns") : ("c="+st.credits[1]+" i="+st.income[1]+" w="+bridge.campaign.wallet+" afterAI="+afterAI+" afterP="+afterP)
      };
    },

    testDeploymentChoiceForcesFlagship() {
      bridge.initializeCampaign();
      const fleet = bridge.campaign.fleet;
      const probeIdx = fleet.findIndex(e => e.hull === "Probe");
      const setup = bridge.openBattle(bridge.campaign, { capacity: 2, choice: [probeIdx], opponent: [] });
      const deployed = setup.deployments[0].units.map(e => e.hull);
      const hasFlag = deployed.some(h => String(h).indexOf("Flagship") !== -1);
      const hasProbe = deployed.indexOf("Probe") !== -1;
      const sizeOk = deployed.length === 2;
      bridge.startCampaignBattle({ levelId: 101, capacity: 2, choice: [probeIdx] });
      const live = bridge.state.units.filter(u => u.hp > 0 && u.team === 1).map(u => u.type);
      const liveFlag = live.some(h => String(h).indexOf("Flagship") !== -1);
      const liveProbe = live.indexOf("Probe") !== -1;
      const liveSize = live.length === 2;
      const pass = hasFlag && hasProbe && sizeOk && liveFlag && liveProbe && liveSize;
      return {
        name: "M2 DEPLOYMENT FLAGSHIP FORCED",
        pass: pass,
        detail: pass ? "flagship+Probe at cap 2 (seam+live)" : JSON.stringify({ deployed, live, hasFlag, hasProbe, sizeOk, liveFlag, liveProbe, liveSize })
      };
    },

    // Rule test (DESIGN 2.5, no cooldown): a ship may raise its shield again
    // later in the same turn after its bubble was stripped (1 AP each raise).
    // A raise is blocked only by an already raised bubble, no shield generator,
    // or no AP.
    testShieldReraiseRule() {
      this.clearBoard();
      const st = bridge.state;
      st.activeTeam = 1;
      const u = bridge.createUnit("Light Cruiser", 1, 16, 16, false);
      u.flags.delete("+shield");
      st.ap = 4;
      const me = { x: u.x, y: u.y };
      const first = bridge.canShield(u, me);
      bridge.executeShield(u, false, 1);
      const raised = u.flags.has("+shield");
      const tgt = bridge.createUnit("Shuttle", 2, 16, 14, false);
      tgt.hp = 10;
      bridge.executeShoot(u, tgt, false, 1);
      const dropped = !u.flags.has("+shield");
      const second = bridge.canShield(u, me);
      bridge.executeShield(u, false, 1);
      const reRaised = u.flags.has("+shield");
      const blockedWhileRaised = !bridge.canShield(u, me);
      const noGen = bridge.createUnit("Railgun Destroyer", 1, 10, 10, false);
      const blockedNoGenerator = !bridge.canShield(noGen, { x: noGen.x, y: noGen.y });
      u.flags.delete("+shield");
      st.ap = 0;
      const blockedNoAp = !bridge.canShield(u, me);
      const pass = first && raised && dropped && second && reRaised && blockedWhileRaised && blockedNoGenerator && blockedNoAp;
      return {
        name: "T-12 SHIELD RE-RAISE (DESIGN 2.5)",
        pass: pass,
        detail: pass ? "re-raise after strip OK; blocks: raised / no-generator / no-AP" : JSON.stringify({ first, raised, dropped, second, reRaised, blockedWhileRaised, blockedNoGenerator, blockedNoAp })
      };
    },


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

    // ---- M5(a): the loadout seam (slot math, validation, readers) -----
    // T-M5a-1: every frozen weapon row's slot field equals the formula
    // (damage x range, x1.5 railguns, rounded) and known values pin it.
    testOutfitSlotFormula() {
      const ws = bridge.weapons;
      const names = Object.keys(ws);
      let bad = "";
      for (const name of names) {
        const got = bridge.loadoutSlots(ws[name]);
        if (got !== ws[name].slots) bad += name + " " + got + "!=" + ws[name].slots + "; ";
      }
      const lightRail = bridge.loadoutSlots(ws["Light Railgun"]);
      const heavyRail = bridge.loadoutSlots(ws["Heavy Railgun"]);
      return {
        name: "M5a-1 SLOT FORMULA PINS THE TABLE (15 rows)",
        pass: bad === "" && lightRail === 14 && heavyRail === 23,
        detail: "rows=" + names.length + " mismatches=[" + bad + "] lightRail=" + lightRail + " heavyRail=" + heavyRail
      };
    },

    // T-M5a-2: validation accepts within capacity, rejects over capacity
    // and unknown mounts.
    testOutfitValidationCapacity() {
      const specs = bridge.shipSpecs;
      const fighter = specs["Fighter"];        // capacity 4
      const probe = specs["Probe"];            // capacity 0, unarmed
      const within = bridge.loadoutCheck(["Light Cannon", "Light Cannon"], fighter);   // 2 <= 4
      const exact = bridge.loadoutCheck(["Dual Light Assault Cannon"], fighter);       // 4 <= 4
      const over = bridge.loadoutCheck(["Dual Light Cannons"], fighter);               // 6 > 4
      const unknown = bridge.loadoutCheck(["Nonexistent Blaster"], fighter);
      const unarmedEmpty = bridge.loadoutCheck([], probe);
      const unarmedOver = bridge.loadoutCheck(["Light Cannon"], probe);                // 1 > 0
      const pass = Boolean(within.ok && exact.ok && !over.ok && over.reason &&
        !unknown.ok && unknown.reason && unarmedEmpty.ok && !unarmedOver.ok &&
        within.usedSlots === 2 && exact.usedSlots === 4 && over.usedSlots === 6 && over.capacity === 4);
      return {
        name: "M5a-2 LOADOUT VALIDATION: CAPACITY BOUNDARY (<= ok, > reject)",
        pass: pass,
        detail: "within=" + within.ok + " exact=" + exact.ok + " over=" + over.ok + "(" + over.reason + ")" +
          " unknown=" + unknown.ok + " empty=" + unarmedEmpty.ok + " unarmedOver=" + unarmedOver.ok
      };
    },

    // T-M5a-3: every hull's default loadout fills its capacity EXACTLY
    // (DESIGN 3.3: capacity equals the slot total of the default loadout).
    testOutfitDefaultsFit() {
      const specs = bridge.shipSpecs;
      const names = Object.keys(specs);
      let bad = "";
      for (const name of names) {
        const spec = specs[name];
        const load = bridge.loadoutDefault(spec);
        const v = bridge.loadoutCheck(load, spec);
        if (!v.ok || v.usedSlots !== spec.capacity) {
          bad += name + " " + v.usedSlots + "/" + spec.capacity + "; ";
        }
      }
      return {
        name: "M5a-3 DEFAULT LOADOUTS FILL CAPACITY EXACTLY (22 hulls)",
        pass: bad === "",
        detail: "hulls=" + names.length + " mismatches=[" + bad + "]"
      };
    },

    // T-M5a-4: the readers agree with the legacy single-weapon values and
    // sum multi-weapon loadouts per weapon.
    testOutfitReaderParity() {
      const specs = bridge.shipSpecs;
      let bad = "";
      for (const name of Object.keys(specs)) {
        const spec = specs[name];
        const u = { loadout: bridge.loadoutDefault(spec) };
        if (bridge.unitFp(u) !== spec.firepower) bad += name + " fp " + bridge.unitFp(u) + "!=" + spec.firepower + "; ";
        if (bridge.unitRng(u) !== spec.range) bad += name + " rng " + bridge.unitRng(u) + "!=" + spec.range + "; ";
      }
      // Two different weapons on one hull: each keeps its own stats.
      const mixed = { loadout: ["Light Missile Battery", "Unguided Torpedo"] };   // 8 + 7 = 15 slots
      const v = bridge.loadoutCheck(mixed.loadout, specs["Missile Destroyer"]);   // capacity 16
      const fp = bridge.unitFp(mixed);        // 1 + 7
      const rng = bridge.unitRng(mixed);      // max(8, 1)
      const arms = bridge.unitArsenal(mixed);
      const mixedOk = Boolean(v.ok && fp === 8 && rng === 8 && arms.length === 2 &&
        arms[0].name === "Light Missile Battery" && arms[0].class === "missile" && arms[0].dmg === 1 && arms[0].range === 8 &&
        arms[1].name === "Unguided Torpedo" && arms[1].class === "missile" && arms[1].dmg === 7 && arms[1].range === 1);
      return {
        name: "M5a-4 READER PARITY + MULTI-WEAPON SUMS",
        pass: bad === "" && mixedOk,
        detail: "legacyParity=[" + bad + "] mixedFp=" + fp + " mixedRng=" + rng + " mixedOk=" + mixedOk
      };
    },

    // T-M5a-5: readers hand out copies (no aliasing into the unit) and an
    // unmigrated record reads as unarmed.
    testOutfitReaderCopies() {
      const u = { loadout: ["Light Cannon"] };
      const a = bridge.unitLoadout(u);
      a.push("Ultra Railgun");
      const untouched = u.loadout.length === 1 && bridge.unitLoadout(u)[0] === "Light Cannon";
      const bare = {};
      const emptyOk = bridge.unitLoadout(bare).length === 0 && bridge.unitFp(bare) === 0 &&
        bridge.unitRng(bare) === 0 && bridge.unitArsenal(bare).length === 0;
      return {
        name: "M5a-5 READERS COPY; UNMIGRATED RECORD READS UNARMED",
        pass: untouched && emptyOk,
        detail: "untouched=" + untouched + " emptyOk=" + emptyOk
      };
    },

    // ---- M5(b): battle adopts the loadout as weapon truth -------------
    // T-M5b-1: battle unit records carry their mount list and NO raw
    // weapon fields; the seam reads match the legacy spec mirrors.
    testBattleUnitLoadoutTruth() {
      this.clearBoard();
      const u = bridge.createUnit("Missile Destroyer", 1, 10, 10, false);
      const spec = bridge.shipSpecs["Missile Destroyer"];
      const truth = Array.isArray(u.loadout) && u.loadout.length === 1 && u.loadout[0] === "Medium Missile Battery";
      const noRaw = u.firepower === undefined && u.range === undefined && u.wType === undefined;
      const seam = bridge.unitFp(u) === spec.firepower && bridge.unitRng(u) === spec.range;
      return {
        name: "M5b-1 BATTLE UNIT TRUTH = LOADOUT (no raw weapon fields)",
        pass: truth && noRaw && seam,
        detail: "truth=" + truth + " noRaw=" + noRaw + " seam=" + seam
      };
    },

    // T-M5b-2: the shield-break rule keys on the FIRING WEAPON's class,
    // not a hull flag: railgun-class fire keeps full damage through the
    // bubble, cannon-class fire is cut to the 1-damage strip.
    testWeaponClassShieldBreak() {
      this.clearBoard();
      const st = bridge.state;
      st.ap = 4;
      const att = bridge.createUnit("Missile Destroyer", 1, 10, 10, false);
      const t1 = bridge.createUnit("Attack Frigate", 2, 11, 10, false);
      t1.flags.add("+shield");
      att.loadout = ["Light Railgun"];       // railgun class, dmg 3
      bridge.executeShoot(att, t1, false, 1);
      const railHp = t1.hp, railStrip = !t1.flags.has("+shield");   // 4 - 3 = 1
      const att2 = bridge.createUnit("Missile Destroyer", 1, 13, 10, false);
      const t2 = bridge.createUnit("Attack Frigate", 2, 14, 10, false);
      t2.flags.add("+shield");
      att2.loadout = ["Light Cannon"];       // cannon class, dmg 1 -> strip only
      bridge.executeShoot(att2, t2, false, 1);
      const canHp = t2.hp, canStrip = !t2.flags.has("+shield");     // 4 - 1 = 3
      const pass = railHp === 1 && railStrip && canHp === 3 && canStrip;
      return {
        name: "M5b-2 SHIELD BREAK KEYED ON WEAPON CLASS (railgun 3 through / cannon 1 strip)",
        pass: pass,
        detail: "railHp=" + railHp + " railStrip=" + railStrip + " cannonHp=" + canHp + " cannonStrip=" + canStrip
      };
    },

    // T-M5b-3: saves carry loadouts; a pre-M5 save (units with legacy
    // weapon fields, no mounts) migrates to the hull defaults.
    testSaveLoadoutMigration() {
      this.clearBoard();
      const u = bridge.createUnit("Fighter", 1, 10, 10, false);
      u.loadout = ["Light Cannon", "Light Cannon"];
      const saved = JSON.parse(JSON.stringify(bridge.saveState()));
      u.loadout = ["Ultra Railgun"];
      bridge.loadState(saved);
      const restored = bridge.state.units.find(x => x.type === "Fighter");
      const kept = Boolean(restored && Array.isArray(restored.loadout) && restored.loadout.length === 2 && restored.loadout[0] === "Light Cannon");
      // Pre-M5 payload: legacy fields, no mounts -> default mounts backfilled.
      const legacy = JSON.parse(JSON.stringify(bridge.saveState()));
      legacy.version = "M3-1.0";
      for (const un of legacy.state.units) {
        delete un.loadout;
        const spec = bridge.shipSpecs[un.type];
        un.firepower = spec.firepower;
        un.range = spec.range;
      }
      bridge.loadState(legacy);
      const mig = bridge.state.units.find(x => x.type === "Fighter");
      const specF = bridge.shipSpecs["Fighter"];
      const migrated = Boolean(mig && Array.isArray(mig.loadout) &&
        mig.loadout.length === specF.defaultLoadout.length && mig.loadout[0] === specF.defaultLoadout[0]);
      return {
        name: "M5b-3 SAVE KEEPS LOADOUTS; PRE-M5 SAVE MIGRATES TO DEFAULTS",
        pass: kept && migrated,
        detail: "kept=" + kept + " migrated=" + migrated
      };
    },

    runAll() {
      const results = [
        this.testCampaignRosterConformance(), this.testCampaignStateRoundTrip(),
        this.testCampaignV99SaveMigration(),
        this.testSummonCostsOneAp(), this.testMirageAnyHitDestroys(), this.testMirageRamDestroysBoth(),
        this.testFlagshipLostCampaignOver(), this.testBattleCarryOver(),
        this.testLifetimeMapCoversInitialState(),
        this.testLivePathCarryOver(), this.testBattleCreditsFrozen(), this.testDeploymentChoiceForcesFlagship(),
        this.testKiting(), this.testFlagshipGuard(), this.testFocusFire(), this.testDoctrine(),
        this.testFlagshipShieldAlwaysUp(), this.testRailgunAvoidance(), this.testFleeWhenOutgunned(),
        this.testRecedingHorizon(), this.testBudgetAwarePlanning(),
        this.testZoomAnchor(), this.testZoomClamp(),
        this.testShieldReraiseRule(),
        this.testMapFuelFormula(), this.testMapUnfuelledMoveRejected(),
        this.testMapFlagshipCrewGate(), this.testMapSlowestShipCapsMove(),
        this.testMapFrozenDuringBattle(), this.testMapSaveRoundTripAndMigration(),
        this.testMapJumpTransit(), this.testMapJumpPointRules(),
        this.testMapJumpUnfuelled(), this.testMapFrameDto(),
        this.testMapDetectionRadius(), this.testNebulaHidesBattles(),
        this.testMapEncounterOpensOnEntry(), this.testMapJoinNextTurnQ4(),
        this.testMapEncounterNextTurnLaunch(), this.testMapHudAndHailModels(),
        this.testMarketPriceDeterminism(), this.testSpreadRoundTrip(),
        this.testTradeHullConsistency(), this.testTradeRejections(),
        this.testStationModel(), this.testRepairRefitParts(),
        this.testStationHullBuySaveRoundTrip(),
        this.testCrewCasualtyFormula(), this.testCrewStatusGate(),
        this.testWagesMonthTick(),
        this.testMerchantFlowRescue(), this.testMerchantSaleDiscount(),
        this.testOutfitSlotFormula(), this.testOutfitValidationCapacity(),
        this.testOutfitDefaultsFit(), this.testOutfitReaderParity(), this.testOutfitReaderCopies(),
        this.testBattleUnitLoadoutTruth(), this.testWeaponClassShieldBreak(), this.testSaveLoadoutMigration()
      ];
      console.log("%cSEEK & DESTROY â€” AI + ZOOM SELF-TEST RESULTS", "color:#facc15;font-size:14px;");
      let allPass = true;
      results.forEach(r => {
        const colour = r.pass ? "#34d399" : "#f43f5e";
        console.log("%c" + (r.pass ? "PASS" : "FAIL") + "  " + r.name + "  â€”  " + r.detail, "color:" + colour + ";");
        if (!r.pass) allPass = false;
      });
      console.log(allPass ? "%cALL GAME TESTS PASSED (" + results.length + "/" + results.length + ")" : "%cSOME GAME TESTS FAILED", "color:" + (allPass ? "#34d399" : "#f43f5e") + ";font-weight:bold;");
      return results;
    }
  };

  // The pin must not leak out of the suite: restore the caller's RNG stream
  // (exact function, not a re-seed) after the run.
  const callerRng = bridge.state.rng;
  const callerRngSeed = bridge.state.rngSeed;
  const restoreRng = function () {
    bridge.state.rng = callerRng;
    bridge.state.rngSeed = callerRngSeed;
  };

  if (testName && typeof suite[testName] === "function") {
    try { return suite[testName](); } finally { restoreRng(); }
  }
  try { return suite.runAll(); } finally { restoreRng(); }
};
// Loading convention: this file defines runGameTests at top level; the owner
// captures it after the boot list resolves.
