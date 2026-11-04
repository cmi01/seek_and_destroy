"use strict";

// ============================================================
// campaignSuite.js — job: run the campaign-state self-tests through the game-side test bridge.
// Owner: gameTests.js. Holds no state.
// ============================================================
const campaignSuite = function (bridge, testName) {
  const suite = {
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
        before.wallet === 25000 && before.cargo && before["reputation"] && before.clock);
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
        section.cargo && section["reputation"] && section.clock && section.map;
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

    runAll() {
      return [
        this.testCampaignRosterConformance(),this.testCampaignStateRoundTrip(),
        this.testCampaignV99SaveMigration()
      ];
    }
  };

  if (testName && typeof suite[testName] === "function") return suite[testName]();
  return suite.runAll();
};
