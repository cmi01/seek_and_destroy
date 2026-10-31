"use strict";

// ============================================================
// hudModals.js — job: build the modal models — bridge shop, HELP panel (incl. row wrapping), campaign starmap and endgame.
// Owner: core/hud.js. Holds no state unless it is a core.
// ============================================================
(() => {
  // ---- HELP content (kept off the HUD; shown in the HELP menu) ----------
  const HELP_CONTROLS = [
    "[LMB] — select a vessel, or execute the highlighted action on a cell",
    "[SHIFT+CLICK / 'C'] — board and capture an adjacent spotted enemy",
    "[WASD] — pan the camera    [WHEEL] — zoom    minimap: drag to pan",
    "[I] (hold) — inspect: flag details for the selected vessel",
    "[ESC] — close menus and clear the selection"
  ];

  // Wrap help rows to the panel width. Pure: no measuring context here, so the
  // row budget uses the monospace advance estimate (0.64em, deliberately
  // conservative). The renderer fits every row to the panel as a hard
  // guarantee, so a slightly short row budget only costs an extra row.
  function wrapHelpRows(lines, availW, fontPx) {
    const charW = Math.max(1, fontPx * 0.64);
    const perRow = Math.max(12, Math.floor(availW / charW));
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = String(lines[i] || "");
      const isHead = raw.charAt(0) === "#";
      const words = (isHead ? raw.slice(1) : raw).split(" ");
      let cur = "";
      let first = true;
      for (let j = 0; j < words.length; j++) {
        const word = words[j];
        if (!cur.length) { cur = word; }
        else if ((cur + " " + word).length <= perRow) { cur += " " + word; }
        else { rows.push({ text: cur, head: isHead && first }); first = false; cur = word; }
      }
      rows.push({ text: cur, head: isHead && first });
    }
    return rows;
  }

  // ----------------------------------------------------------------
  // STARMAP LAYOUT — single deterministic source of truth for the
  // campaign starmap. Both the hit-test layout and the starmap renderer
  // consume the node geometry computed here (the renderer reads it from
  // the HUD snapshot), so the clickable regions always match what is
  // drawn. Pure: depends only on the card list and the canvas size.
  // ----------------------------------------------------------------
  function computeStarmapLayout(cards, DS, US) {
    const pad = Math.max(12, Math.round(20 * US));
    const mx = pad, my = pad;
    const mw = DS - pad * 2, mh = DS - pad * 2;
    const hdrH = Math.round(48 * US);
    const closeW = Math.max(82, Math.round(98 * US));
    const closeH = Math.max(22, Math.round(26 * US));
    const closeX = mx + mw - closeW - Math.round(10 * US);
    const closeY = my + Math.round(11 * US);
    const closeBtn = { id: "CLOSE_MODAL", label: "CLOSE [ESC]", x: closeX, y: closeY, w: closeW, h: closeH, enabled: true, active: false };

    const list = Array.isArray(cards) ? cards : [];
    const n = Math.max(1, list.length);
    const sideM = Math.round(84 * US);
    const contentX0 = mx + sideM;
    const contentX1 = mx + mw - sideM;
    const contentTop = my + hdrH + Math.round(44 * US);
    const contentBot = my + mh - Math.round(58 * US);
    const midY = (contentTop + contentBot) * 0.5;
    const amp = (contentBot - contentTop) * 0.5 * 0.62;
    const r = Math.max(22, Math.round(34 * US));
    const hitW = Math.max(2 * r + Math.round(10 * US), Math.round(132 * US));
    const hitH = 2 * r + Math.round(40 * US); // circle + label band beneath

    const nodes = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const t = n > 1 ? i / (n - 1) : 0.5;
      const cx = Math.round(contentX0 + (contentX1 - contentX0) * t);
      const cy = Math.round(midY - Math.cos(i * Math.PI) * amp);
      nodes.push({
        id: c.id,
        cx, cy, r,
        hitX: Math.round(cx - hitW * 0.5),
        hitY: Math.round(cy - r - Math.round(5 * US)),
        hitW, hitH
      });
    }
    return { mx, my, mw, mh, hdrH, closeBtn, nodes };
  }

  // ---- bridge / REINFORCEMENTS shop -------------------------------------
  // The shop model: warp-locus status line, credits and one card per buyable
  // ship. Pure: query deps + input in, plain modal model out.
  function buildBridgeShopModel(deps, input) {
    const selUnit = input.selectedUnit;
    const isCapitalSelected = Boolean(selUnit && selUnit.team === 1 && selUnit.flags.has("#capital ship"));
    const validCells = isCapitalSelected ? deps.validWarpCells(selUnit) : [];
    const canDeployLocus = isCapitalSelected && validCells.length > 0 && input.state.ap > 0;

    let locusText;
    if (!isCapitalSelected) {
      locusText = "LOCUS OFFLINE: Select a friendly #capital ship on the board first to warp reinforcements!";
    } else if (validCells.length === 0) {
      locusText = `LOCUS OBSTRUCTED: ${selUnit.type} at [${selUnit.x},${selUnit.y}] has 0 vacant R:6 cells!`;
    } else {
      locusText = `ACTIVE LOCUS: ${selUnit.type.toUpperCase()} AT [${selUnit.x},${selUnit.y}] (${validCells.length} VACANT R:6 CELLS READY)`;
    }

    const shipSpecs = deps.shipSpecs;
    const cards = [];
    Object.entries(shipSpecs).forEach(([shipName, spec]) => {
      if (!spec.flags.includes("buyable")) return;
      const priceOk = Boolean(input.state.credits[1] >= spec.cost);
      const affordable = Boolean(canDeployLocus && priceOk);
      cards.push({
        shipName,
        cost: spec.cost,
        flagsText: spec.flags.filter(f => f !== "buyable").join(" ") || "STANDARD",
        hp: spec.hp,
        move: spec.move,
        fp: spec.firepower,
        range: spec.range,
        scan: spec.scan,
        priceOk,
        affordable,
        dummyUnit: { type: shipName, team: 1, hp: spec.hp, maxHp: spec.hp, flags: new Set(spec.flags) }
      });
    });

    return {
      credits: input.state.credits[1],
      locusOk: canDeployLocus,
      locusText,
      cards
    };
  }

  // The shop's button grid: resume button plus one grid cell per ship card.
  // Pure: input + the card list in, plain button list out.
  function buildBridgeShopButtons(input, bridgeModal) {
    const DS = input.metrics.displaySize;
    const US = input.metrics.uiScale;
    const pad = Math.max(12, Math.round(18 * US));
    const mx = pad, my = pad;
    const mw = DS - pad * 2, mh = DS - pad * 2;
    const hdrH = Math.round(48 * US);
    const closeW = Math.max(88, Math.round(106 * US));
    const closeH = Math.max(22, Math.round(26 * US));
    const closeX = mx + mw - closeW - Math.round(10 * US);
    const closeY = my + Math.round(11 * US);
    const buttons = [
      { id: "CLOSE_MODAL", label: "RESUME [SPC]", x: closeX, y: closeY, w: closeW, h: closeH, enabled: true, active: false }
    ];
    const cards = Array.isArray(bridgeModal.cards) ? bridgeModal.cards : [];
    const cols = 3;
    const rows = Math.ceil(Math.max(1, cards.length) / cols);
    const gridPad = Math.round(10 * US);
    const gap = Math.round(7 * US);
    const gridX = mx + gridPad;
    const gridY = my + hdrH + gridPad;
    const gridW = mw - gridPad * 2;
    const gridH = mh - hdrH - gridPad * 2;
    const cardW = Math.floor((gridW - gap * (cols - 1)) / cols);
    const cardH = Math.floor((gridH - gap * (rows - 1)) / rows);
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      buttons.push({
        id: "SHOP_BUY:" + c.shipName,
        label: c.shipName,
        x: gridX + col * (cardW + gap),
        y: gridY + row * (cardH + gap),
        w: cardW,
        h: cardH,
        enabled: c.affordable,
        active: false
      });
    }
    return buttons;
  }

  // ---- HELP panel --------------------------------------------------------
  // The HELP content: controls and the mission briefing, as raw lines (the
  // '#' prefix marks a section head). Pure: level list + input in, out.
  function buildHelpLines(deps, input) {
    const levels = deps.campaignLevels;
    const spec = levels.find(l => l.id === input.state.levelId) || levels[0];
    const lines = ["#CONTROLS"];
    for (let i = 0; i < HELP_CONTROLS.length; i++) lines.push(HELP_CONTROLS[i]);
    if (spec && Array.isArray(spec.initialIntel)) {
      lines.push("#MISSION BRIEFING");
      for (let i = 0; i < spec.initialIntel.length; i++) lines.push(spec.initialIntel[i]);
    }
    return { title: "HELP // " + (spec ? spec.tag : "SECTOR"), lines };
  }

  // The HELP panel geometry: fixed-size canvas panel holding the text that is
  // otherwise hidden from the HUD. Rows wrap within the estimated budget and
  // the panel height tracks the row count. Pure: lines + input in, out.
  function buildHelpPanel(input, lines) {
    const DS = input.metrics.displaySize;
    const US = input.metrics.uiScale;
    const hw = Math.min(DS - Math.round(36 * US), Math.round(620 * US));
    const lineH = Math.round(24 * US);
    const textPx = Math.max(8, Math.round(15 * US));
    const rows = wrapHelpRows(lines, hw - Math.round(36 * US), textPx);
    const hh = Math.round(88 * US) + rows.length * lineH;
    const hx = Math.round((DS - hw) * 0.5);
    const hy = Math.round((DS - hh) * 0.5);
    const closeW = Math.round(112 * US);
    const closeH = Math.round(30 * US);
    const closeBtn = {
      id: "CLOSE_MODAL", label: "CLOSE",
      x: hx + hw - closeW - Math.round(14 * US),
      y: hy + hh - closeH - Math.round(14 * US),
      w: closeW, h: closeH, enabled: true, active: false
    };
    return { rows, rect: { x: hx, y: hy, w: hw, h: hh }, closeBtn };
  }

  // ---- campaign starmap --------------------------------------------------
  // One card per campaign level (credits/doctrine line + preview units). Pure:
  // level list + ship specs + input in, plain card list out.
  function buildCampaignCards(deps, input) {
    const levels = deps.campaignLevels;
    const shipSpecs = deps.shipSpecs;
    const cards = levels.map(lvl => {
      const isDone = input.state.completedLevels.includes(lvl.id);
      const previewUnits = (lvl.previewArchetypes || []).slice(0, 4).map(archName => {
        const spec = shipSpecs[archName];
        if (!spec) return null;
        return { type: archName, team: 2, hp: spec.hp, maxHp: spec.hp, flags: new Set(spec.flags) };
      }).filter(Boolean);
      return {
        id: lvl.id,
        tag: lvl.tag,
        title: lvl.title,
        desc: lvl.desc,
        creditsText: `T1: ${lvl.t1StartingCredits} ⒸB (+${lvl.t1Income}/turn) // DOCTRINE: ${lvl.aiDoctrine}`,
        isDone,
        isNext: false,
        previewUnits
      };
    });
    // Mark the first not-yet-completed sector (in campaign order) as the
    // "next available" node for distinct starmap styling. Purely visual —
    // every node stays selectable, matching the old level-select screen.
    const nextIdx = cards.findIndex(c => !c.isDone);
    if (nextIdx >= 0) cards[nextIdx].isNext = true;
    return cards;
  }

  // The starmap's clickable geometry: one node per campaign level, connected
  // in campaign order. Node geometry is shared with the renderer (it reads the
  // same nodes/layout from the HUD snapshot), so the hit regions stored here
  // exactly match what is drawn. Pure: cards + input in, plain data out.
  function buildCampaignLayout(input, cards) {
    const DS = input.metrics.displaySize;
    const US = input.metrics.uiScale;
    const layout = computeStarmapLayout(cards, DS, US);
    const buttons = [layout.closeBtn];
    for (let i = 0; i < layout.nodes.length; i++) {
      const node = layout.nodes[i];
      const c = cards[i] || {};
      buttons.push({
        id: "LEVEL_SELECT:" + node.id,
        label: c.title,
        x: node.hitX,
        y: node.hitY,
        w: node.hitW,
        h: node.hitH,
        enabled: true,
        active: c.isDone
      });
    }
    return {
      buttons,
      nodes: layout.nodes,
      layout: {
        mx: layout.mx, my: layout.my, mw: layout.mw, mh: layout.mh,
        hdrH: layout.hdrH, closeBtn: layout.closeBtn
      }
    };
  }

  // ---- endgame -----------------------------------------------------------
  // The endgame model: verdict title + body. Pure: input in, plain model out.
  function buildEndgameModel(input, isVictory) {
    if (isVictory) {
      return {
        isVictory: true,
        title: "SECTOR SECURED // !FLAGSHIP ELIMINATED",
        body: `All hostile Syndicate !flagship command vessels in Sector ${input.state.levelId} have been destroyed in ${input.state.turnNumber} turns.`
      };
    }
    return {
      isVictory: false,
      title: "CRITICAL DEFEAT // !FLAGSHIP LOST",
      body: "All friendly !flagship command vessels have been destroyed. Command locus severed."
    };
  }

  // The endgame panel's two verdict buttons. Pure: modal model + input in,
  // plain button list out.
  function buildEndgameButtons(input, modal) {
    const DS = input.metrics.displaySize;
    const US = input.metrics.uiScale;
    const mw = Math.min(DS - Math.round(36 * US), Math.round(430 * US));
    const mh = Math.round(172 * US);
    const mx = Math.round((DS - mw) * 0.5);
    const my = Math.round((DS - mh) * 0.5);
    const btnW = Math.round(156 * US);
    const btnH = Math.max(24, Math.round(28 * US));
    const gap = Math.round(12 * US);
    const b1X = Math.round(mx + (mw - (btnW * 2 + gap)) * 0.5);
    const b2X = b1X + btnW + gap;
    const btnY = my + mh - btnH - Math.round(16 * US);
    return [
      { id: "ENDGAME_RETRY", label: "REDEPLOY SECTOR", x: b1X, y: btnY, w: btnW, h: btnH, enabled: true, active: !modal.isVictory },
      { id: "ENDGAME_MAP",   label: "SECTOR MAP",      x: b2X, y: btnY, w: btnW, h: btnH, enabled: true, active: Boolean(modal.isVictory) }
    ];
  }

  createHud._register("modals", {
    buildBridgeShopModel,
    buildBridgeShopButtons,
    buildHelpLines,
    buildHelpPanel,
    buildCampaignCards,
    buildCampaignLayout,
    buildEndgameModel,
    buildEndgameButtons
  });
})();
