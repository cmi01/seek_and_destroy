"use strict";

// ============================================================
// missionSuite.js — job: run the missions-dialogue self-tests through the game-side test bridge.
// Owner: gameTests.js. Holds no state.
// ============================================================
const missionSuite = function (bridge, testName) {
  const suite = {
    // T-M6c-1 (M6): the dialogue model picks the band's voice line from
    // the right faction bank and always offers the Q11 choices (trade
    // first).
    testDialogueModel() {
      const bad = [];
      for (const id of bridge.factionIds()) {
        const row = bridge.factionRow(id);
        const model = bridge.dialogueFor({ encounterFaction: id }, 0);
        if (model.faction !== id) bad.push(id + ":faction");
        if (model.tone !== row.voice.tone) bad.push(id + ":tone");
        const pool = row.voice.lines[model.band] || [];
        if (pool.indexOf(model.line) === -1) bad.push(id + ":line-not-in-band");
        if (model.options.join(",") !== "trade,talk,threaten,leave") bad.push(id + ":options");
      }
      // The seeded pair flips the band and therefore the voice pool.
      bridge.initializeCampaign();
      const syn = bridge.dialogueFor({ encounterFaction: "Syndicate" }, 0);
      if (syn.band !== "unfriendly") bad.push("syndicate-band=" + syn.band);
      return {
        name: "M6c-1 DIALOGUE MODEL + VOICE BANKS (5 factions x 5 bands)",
        pass: bad.length === 0,
        detail: "checks=23 issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6c-2 (M6): the choice outcomes — talk is a no-op event,
    // threaten signals the fight path, trade signals the storefront, and
    // leave re-places the player fleet on a nearest open square (DESIGN
    // §4.4).
    testDialogueOutcome() {
      const bad = [];
      bridge.initializeCampaign();
      const enc = { encounterFaction: "Syndicate", kind: "fleet", locationId: "sol-gate" };
      const before = bridge.campaign;
      const t = bridge.dialogueOutcome(enc, "talk", 7);
      if (!t.events.length || t.events[0].kind !== "dialogueTalk") bad.push("talk-event");
      if (t.state !== before) bad.push("talk-mutated-state");
      const th = bridge.dialogueOutcome(enc, "threaten", 7);
      if (!th.events.length || !th.events[0].fight) bad.push("threaten-event");
      const tr = bridge.dialogueOutcome(enc, "trade", 7);
      if (!tr.events.length || tr.events[0].kind !== "dialogueTrade") bad.push("trade-event");
      // Leave: a fleet parked next to another must land on an open square.
      const map = bridge.mapFromTable();
      map.fleets = [
        { id: "player", faction: "player", x: 20, y: 20, fuel: 100, ships: [{}, {}, {}] },
        { id: "npc", faction: "Syndicate", x: 21, y: 20, fuel: 100, ships: [{}, {}] }
      ];
      bridge.mapSet(map);
      const lv = bridge.dialogueOutcome(enc, "leave", 11);
      const pf = lv.state.map.fleets.find(f => f.faction === "player");
      const nf = lv.state.map.fleets.find(f => f.id === "npc");
      const moved = pf && (pf.x !== 20 || pf.y !== 20);
      const open = pf && nf && (Math.abs(pf.x - nf.x) > 1 || Math.abs(pf.y - nf.y) > 1);
      if (!moved) bad.push("leave-did-not-move");
      if (!open) bad.push("leave-not-open");
      if (!lv.events.length || lv.events[0].kind !== "dialogueLeave") bad.push("leave-event");
      return {
        name: "M6c-2 DIALOGUE OUTCOMES + LEAVE RE-PLACEMENT (DESIGN 4.4)",
        pass: bad.length === 0,
        detail: "issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6c-3 (M6): the hail panel carries the voice line and the Q11
    // button row (HAIL_TRADE first) through the map HUD model.
    testHailPanel() {
      const bad = [];
      bridge.initializeCampaign();
      const enc = { encounterFaction: "Capital", kind: "fleet", locationId: "sol-gate" };
      const panel = bridge.hailPanelFor(enc, 0);
      if (panel.speaker.indexOf("CAPITAL") === -1) bad.push("speaker=" + panel.speaker);
      const voiceLine = panel.lines.find(l => l.indexOf(String.fromCharCode(34)) !== -1);
      if (!voiceLine) bad.push("no-voice-line");
      if (panel.options[0] !== "trade") bad.push("trade-not-first");
      const map = bridge.mapFromTable();
      const hud = bridge.mapHudModel(map, { hail: panel });
      const ids = (hud.hail && Array.isArray(hud.hail.buttons)) ? hud.hail.buttons.map(b => b.id).join(",") : "";
      if (ids.indexOf("HAIL_TRADE") === -1) bad.push("no-trade-button: " + ids);
      if (ids.indexOf("HAIL_LEAVE") === -1) bad.push("no-leave-button: " + ids);
      return {
        name: "M6c-3 HAIL PANEL + Q11 BUTTON ROW (voice line live)",
        pass: bad.length === 0,
        detail: "buttons=[" + ids + "] issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6d-1 (M6): the station board posts the authored fixed contracts
    // (Q9) — the next available one per location, with payout and
    // offering faction — and accepting it moves it into progress.
    testMissionBoard() {
      const bad = [];
      bridge.initializeCampaign();
      // Regression guard: the facade must forward the pair-table builder,
      // so the initialized campaign seeds player|factions (not the M1
      // faction-pairs-only fallback).
      const initRep = bridge.campaign["reputation"] || {};
      if (initRep["player|Syndicate"] !== -20) bad.push("init-seed-synd=" + initRep["player|Syndicate"]);
      if (initRep["player|Capital"] !== 20) bad.push("init-seed-capital=" + initRep["player|Capital"]);
      const table = bridge.missionTable();
      if (table.length !== 4) bad.push("table=" + table.length);
      const c1 = bridge.missionNextAt("sol-gate", 1);
      if (!c1 || c1.id !== "c1-wolfpack-bounty") bad.push("next=" + (c1 && c1.id));
      if (!c1 || c1.payout !== 4000 || c1.faction !== "Capital") bad.push("payout/faction");
      if (bridge.missionNextAt("khepri-station", 1) === null) bad.push("khepri-empty");
      bridge.acceptContract(c1.id);
      const after = bridge.campaign;
      if (after.contracts.active.indexOf(c1.id) === -1) bad.push("not-active");
      if (bridge.missionNextAt("sol-gate", 1) !== null) bad.push("still-posted");
      bridge.acceptContract(c1.id);
      if (bridge.campaign.contracts.active.length !== 1) bad.push("double-accept");
      return {
        name: "M6d-1 STATION BOARD + FIXED CONTRACTS (Q9)",
        pass: bad.length === 0,
        detail: "rows=" + table.length + " issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6d-2 (M6): completion pays the payout into the wallet and moves
    // reputation ±15 toward the offering faction (Q10) — and a contract
    // whose target is unmet cannot settle.
    testMissionPayout() {
      const bad = [];
      bridge.initializeCampaign();
      const before = bridge.campaign;
      bridge.acceptContract("c1-wolfpack-bounty");
      const early = bridge.completeContract("c1-wolfpack-bounty");
      if (early.completed) bad.push("settled-early");
      bridge.creditProgress("destroy", 2);
      const walletBefore = bridge.campaign.wallet;
      const repBefore = (bridge.campaign["reputation"] || {})["player|Capital"] || 0;
      const res = bridge.completeContract("c1-wolfpack-bounty");
      const after = bridge.campaign;
      if (!res.completed || res.payout !== 4000) bad.push("settle=" + JSON.stringify(res));
      if (after.wallet !== walletBefore + 4000) bad.push("wallet " + walletBefore + "->" + after.wallet);
      const repAfter = (after["reputation"] || {})["player|Capital"] || 0;
      if (repAfter !== repBefore + 15) bad.push("rep " + repBefore + "->" + repAfter);
      if (after.contracts.done.indexOf("c1-wolfpack-bounty") === -1) bad.push("not-done");
      if (before.wallet === after.wallet) bad.push("wallet-unchanged");
      return {
        name: "M6d-2 CONTRACT PAYOUT + REPUTATION EVENT (Q10 +15)",
        pass: bad.length === 0,
        detail: "wallet " + walletBefore + "->" + after.wallet + " rep " + repBefore + "->" + repAfter + " issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6d-3 (M6): the authored chain links through `next` and its final
    // contract sets the campaign-complete state (Q9) — the acceptance
    // fixture walks the whole chain.
    testMissionChainComplete() {
      const bad = [];
      bridge.initializeCampaign();
      const table = bridge.missionTable();
      for (let i = 0; i < table.length - 1; i++){
        if (table[i].next !== table[i + 1].id) bad.push("link " + table[i].id);
      }
      if (!table[table.length - 1].final) bad.push("last-not-final");
      for (const m of table){
        bridge.acceptContract(m.id);
        const target = m.target || {};
        for (const k of Object.keys(target)) bridge.creditProgress(k === "kills" ? "destroy" : "turn", target[k]);
        const res = bridge.completeContract(m.id);
        if (!res.completed) bad.push("did-not-settle " + m.id);
        if (m.final && !res.final) bad.push("final-flag");
      }
      const done = bridge.campaign.contracts;
      if (done.done.length !== 4) bad.push("done=" + done.done.length);
      if (done.campaignComplete !== true) bad.push("campaign-not-complete");
      return {
        name: "M6d-3 AUTHORED CHAIN -> CAMPAIGN COMPLETE (Q9 fixture)",
        pass: bad.length === 0,
        detail: "done=" + done.done.length + " complete=" + done.campaignComplete + " issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6f (M6): M5-era saves migrate — missing player|faction
    // reputation pairs seed at their defaults (saved scores always win)
    // and the contract progress shape joins the section; the version
    // stamps M6-1.0 and a current save round-trips untouched.
    testSaveMigration() {
      const bad = [];
      const m5 = {
        version: "M5-1.0",
        schema: "seek-and-destroy.beginning-game-state",
        state: {
          campaign: {
            fleet: [],
            wallet: 1234,
            cargo: { goods: 1, fuel: 2, crew: 3, parts: 4, weapons: {} },
            reputation: { "player|Syndicate": -55, "Syndicate|Capital": 7 },
            clock: { month: 2, year: 2401 },
            map: { locationId: "sol-gate", turn: 3 }
          }
        }
      };
      if (!bridge.loadState(m5)) bad.push("load-rejected");
      const c = bridge.campaign;
      const rep = c["reputation"] || {};
      if (rep["player|Syndicate"] !== -55) bad.push("saved-score-lost=" + rep["player|Syndicate"]);
      if (rep["player|Capital"] !== 20) bad.push("capital-seed=" + rep["player|Capital"]);
      if (rep["Syndicate|Capital"] !== 7) bad.push("pair-kept=" + rep["Syndicate|Capital"]);
      const contracts = c.contracts || {};
      if (!Array.isArray(contracts.active) || !Array.isArray(contracts.done) || contracts.campaignComplete !== false) bad.push("contracts-shape");
      const snap = bridge.saveState();
      if (snap.version !== "M6-1.0") bad.push("version=" + snap.version);
      if (c.wallet !== 1234) bad.push("wallet=" + c.wallet);
      // A current save round-trips untouched (JSON identity).
      const once = JSON.stringify(snap);
      if (!bridge.loadState(snap)) bad.push("reload-rejected");
      const twice = JSON.stringify(bridge.saveState());
      if (once !== twice) bad.push("round-trip-differs");
      return {
        name: "M6f SAVE MIGRATION (M5-era -> M6-1.0)",
        pass: bad.length === 0,
        detail: "seeded=" + rep["player|Capital"] + " kept=" + rep["player|Syndicate"] + " version=" + snap.version + " issues=[" + bad.join("; ") + "]"
      };
    },

    // T-M6e (M6 acceptance): a seeded simulation — two NPC fleets resolve
    // an interaction (battle outcome AND trade outcome) on the map with
    // NO player input: only the pure map decisions and the order resolver
    // run. World life is deterministic under a seeded clock.
    testNpcMapInteraction() {
      const bad = [];
      // Fixture A: two hostile NPC fleets within reach (no player fleet).
      const fixture = {
        turn: 1, screen: "map",
        locations: [{ id: "relay-9", x: 10, y: 10 }],
        fleets: [
          { id: "s1", faction: "Syndicate", x: 10, y: 12, fuel: 9, ships: [{}, {}, {}] },
          { id: "f1", faction: "Freehold", x: 11, y: 12, fuel: 9, ships: [{}, {}] }
        ]
      };
      const orders = bridge.npcOrdersFor(fixture, "Syndicate", 7);
      const fight = orders.filter(o => o.kind === "fight")[0] || null;
      if (!fight) bad.push("no-fight-order");
      const res = fight ? bridge.npcResolve(fixture, fight, 7) : { mapState: fixture, events: [] };
      const kinds = res.events.map(e => e.kind);
      if (kinds.indexOf("npcBattle") === -1) bad.push("no-battle-event");
      if (kinds.indexOf("npcBattleOutcome") === -1) bad.push("no-outcome-event");
      const left = (res.mapState.fleets || []).filter(f => f.id === "f1" || f.id === "s1");
      if (left.length !== 1) bad.push("survivors=" + left.length);
      if (left[0] && left[0].id !== "s1") bad.push("weaker-won");
      // Fixture B: a lone NPC fleet at a station trades without input.
      const station = {
        turn: 1, screen: "map",
        locations: [{ id: "relay-9", x: 10, y: 10 }],
        fleets: [{ id: "c1", faction: "Capital", x: 10, y: 10, fuel: 3, ships: [{}] }]
      };
      const tOrders = bridge.npcOrdersFor(station, "Capital", 5);
      const trade = tOrders.filter(o => o.kind === "trade")[0] || null;
      if (!trade) bad.push("no-trade-order");
      const tRes = trade ? bridge.npcResolve(station, trade, 5) : { mapState: station, events: [] };
      if ((tRes.events.map(e => e.kind)).indexOf("npcTrade") === -1) bad.push("no-trade-event");
      return {
        name: "M6e SEEDED NPC INTERACTION — TWO FLEETS, NO PLAYER INPUT",
        pass: bad.length === 0,
        detail: "battle=[" + kinds.join(",") + "] trade=[" + tRes.events.map(e => e.kind).join(",") + "] issues=[" + bad.join("; ") + "]"
      };
    },

    runAll() {
      return [
        this.testDialogueModel(),this.testDialogueOutcome(),this.testHailPanel(),
        this.testMissionBoard(),this.testMissionPayout(),this.testMissionChainComplete(),
        this.testSaveMigration(),this.testNpcMapInteraction()
      ];
    }
  };

  if (testName && typeof suite[testName] === "function") return suite[testName]();
  return suite.runAll();
};
