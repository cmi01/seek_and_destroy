"use strict";

// ============================================================
// factionSuite.js — job: run the faction-reputation self-tests through the game-side test bridge.
// Owner: gameTests.js. Holds no state.
// ============================================================
const factionSuite = function (bridge, testName) {
  const suite = {
    // T-M6a-1 (M6): doctrine-weighted composition is seeded and legal —
    // the same seed reproduces the same fleet, every fleet fields exactly
    // one flagship first in the list, every hull is on the roster and the
    // fleet's total cost stays within budget.
    testFactionFleetRolls() {
      const specs = bridge.shipSpecs;
      const ids = bridge.factionIds();
      const bad = [];
      if (ids.length !== 5) bad.push("factions=" + ids.length);
      for (const id of ids) {
        const a = bridge.rollFleet(id, 60000, 1234);
        const b = bridge.rollFleet(id, 60000, 1234);
        if (a.join(",") !== b.join(",")) bad.push(id + ":nondeterministic");
        if (!a.length) { bad.push(id + ":empty"); continue; }
        const flagCount = a.filter(h => specs[h] && specs[h].flags.indexOf("!flagship") !== -1).length;
        if (flagCount !== 1) bad.push(id + ":flagships=" + flagCount);
        if (!specs[a[0]] || specs[a[0]].flags.indexOf("!flagship") === -1) bad.push(id + ":lead-not-flagship");
        let cost = 0;
        for (const h of a) {
          if (!specs[h]) { bad.push(id + ":unknown-hull " + h); continue; }
          cost += specs[h].cost;
        }
        if (cost > 60000) bad.push(id + ":over-budget " + cost);
      }
      return {
        name: "M6a-1 DOCTRINE FLEETS SEEDED + LEGAL (5 factions)",
        pass: bad.length === 0,
        detail: "ids=[" + ids.join(",") + "] issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6a-2 (M6): the doctrine weights reproduce the DESIGN §4.7
    // statistics over seeded rolls — Armoury fields a capital ship in
    // ≥90% of fleets (its flagship pool is capital-hulled), Fringe almost
    // never does (≤20%), Freehold draws mostly missile hulls (≥55%) and
    // Capital rarely fields fighters or bombers (≤10%).
    testFactionDoctrineStats() {
      const specs = bridge.shipSpecs;
      const ROLLS = 100;
      const isCapital = h => specs[h] && specs[h].flags.indexOf("#capital ship") !== -1;
      const collect = (id) => {
        let fleetsWithCapital = 0, draws = 0, missile = 0, fighterBomber = 0;
        for (let s = 1; s <= ROLLS; s++) {
          const fleet = bridge.rollFleet(id, 60000, 1000 + s);
          if (fleet.some(isCapital)) fleetsWithCapital++;
          for (const h of fleet) {
            draws++;
            if (specs[h] && specs[h].wType === "missile") missile++;
            if (h === "Fighter" || h === "Bomber") fighterBomber++;
          }
        }
        return { capShare: fleetsWithCapital / ROLLS, missileShare: missile / draws, fbShare: fighterBomber / draws, draws: draws };
      };
      const armoury = collect("Armoury");
      const fringe = collect("Fringe");
      const freehold = collect("Freehold");
      const capital = collect("Capital");
      const bad = [];
      if (armoury.capShare < 0.9) bad.push("armoury capital " + armoury.capShare.toFixed(2));
      if (fringe.capShare > 0.2) bad.push("fringe capital " + fringe.capShare.toFixed(2));
      if (freehold.missileShare < 0.55) bad.push("freehold missile " + freehold.missileShare.toFixed(2));
      if (capital.fbShare > 0.1) bad.push("capital fighters/bombers " + capital.fbShare.toFixed(2));
      return {
        name: "M6a-2 DOCTRINE WEIGHT STATISTICS (100 seeded rolls each)",
        pass: bad.length === 0,
        detail: "armoury-capital=" + armoury.capShare.toFixed(2) + " fringe-capital=" + fringe.capShare.toFixed(2) +
          " freehold-missile=" + freehold.missileShare.toFixed(2) + " capital-fb=" + capital.fbShare.toFixed(2) +
          " issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6a-3 (M6): the faction table is complete — the five DESIGN §4.7
    // factions, each with doctrine rows — and each faction's battle-side
    // hull themes carry a lit ramp and a hull-stripe colour.
    testFactionTableComplete() {
      const expect = ["Syndicate", "Capital", "Freehold", "Armoury", "Fringe"];
      const ids = bridge.factionIds().slice().sort();
      const bad = [];
      if (ids.join(",") !== expect.slice().sort().join(",")) bad.push("ids=[" + ids.join(",") + "]");
      for (const id of expect) {
        const row = bridge.factionRow(id);
        if (!row) { bad.push(id + ":missing"); continue; }
        const d = row.doctrine || {};
        if (typeof row.defaultAlignment !== "number") bad.push(id + ":alignment");
        if (!row.theme) bad.push(id + ":theme");
        if (!d.tactic || !d.profile) bad.push(id + ":doctrine");
        const comp = d.composition || {};
        if (!(comp.common && comp.common.length) || !(comp.uncommon && comp.uncommon.length) || !(comp.rare && comp.rare.length)) bad.push(id + ":composition");
        const ht = bridge.hullThemesFor(id);
        const side = ht ? ht[2] : null;
        if (!side || typeof side.lit !== "string" || typeof side.stripe !== "string" || !side.stripe) bad.push(id + ":hull-stripe");
      }
      const syn = bridge.factionRow("Syndicate");
      if (!syn || syn.defaultAlignment !== -20) bad.push("syndicate alignment");
      return {
        name: "M6a-3 FACTION TABLE + HULL STRIPES COMPLETE (DESIGN 4.7)",
        pass: bad.length === 0,
        detail: "factions=" + ids.length + " issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6b-1 (M6): the Q10 quintile boundaries pin exactly, and a
    // reputation delta can flip a pair's band at a threshold.
    testReputationBands() {
      const bad = [];
      const expect = [[-100, "enemy"], [-41, "enemy"], [-40, "unfriendly"], [0, "unfriendly"], [19, "unfriendly"],
        [20, "neutral"], [79, "neutral"], [80, "friendly"], [139, "friendly"], [140, "allied"], [200, "allied"]];
      for (const [score, band] of expect) {
        const got = bridge.repBand(score);
        if (got !== band) bad.push(score + "=" + got + "!=" + band);
      }
      if (bridge.repBand(-150) !== "enemy") bad.push("clamp-low");
      if (bridge.repBand(999) !== "allied") bad.push("clamp-high");
      // The acceptance flip: unfriendly 19 + delta 1 crosses 20 into neutral.
      const rep = bridge.repAdjust({ "player|Syndicate": 19 }, "player", "Syndicate", 1);
      const flipped = bridge.repBand(rep["player|Syndicate"]);
      if (flipped !== "neutral") bad.push("flip=" + flipped);
      // ...and neutral 79 + delta 1 crosses 80 into friendly.
      const rep2 = bridge.repAdjust({ "player|Syndicate": 79 }, "player", "Syndicate", 1);
      if (bridge.repBand(rep2["player|Syndicate"]) !== "friendly") bad.push("flip2");
      return {
        name: "M6b-1 REPUTATION QUINTILES + BAND FLIP (Q10 boundaries)",
        pass: bad.length === 0,
        detail: "checks=" + (expect.length + 5) + " issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6b-2 (M6): stances are band-driven and strictly pairwise (no
    // transitivity); the sharing policy follows DESIGN §2.7 — allied-only
    // out of battle, friendly+ in battle, never in hyperspace or across
    // systems.
    testStanceAndSharing() {
      const bad = [];
      if (bridge.repStance({ "player|Syndicate": -100 }, "player", "Syndicate") !== "hostile") bad.push("hostile");
      if (bridge.repStance({ "player|Syndicate": 0 }, "player", "Syndicate") !== "neutral") bad.push("neutral");
      if (bridge.repStance({ "player|Syndicate": 200 }, "player", "Syndicate") !== "allied") bad.push("allied");
      if (bridge.repStance({ "Syndicate|player": 150 }, "player", "Syndicate") !== "allied") bad.push("key-order");
      if (bridge.repStance({}, "player", "Syndicate") !== "neutral") bad.push("missing-pair");
      // Non-transitive: A-B and B-C allied says nothing about A-C.
      const web = { "A|B": 200, "B|C": 200 };
      if (bridge.repStance(web, "A", "C") !== "neutral") bad.push("transitive");
      const shares = [
        [bridge.repShares("allied", { inBattle: false, sameSystem: true }), true, "allied-out"],
        [bridge.repShares("friendly", { inBattle: false, sameSystem: true }), false, "friendly-out"],
        [bridge.repShares("friendly", { inBattle: true, sameSystem: true }), true, "friendly-in"],
        [bridge.repShares("neutral", { inBattle: true, sameSystem: true }), false, "neutral-in"],
        [bridge.repShares("allied", { inBattle: true, inHyperspace: true, sameSystem: true }), false, "hyper"],
        [bridge.repShares("allied", { inBattle: true, sameSystem: false }), false, "cross-system"]
      ];
      for (const [got, want, label] of shares) if (got !== want) bad.push(label + "=" + got);
      return {
        name: "M6b-2 STANCE PAIRWISE + SHARING POLICY (DESIGN 2.7)",
        pass: bad.length === 0,
        detail: "checks=13 issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6b-3 (M6): the event hooks carry the Q10 rates (kills ±10,
    // missions ±15, trade ±2), the pair table seeds from default
    // alignment, and scores clamp to −100..200.
    testReputationEvents() {
      const bad = [];
      const seed = bridge.repInit();
      if (seed["player|Syndicate"] !== -20) bad.push("seed-syndicate=" + seed["player|Syndicate"]);
      if (seed["player|Capital"] !== 20) bad.push("seed-capital=" + seed["player|Capital"]);
      if (seed["Syndicate|Capital"] !== 0) bad.push("seed-pair");
      const r1 = bridge.repEvent({}, "kill", "player", "Syndicate");
      if (r1["player|Syndicate"] !== -10) bad.push("kill=" + r1["player|Syndicate"]);
      const r2 = bridge.repEvent({}, "mission", "player", "Capital");
      if (r2["player|Capital"] !== 15) bad.push("mission=" + r2["player|Capital"]);
      const r3 = bridge.repEvent({}, "trade", "player", "Freehold");
      if (r3["player|Freehold"] !== 2) bad.push("trade=" + r3["player|Freehold"]);
      const r4 = bridge.repEvent({}, "mission", "player", "Capital", -1);
      if (r4["player|Capital"] !== -15) bad.push("mission-fail=" + r4["player|Capital"]);
      const clamped = bridge.repAdjust({ "player|Capital": 195 }, "player", "Capital", 50);
      if (clamped["player|Capital"] !== 200) bad.push("clamp-high=" + clamped["player|Capital"]);
      const clamped2 = bridge.repAdjust({ "player|Capital": -95 }, "player", "Capital", -50);
      if (clamped2["player|Capital"] !== -100) bad.push("clamp-low=" + clamped2["player|Capital"]);
      // Adjust returns a NEW table (transforms never mutate the input).
      const before = { "player|Capital": 0 };
      bridge.repAdjust(before, "player", "Capital", 5);
      if (before["player|Capital"] !== 0) bad.push("mutated");
      return {
        name: "M6b-3 REPUTATION EVENT RATES + CLAMPS (Q10 defaults)",
        pass: bad.length === 0,
        detail: "seed=[" + seed["player|Syndicate"] + "," + seed["player|Capital"] + "] issues=[" + bad.join("; ") + "]"
      };
    },

    runAll() {
      return [
        this.testFactionFleetRolls(),this.testFactionDoctrineStats(),
        this.testFactionTableComplete(),this.testReputationBands(),this.testStanceAndSharing(),
        this.testReputationEvents()
      ];
    }
  };

  if (testName && typeof suite[testName] === "function") return suite[testName]();
  return suite.runAll();
};
