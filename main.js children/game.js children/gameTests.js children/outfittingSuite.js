"use strict";

// ============================================================
// outfittingSuite.js — job: run the outfitting self-tests through the game-side test bridge.
// Owner: gameTests.js. Holds no state.
// ============================================================
const outfittingSuite = function (bridge, testName) {
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

    // ---- M5(c): per-shot weapon choice + Q8 red numbers ----------------
    // T-M5c-1: a hull mounting two different weapons fires each with its
    // own damage/range (DESIGN 2.1 one attack, Q8 chosen weapon).
    testMultiWeaponFire() {
      this.clearBoard();
      const st = bridge.state;
      st.ap = 4;
      const spec = bridge.shipSpecs["Missile Destroyer"];      // capacity 16
      const a1 = bridge.createUnit("Missile Destroyer", 1, 10, 10, false);
      a1.loadout = ["Light Cannon", "Unguided Torpedo"];       // 1 + 7 = 8 slots
      const t1 = bridge.createUnit("Attack Frigate", 2, 11, 10, false);
      bridge.executeShoot(a1, t1, false, 1, "Light Cannon");
      const lightHp = t1.hp;                                    // 4 - 1
      const chosenA = bridge.chosenWeapon(a1);
      t1.hp = t1.maxHp = 4;
      const a2 = bridge.createUnit("Missile Destroyer", 1, 13, 10, false);
      a2.loadout = ["Light Cannon", "Unguided Torpedo"];
      bridge.executeShoot(a2, t1, false, 1, "Unguided Torpedo");
      const torpHp = t1.hp;                                     // 4 - 7 -> dead
      const chosenB = bridge.chosenWeapon(a2);
      const legal = bridge.loadoutCheck(a1.loadout, spec);
      const pass = legal.ok && lightHp === 3 && torpHp === 0 && chosenA === "Light Cannon" && chosenB === "Unguided Torpedo";
      return {
        name: "M5c-1 TWO WEAPONS, TWO DAMAGE/RANGE PROFILES (chosen per shot)",
        pass: pass,
        detail: "lightHp=" + lightHp + " torpHp=" + torpHp + " chosenA=" + chosenA + " chosenB=" + chosenB + " legal=" + legal.ok
      };
    },

    // T-M5c-2: the red numbers show the CHOSEN weapon's exact pre-commit
    // damage and reach only (Q8) — flipping the pick moves the numbers.
    testRedNumbersChosenWeapon() {
      this.clearBoard();
      const st = bridge.state;
      st.ap = 4;
      st.viewX = 11; st.viewY = 10; st.viewSpan = 10;
      const u = bridge.createUnit("Missile Destroyer", 1, 10, 10, false);
      u.loadout = ["Light Missile Battery", "Unguided Torpedo"];  // dmg 1/rg 8 + dmg 7/rg 1
      const near = bridge.createUnit("Bomber", 2, 11, 10, false);          // d=1
      const far = bridge.createUnit("Attack Frigate", 2, 12, 10, false);   // d=2
      bridge.selectUnit(u);
      bridge.pickWeapon(u, "Unguided Torpedo");
      let ov = bridge.overlayCells();
      const cellAt = (x, y) => (ov.cells || []).find(c => c.gx === x && c.gy === y) || null;
      const nearT = cellAt(11, 10), farT = cellAt(12, 10);
      const torpOk = Boolean(ov.active && nearT && nearT.canShoot && nearT.spottedEnemyDmg === 7 &&
        (!farT || !farT.canShoot));
      bridge.pickWeapon(u, "Light Missile Battery");
      ov = bridge.overlayCells();
      const nearM = cellAt(11, 10), farM = cellAt(12, 10);
      const misOk = Boolean(nearM && nearM.canShoot && nearM.spottedEnemyDmg === 1 &&
        farM && farM.canShoot && farM.spottedEnemyDmg === 1 && farM.firepower === 1);
      return {
        name: "M5c-2 RED NUMBERS = CHOSEN WEAPON ONLY (dmg + radius, Q8)",
        pass: torpOk && misOk,
        detail: "torp(nearDmg=" + (nearT ? nearT.spottedEnemyDmg : null) + " far=" + (farT ? farT.canShoot : null) +
          ") missile(nearDmg=" + (nearM ? nearM.spottedEnemyDmg : null) + " farDmg=" + (farM ? farM.spottedEnemyDmg : null) + ")"
      };
    },

    // T-M5c-3: the shielded-target number stays the chosen weapon's exact
    // pre-commit damage (yellow 1 for non-railgun, full red for railgun).
    testRedNumbersShieldedTarget() {
      this.clearBoard();
      const st = bridge.state;
      st.ap = 4;
      st.viewX = 11; st.viewY = 10; st.viewSpan = 10;
      const u = bridge.createUnit("Missile Destroyer", 1, 10, 10, false);
      u.loadout = ["Light Cannon", "Light Railgun"];              // dmg 1 cannon + dmg 3 railgun
      const e = bridge.createUnit("Attack Frigate", 2, 11, 10, false);
      e.flags.add("+shield");
      bridge.selectUnit(u);
      bridge.pickWeapon(u, "Light Cannon");
      let ov = bridge.overlayCells();
      let c = (ov.cells || []).find(x => x.gx === 11 && x.gy === 10) || null;
      const cannonNum = c ? c.spottedEnemyDmg : null;             // shield strip = 1
      bridge.pickWeapon(u, "Light Railgun");
      ov = bridge.overlayCells();
      c = (ov.cells || []).find(x => x.gx === 11 && x.gy === 10) || null;
      const railNum = c ? c.spottedEnemyDmg : null;               // full 3 through the bubble
      return {
        name: "M5c-3 SHIELDED NUMBERS KEYED ON CHOSEN WEAPON CLASS (1 vs 3)",
        pass: cannonNum === 1 && railNum === 3,
        detail: "cannon=" + cannonNum + " railgun=" + railNum
      };
    },

    // ---- M5(d): station outfitting + legal generation -----------------
    // T-M5d-1: the station outfit flow — unmount to stock, mount from
    // stock within capacity, over-capacity rejected, parts per swap.
    testOutfitStationFlow() {
      bridge.initializeCampaign();
      const st = bridge.state.campaign;
      st.cargo.parts = 10;
      st.cargo.weapons = { "Unguided Torpedo": 1 };
      st.fleet[0] = { hull: "Missile Destroyer", loadout: ["Medium Missile Battery"], hp: 4, maxHp: 4, crew: 15, maxCrew: 15 };
      let c = bridge.outfitShip(0, { remove: "Medium Missile Battery" });
      const unmounted = Boolean(c && c.fleet[0].loadout.length === 0 &&
        c.cargo.weapons["Medium Missile Battery"] === 1 && c.cargo.parts === 9);
      c = bridge.outfitShip(0, { add: "Unguided Torpedo" });
      const mounted = Boolean(c && c.fleet[0].loadout[0] === "Unguided Torpedo" &&
        c.cargo.weapons["Unguided Torpedo"] === 0 && c.cargo.parts === 8);
      c.cargo.weapons["Ultra Railgun"] = 1;
      const before = JSON.stringify({ loadout: c.fleet[0].loadout, parts: c.cargo.parts });
      const rejected = bridge.outfitShip(0, { add: "Ultra Railgun" });
      const after = JSON.stringify({ loadout: rejected.fleet[0].loadout, parts: rejected.cargo.parts });
      const noStock = bridge.outfitShip(0, { add: "Storm Missile Battery" });
      const ok = unmounted && mounted && before === after &&
        noStock.fleet[0].loadout[0] === "Unguided Torpedo" && noStock.cargo.parts === 8;
      return {
        name: "M5d-1 STATION OUTFIT: SWAP/MOUNT WITHIN CAPACITY, PARTS PER SWAP",
        pass: ok,
        detail: "unmounted=" + unmounted + " mounted=" + mounted + " overCapRejected=" + (before === after) +
          " loadout=" + JSON.stringify(rejected.fleet[0].loadout) + " parts=" + rejected.cargo.parts
      };
    },

    // T-M5d-2: the generator NEVER emits an illegal loadout — seeded sweep
    // across levels/seeds; multi-weapon variants do appear and every one
    // passes the capacity verdict.
    testGeneratorLegalLoadoutSweep() {
      let checked = 0, multi = 0, bad = "";
      for (let seed = 1; seed <= 40; seed++){
        const us = bridge.sectorUnits(101, seed);
        for (let i = 0; i < us.length; i++){
          const u = us[i];
          const spec = bridge.shipSpecs[u.type] || {};
          const v = bridge.loadoutCheck(Array.isArray(u.loadout) ? u.loadout : [], spec);
          if (!v.ok) bad += "s" + seed + ":" + u.type + " " + v.reason + "; ";
          if ((u.loadout || []).length > (spec.defaultLoadout || []).length) multi++;
          checked++;
        }
      }
      return {
        name: "M5d-2 GENERATOR SEEDED SWEEP: EVERY LOADOUT LEGAL (40 seeds)",
        pass: bad === "" && checked > 50 && multi > 0,
        detail: "checked=" + checked + " multiWeaponUnits=" + multi + " illegal=[" + bad + "]"
      };
    },

    // T-M5d-3: the outfit rows show ships, mounts and stock with the fit
    // verdicts on the action buttons.
    testOutfitModelRows() {
      const model = bridge.outfitRows({
        fleet: [{ hull: "Fighter", loadout: ["Dual Light Assault Cannon"] }],
        stock: { "Light Cannon": 2 },
        stats: {
          "Light Cannon": { dmg: 1, range: 1, slots: 1 },
          "Dual Light Assault Cannon": { dmg: 2, range: 2, slots: 4 }
        },
        selected: 0,
        usedSlots: [4], capacities: [4], legalMounts: []
      });
      const rows = (model && model.rows) || [];
      const shipRow = rows.find(r => r.id === "outfit-ship:0");
      const mountRow = rows.find(r => r.id === "outfit-slot:0:Dual Light Assault Cannon");
      const stockRow = rows.find(r => r.id === "outfit-stock:Light Cannon");
      const pass = Boolean(shipRow && shipRow.active && shipRow.actionId === "OUTFIT_SELECT:0" &&
        mountRow && mountRow.actionId === "OUTFIT_UNMOUNT:0:Dual Light Assault Cannon" &&
        stockRow && stockRow.actionId === "OUTFIT_MOUNT:0:Light Cannon" &&
        stockRow.actionLabel === "NO FIT" && stockRow.canAct === false);
      return {
        name: "M5d-3 OUTFIT MODEL: SHIP/MOUNT/STOCK ROWS + FIT VERDICTS",
        pass: pass,
        detail: "rows=" + rows.length + " shipActive=" + (shipRow && shipRow.active) + " stockLabel=" + (stockRow && stockRow.actionLabel)
      };
    },

    runAll() {
      return [
        this.testOutfitSlotFormula(),this.testOutfitValidationCapacity(),
        this.testOutfitDefaultsFit(),this.testOutfitReaderParity(),
        this.testOutfitReaderCopies(),this.testBattleUnitLoadoutTruth(),
        this.testWeaponClassShieldBreak(),this.testSaveLoadoutMigration(),
        this.testMultiWeaponFire(),this.testRedNumbersChosenWeapon(),
        this.testRedNumbersShieldedTarget(),this.testOutfitStationFlow(),
        this.testGeneratorLegalLoadoutSweep(),this.testOutfitModelRows()
      ];
    }
  };

  if (testName && typeof suite[testName] === "function") return suite[testName]();
  return suite.runAll();
};
