#!/usr/bin/env node
"use strict";
// Repeatable HUD-geometry check at several display sizes and DPRs.
// Asserts widget rects stay on-canvas and label budgets cover the strings
// that GS-04..GS-11 used to clip. Does not need a browser.
//
//   node dev/scripts/gui_scale_layout_check.js [repo-root]
//
(function () {
  const fs = require("fs");
  const vm = require("vm");
  const path = require("path");

  const root = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "..");

  const ctx = vm.createContext({ Math, String, Array, Boolean, Object, Number, console });
  function load(rel, names) {
    const p = path.join(root, rel);
    let src = fs.readFileSync(p, "utf8");
    for (const name of names) src += "\n;this." + name + " = " + name + ";\n";
    vm.runInContext(src, ctx, { filename: p });
  }
  load("main.js children/uiTokens_DATA.js", ["uiTokensTable"]);
  load("main.js children/resolveUiMetrics.js", ["resolveUiMetrics"]);
  load("main.js children/game.js children/hud.js children/buildCampaignLayout.js", ["buildCampaignLayout"]);
  load("main.js children/game.js children/hud.js children/buildEndgameButtons.js", ["buildEndgameButtons"]);
  load("main.js children/game.js children/hud.js children/buildReserveButtons.js", ["buildReserveButtons"]);
  load("main.js children/game.js children/hud.js children/buildHelpPanel.js", ["buildHelpPanel"]);
  load("main.js children/game.js children/hud.js children/buildTopBarChrome.js", ["buildTopBarChrome"]);
  load("main.js children/game.js children/hud.js children/buildDeploymentModel.js", ["buildDeploymentModel"]);
  load("main.js children/game.js children/hud.js children/buildDeploymentButtons.js", ["buildDeploymentButtons"]);

  const tokens = ctx.uiTokensTable;
  const resolve = ctx.resolveUiMetrics;
  const fails = [];
  function check(name, ok, detail) {
    if (!ok) fails.push(name + ": " + detail);
    else console.log("PASS " + name + (detail ? " — " + detail : ""));
  }

  function metrics(ds, rs) {
    const us = ds / 768;
    return {
      displaySize: ds,
      uiScale: us,
      renderScale: rs,
      ui: resolve(tokens, { displaySize: ds, uiScale: us, renderScale: rs })
    };
  }
  function input(ds, rs) {
    return { metrics: metrics(ds, rs), state: { activeTeam: 1, gameOver: false } };
  }

  const sizes = [
    ["os100", 1072, 1],
    ["os125", 856, 1.25],
    ["os150", 712, 1.5],
    ["os200", 532, 2],
    ["os250", 424, 2.5],
    ["ds200", 200, 1],
    ["ds400", 400, 1],
    ["ds768", 768, 1],
    ["ds1440", 1440, 2]
  ];

  for (const row of sizes) {
    const name = row[0], ds = row[1], rs = row[2];
    const ui = metrics(ds, rs).ui;
    const expect = Math.round(15 * (ds / 768));
    check(name + " textPx", ui.textPx === expect, "got " + ui.textPx + " expected " + expect);
    const hair = Math.max(1 / rs, 1 * (ds / 768));
    check(name + " hairline", Math.abs(ui.stroke.hairline - hair) < 1e-9, String(ui.stroke.hairline));
  }

  const hi = resolve(tokens, { displaySize: 424, uiScale: 424 / 768, renderScale: 2.5 });
  check("GS-02 stroke uses rs 2.5", Math.abs(hi.stroke.hairline - Math.max(1 / 2.5, 424 / 768)) < 1e-9, String(hi.stroke.hairline));

  const cards = [1, 2, 3, 4].map(function (id) {
    return { id: id, title: "SECTOR " + id, isDone: false, isNext: id === 1 };
  });
  const helpLines = [
    "# CONTROLS",
    "Move the cursor with the pointer. Select a friendly vessel and issue a move or a shot.",
    "Open the shop to deploy reinforcements. The briefing continues for several more rows so the panel must stay on a small canvas.",
    "Line four of the briefing text that used to push the close button off the canvas.",
    "Line five. Line six is long enough to wrap under the conservative advance estimate used by the panel."
  ];

  for (const row of sizes) {
    const name = row[0], ds = row[1], rs = row[2];
    const inp = input(ds, rs);
    const ui = inp.metrics.ui;
    const camp = ctx.buildCampaignLayout(inp, cards);
    const close = camp.layout.closeBtn;
    check(name + " campaign close on canvas",
      close.x >= 0 && close.y >= 0 && close.x + close.w <= ds + 1 && close.y + close.h <= ds + 1,
      JSON.stringify(close));
    const hdrW = close.x - (camp.layout.mx + Math.round(12 * inp.metrics.uiScale)) - 1;
    let widest = 0;
    for (const line of camp.layout.subtitleLines) widest = Math.max(widest, line.length * ui.charW);
    check(name + " GS-04 subtitle wrapped",
      camp.layout.subtitleLines.length >= 1 && widest <= hdrW + ui.charW,
      "lines=" + camp.layout.subtitleLines.length + " widest=" + widest.toFixed(1) + " budget=" + hdrW + " text=" + JSON.stringify(camp.layout.subtitleLines));
    const labelBudget = close.w - Math.round(19 * inp.metrics.uiScale);
    check(name + " GS-05 budget >= estimate",
      labelBudget + 1 >= "CLOSE [ESC]".length * ui.charW * 0.9,
      "budget=" + labelBudget + " estimate=" + ("CLOSE [ESC]".length * ui.charW).toFixed(1) + " w=" + close.w);
    let nodesIn = true;
    for (const n of camp.nodes) {
      const labelBottom = n.cy + n.r + Math.round(28 * inp.metrics.uiScale);
      if (n.cx - n.r < -1 || n.cx + n.r > ds + 1 || labelBottom > ds + 2) nodesIn = false;
    }
    check(name + " GS-11 nodes in canvas", nodesIn, "r=" + (camp.nodes[0] && camp.nodes[0].r));

    const eg = ctx.buildEndgameButtons(inp, { isVictory: false, body: "All friendly !flagship command vessels have been destroyed. Command locus severed." });
    const panel = eg.panel;
    check(name + " GS-09 panel in canvas",
      panel.x >= -1 && panel.y >= -1 && panel.x + panel.w <= ds + 1 && panel.y + panel.h <= ds + 1,
      JSON.stringify(panel));
    const retry = eg.buttons[0];
    const bodyBottom = panel.y + Math.round(46 * inp.metrics.uiScale) + eg.lines.length * eg.lineH;
    check(name + " GS-09 body above buttons",
      eg.lines.length === 0 || bodyBottom <= retry.y + 1,
      "bodyBottom=" + bodyBottom + " btnY=" + retry.y + " lines=" + eg.lines.length);
    const egBudget = retry.w - Math.round(19 * inp.metrics.uiScale);
    check(name + " GS-06 redeploy budget",
      egBudget + 1 >= "REDEPLOY SECTOR".length * ui.charW * 0.9,
      "budget=" + egBudget + " estimate=" + ("REDEPLOY SECTOR".length * ui.charW).toFixed(1) + " w=" + retry.w);

    const shop = ctx.buildReserveButtons(inp, { cards: [
      { shipName: "Fighter", affordable: true },
      { shipName: "Probe", affordable: true }
    ]});
    const bc = shop.layout.closeBtn;
    const card = shop.buttons[1];
    const overlap = !(bc.x + bc.w <= card.x || card.x + card.w <= bc.x || bc.y + bc.h <= card.y || card.y + card.h <= bc.y);
    check(name + " GS-10 close misses cards", !overlap, "close=" + JSON.stringify(bc) + " card=" + JSON.stringify({ x: card.x, y: card.y, w: card.w, h: card.h }));
    check(name + " GS-10 close in header", bc.y + bc.h <= shop.layout.my + shop.layout.hdrH + 1, "bottom=" + (bc.y + bc.h) + " hdr=" + (shop.layout.my + shop.layout.hdrH));

    const help = ctx.buildHelpPanel(inp, helpLines);
    const r = help.rect;
    const cb = help.closeBtn;
    check(name + " GS-08 help on canvas",
      r.x >= -1 && r.y >= -1 && r.x + r.w <= ds + 1 && r.y + r.h <= ds + 1 &&
      cb.x >= -1 && cb.y >= -1 && cb.x + cb.w <= ds + 1 && cb.y + cb.h <= ds + 1,
      "rect=" + JSON.stringify(r) + " close=" + JSON.stringify(cb));

    const chrome = ctx.buildTopBarChrome(inp, false);
    let buttonsIn = true;
    const all = chrome.topButtons.concat(chrome.bottomButtons);
    for (const b of all) {
      if (b.x < -1 || b.y < -1 || b.x + b.w > ds + 1 || b.y + b.h > ds + 1) buttonsIn = false;
    }
    const reinf = chrome.topButtons[0];
    const reinfBudget = reinf.w - Math.round(19 * inp.metrics.uiScale);
    check(name + " top bar in canvas", buttonsIn, JSON.stringify(all.map(function (b) { return b.id + ":" + b.w; })));
    check(name + " GS-07 reinforcements budget",
      reinfBudget + 1 >= "REINFORCEMENTS".length * ui.charW * 0.9,
      "budget=" + reinfBudget + " estimate=" + ("REINFORCEMENTS".length * ui.charW).toFixed(1) + " textPx=" + ui.textPx);

    // GS-15 deploy modal: CONFIRM fits its label, the capacity block wraps
    // (never ellipsizes), and every deploy row label fits its button budget.
    const depState = {
      deployment: {
        capacity: 2,
        selected: [0],
        wallet: 100,
        fleet: [
          { hull: "Flagship Battlecruiser", flagship: true, crew: 10, maxCrew: 10 },
          { hull: "Missile Battleship", crew: 10, maxCrew: 10 },
          { hull: "Attack Frigate", crew: 1, maxCrew: 10 }
        ]
      },
      wallet: 100
    };
    const depModel = ctx.buildDeploymentModel(null, { metrics: inp.metrics, state: depState });
    const dep = ctx.buildDeploymentButtons({ metrics: inp.metrics, state: depState }, depModel);
    const confirm = dep.buttons[dep.buttons.length - 1];
    const confirmBudget = confirm.w - Math.round(19 * inp.metrics.uiScale);
    check(name + " GS-15 confirm budget",
      confirmBudget + 1 >= "CONFIRM DEPLOYMENT".length * ui.charW * 0.9,
      "budget=" + confirmBudget + " estimate=" + ("CONFIRM DEPLOYMENT".length * ui.charW).toFixed(1) + " w=" + confirm.w);
    check(name + " GS-15 confirm on canvas",
      confirm.x >= -1 && confirm.y >= -1 && confirm.x + confirm.w <= ds + 1 && confirm.y + confirm.h <= ds + 1,
      JSON.stringify(confirm));
    let capWrapped = depModel.capLines.length >= 1 && depModel.capLines.join(" ") === depModel.capText;
    let capFits = true;
    for (const line of depModel.capLines) {
      if (line.length * ui.charW > dep.panel.w - Math.round(24 * inp.metrics.uiScale) + ui.charW) capFits = false;
    }
    check(name + " GS-15 cap block wraps whole",
      capWrapped && capFits && depModel.capText.indexOf("\u2026") === -1,
      "lines=" + JSON.stringify(depModel.capLines));
    const capExtra = Math.max(0, depModel.capLines.length - 1) * Math.round(15 * inp.metrics.uiScale);
    let rowsIn = true, rowsFit = true, rowsClearCap = true;
    for (const b of dep.buttons) {
      if (b.x < -1 || b.y < -1 || b.x + b.w > ds + 1 || b.y + b.h > ds + 1) rowsIn = false;
      const budget = b.w - Math.round(19 * inp.metrics.uiScale);
      if (b.label.length * ui.charW * 0.9 > budget + 1) rowsFit = false;
      if (b.id.indexOf("DEPLOY_TOGGLE:") === 0 || b.id.indexOf("DEPLOY_LOCK:") === 0) {
        if (b.y < dep.panel.y + Math.round(52 * inp.metrics.uiScale) + capExtra - 1) rowsClearCap = false;
      }
    }
    check(name + " GS-15 deploy rows in canvas", rowsIn, JSON.stringify(dep.buttons.map(function (b) { return b.id + ":" + b.w; })));
    check(name + " GS-15 deploy row labels fit", rowsFit, "");
    check(name + " GS-15 rows clear wrapped cap block", rowsClearCap, "capExtra=" + capExtra + " lines=" + depModel.capLines.length);
  }

  const ratios = [];
  for (const name of ["os100", "os150", "os200"]) {
    const row = sizes.find(function (s) { return s[0] === name; });
    const ui = metrics(row[1], row[2]).ui;
    ratios.push(ui.closeCampaignW / row[1]);
  }
  const spread = Math.max.apply(null, ratios) - Math.min.apply(null, ratios);
  check("close width ratio stable", spread < 0.02, ratios.map(function (r) { return r.toFixed(4); }).join(" "));

  console.log(fails.length ? ("FAILS " + fails.length) : "ALL PASS");
  for (const f of fails) console.log("FAIL " + f);
  process.exit(fails.length ? 1 : 0);
})();
