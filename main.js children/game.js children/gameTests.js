"use strict";

// ============================================================
// gameTests.js — job: run the game-side self-tests through the test bridge.
// Owner: game.js. Holds no state unless it is a core.
// ============================================================
const runGameTests = function (bridge, testName) {  const suite = {
    // Fresh state from the single template (profile kept), then only the
    // test-specific board: open space, AI has credits, player has none.
    clearBoard() {
      bridge.resetState();
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
        this.testMapEncounterNextTurnLaunch(), this.testMapHudAndHailModels()
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

  if (testName && typeof suite[testName] === "function") {
    return suite[testName]();
  }
  return suite.runAll();
};
// Loading convention: this file defines runGameTests at top level; the owner
// captures it after the boot list resolves.
