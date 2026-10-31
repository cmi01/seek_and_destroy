"use strict";

// ============================================================
// gameTests.js — job: run the game-side self-tests through the test bridge.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("tests", function runTest(bridge, testName) {  const suite = {
    // Fresh state from the single template (profile kept), then only the
    // test-specific board: open space, AI has credits, player has none.
    clearBoard() {
      bridge.resetState();
      const st = bridge.state;
      const gridSize = bridge.gridSize;
      st.terrain = Array.from({ length: gridSize }, () => Array(gridSize).fill("EMPTY"));
      st.asteroidSeeds = Array.from({ length: gridSize }, (_, x) => Array.from({ length: gridSize }, (__, y) => ((x * 73 + y * 37) % 100) / 100));
      st.credits = { 1: 0, 2: 200 }; st.income = { 1: 0, 2: 0 };
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

    runAll() {
      const results = [
        this.testKiting(), this.testFlagshipGuard(), this.testFocusFire(), this.testDoctrine(),
        this.testFlagshipShieldAlwaysUp(), this.testRailgunAvoidance(), this.testFleeWhenOutgunned(),
        this.testRecedingHorizon(), this.testBudgetAwarePlanning(),
        this.testZoomAnchor(), this.testZoomClamp()
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
});
