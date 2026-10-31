"use strict";

// ============================================================
// hud.js — job: build the HUD widget model and button list from game state.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("hud", (() => {
  function _estimateTelemetryCardHeight(model, inspectMode, US) {
    if (!model || model.kind === "none") return 0;
    const padY = Math.round(6 * US);
    const headerH = Math.max(16, Math.round(18 * US));
    const lineH = Math.max(15, Math.round(17 * US));
    // Compact card: header + HP row + stats row; flag details in inspect mode.
    let rows = 2;
    if (model.kind === "unit") {
      if (inspectMode) rows += 1 + (model.locusTag ? 1 : 0);
    } else {
      rows += 1 + (Array.isArray(model.lines) ? model.lines.length : 0);
    }
    return Math.max(Math.round(52 * US), padY * 2 + headerH + rows * lineH);
  }

  // ----------------------------------------------------------------
  // STARMAP LAYOUT — single deterministic source of truth for the
  // campaign starmap. Both the hit-test layout (syncLayout) and the
  // starmap renderer consume the node geometry computed here (the
  // renderer reads it from the HUD snapshot), so the
  // clickable regions always match what is drawn. Pure: depends only on
  // the card list and the canvas size.
  // ----------------------------------------------------------------
  function _computeStarmapLayout(cards, DS, US) {
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

  // ---- pure plumbing ------------------------------------------------------
  // Deep copy of a HUD view-model / DTO (plain objects, arrays, Sets and
  // typed arrays) so no live reference ever crosses back to Game's frame.
  function _clone(v) {
    if (v instanceof Set) return new Set(v);
    if (ArrayBuffer.isView(v)) return v.slice();
    if (Array.isArray(v)) return v.map(_clone);
    if (v && typeof v === "object") {
      const out = {};
      const ks = Object.keys(v);
      for (let i = 0; i < ks.length; i++) out[ks[i]] = _clone(v[ks[i]]);
      return out;
    }
    return v;
  }

  // Compose two results: b runs after a. b's view/buttons/theme/selection/
  // cache win; sounds concat; flags OR (renderRequests lists concat).
  function _compose(a, b) {
    if (!a) return b;
    if (!b) return a;
    const fa = a.flags || {};
    const fb = b.flags || {};
    return {
      view: b.view !== undefined ? b.view : a.view,
      buttons: b.buttons !== undefined ? b.buttons : a.buttons,
      theme: b.theme !== undefined ? b.theme : a.theme,
      selection: b.selection !== undefined ? b.selection : a.selection,
      cache: b.cache !== undefined ? b.cache : a.cache,
      sounds: (a.sounds || []).concat(b.sounds || []),
      flags: {
        clearInteraction: Boolean(fa.clearInteraction || fb.clearInteraction),
        renderRequests: (fa.renderRequests || []).concat(fb.renderRequests || [])
      }
    };
  }

  // Add the documented named aliases (telemetry/banner/panelRects) that the
  // result shape exposes alongside `view`.
  function _finalize(r) {
    if (r && r.view) {
      r.telemetry = { hovered: r.view.hoveredTelemetry, selected: r.view.selectedTelemetry };
      r.banner = r.view.priorityBanner;
      r.panelRects = r.view.panelRects;
    }
    return r;
  }

  function _buildUnitTelemetryModel(deps, unit, coordStr) {
    const effScan = deps.effectiveScan(unit);
    const inNebula = deps.terrainAt(unit.x, unit.y) === "NEBULA";
    const teamLabel = unit.team === 1 ? "BLUE FLEET [T1]" : "SYNDICATE [T2]";

    let locusTag = "";
    if (unit.team === 1 && unit.flags.has("#capital ship")) {
      const openCells = deps.validWarpCells(unit).length;
      locusTag = `WARP LOCUS [R:6]: ${openCells} VACANT — [SPACE]`;
    }

    const flagDescs = deps.flagDescriptions;
    const flags = Array.from(unit.flags).filter(f => f !== "buyable").map(flag => {
      let category = "abil";
      if (flag.startsWith("!")) category = "crit";
      else if (flag.startsWith("+")) category = "buff";
      else if (flag.startsWith("-")) category = "exh";
      return {
        flag,
        category,
        desc: (flagDescs && flagDescs[flag]) || ""
      };
    });

    return {
      coordTag: coordStr,
      kind: "unit",
      isHostile: unit.team === 2,
      title: unit.type.toUpperCase(),
      subtitle: `${teamLabel} // ${unit.cost} ⒸB`,
      locusTag,
      hp: unit.hp,
      maxHp: unit.maxHp,
      stats: `MOV:${unit.move}  SCN:${effScan}${inNebula ? "(N)" : ""}  FP:${unit.firepower}  RNG:${unit.range}`,
      flags,
      lines: []
    };
  }

  function _buildTerrainTelemetryModel(deps, gx, gy, coordStr) {
    const isVis = deps.cellVisible(gx, gy);
    if (!isVis) {
      return {
        coordTag: coordStr,
        kind: "terrain",
        isHostile: false,
        title: "UNSCANNED FOG OF WAR",
        subtitle: "Outside friendly sensor envelope",
        locusTag: "",
        hp: 0,
        maxHp: 0,
        stats: "",
        flags: [],
        lines: ["Move a sensor vessel within scan range to unmask."]
      };
    }
    const t = deps.terrainAt(gx, gy);
    if (t === "ASTEROID") {
      return {
        coordTag: coordStr,
        kind: "terrain",
        isHostile: false,
        title: "SOLID ASTEROID CLUSTER",
        subtitle: "Impassable planetoid mass",
        locusTag: "",
        hp: 0,
        maxHp: 0,
        stats: "",
        flags: [],
        lines: ["Blocks helm movement and weapon fire rays."]
      };
    }
    if (t === "NEBULA") {
      return {
        coordTag: coordStr,
        kind: "terrain",
        isHostile: false,
        title: "PURPLE FOG NEBULA",
        subtitle: "Ionized plasma cloud (effectiveScan = 1)",
        locusTag: "",
        hp: 0,
        maxHp: 0,
        stats: "",
        flags: [],
        lines: ["Cloaks occupant unless enemy is within d <= 1.0."]
      };
    }
    return {
      coordTag: coordStr,
      kind: "terrain",
      isHostile: false,
      title: "OPEN DEEP SPACE",
      subtitle: "Clear sector vacuum",
      locusTag: "",
      hp: 0,
      maxHp: 0,
      stats: "",
      flags: [],
      lines: ["Unobstructed movement, fire LOS, and sensors."]
    };
  }

  // ---- the game-owned HUD view-model (created and stored by Game) ---------
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
  function _wrapHelpRows(lines, availW, fontPx) {
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

  function createInitialView() {
    return {
      levelTag: "SECTOR // INITIALIZING",
      audioReady: false,
      hoveredTelemetry: {
        coordTag: "[-- , --]",
        kind: "none",
        isHostile: false,
        title: "AWAITING SENSOR CURSOR...",
        subtitle: "",
        hp: 0,
        maxHp: 0,
        stats: "",
        flags: [],
        lines: []
      },
      selectedTelemetry: {
        coordTag: "[-- , --]",
        kind: "none",
        title: "NO FRIENDLY VESSEL SELECTED",
        subtitle: "Click any Blue Fleet vessel to inspect or issue orders.",
        locusTag: "",
        hp: 0,
        maxHp: 0,
        stats: "",
        flags: []
      },
      priorityBanner: {
        visible: false,
        label: "",
        x: 0,
        y: 0,
        hoveredSpotted: false
      },
      intelOverlay: {
        visible: false,
        title: "OPERATIONAL TURN REPORT",
        lines: []
      },
      activeModal: null,
      menuOpen: false,
      helpModal: {
        title: "HELP",
        lines: [],
        rect: null
      },
      bridgeModal: {
        locusText: "",
        protocolText: "WARP PROTOCOL: Deployed vessels arrive exhausted (ready next turn).",
        locusOk: false,
        credits: 35,
        cards: []
      },
      campaignModal: {
        cards: [],
        nodes: [],
        layout: null
      },
      endgameModal: {
        isVictory: true,
        title: "SECTOR SECURED // VICTORY",
        body: ""
      },
      panelRects: {
        topBar: null,
        minimap: null,
        selectedCard: null,
        hoveredCard: null,
        intelOverlay: null,
        menu: null
      }
    };
  }

  function createHud(deps) {

    // ---- internal ops: (view, input) -> result (see RESULT SHAPE) ----------
    function _syncLayout(view, input) {
      const w = _clone(view);
      const DS = input.metrics.displaySize;
      const US = input.metrics.uiScale;
      const mmSize = input.metrics.minimapSize;

      if (w.activeModal === "bridge") {
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
        const cards = Array.isArray(w.bridgeModal.cards) ? w.bridgeModal.cards : [];
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
        w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
        return { view: w, buttons };
      }

      if (w.activeModal === "campaign") {
        // Starmap: one clickable node per campaign level. Node geometry is
        // computed by the shared _computeStarmapLayout so the hit regions
        // stored here exactly match what the starmap draws (it reads the same
        // nodes/layout from the HUD snapshot).
        const cards = Array.isArray(w.campaignModal.cards) ? w.campaignModal.cards : [];
        const layout = _computeStarmapLayout(cards, DS, US);
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
        w.campaignModal.nodes = layout.nodes;
        w.campaignModal.layout = {
          mx: layout.mx, my: layout.my, mw: layout.mw, mh: layout.mh,
          hdrH: layout.hdrH, closeBtn: layout.closeBtn
        };
        w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
        return { view: w, buttons };
      }

      // HELP — fixed-size canvas panel holding the text that is otherwise
      // hidden from the HUD: controls and the mission briefing.
      if (w.activeModal === "help") {
        const lines = Array.isArray(w.helpModal.lines) ? w.helpModal.lines : [];
        const hw = Math.min(DS - Math.round(36 * US), Math.round(620 * US));
        const lineH = Math.round(24 * US);
        const textPx = Math.max(8, Math.round(15 * US));
        const rows = _wrapHelpRows(lines, hw - Math.round(36 * US), textPx);
        const hh = Math.round(88 * US) + rows.length * lineH;
        const hx = Math.round((DS - hw) * 0.5);
        const hy = Math.round((DS - hh) * 0.5);
        w.helpModal.rows = rows;
        w.helpModal.rect = { x: hx, y: hy, w: hw, h: hh };
        const closeW = Math.round(112 * US);
        const closeH = Math.round(30 * US);
        const closeBtn = {
          id: "CLOSE_MODAL", label: "CLOSE",
          x: hx + hw - closeW - Math.round(14 * US),
          y: hy + hh - closeH - Math.round(14 * US),
          w: closeW, h: closeH, enabled: true, active: false
        };
        w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
        return { view: w, buttons: [closeBtn] };
      }

      const mmPad = Math.round(10 * US);
      const mmRect = { x: mmPad, y: DS - mmSize - mmPad, w: mmSize, h: mmSize };

      if (w.activeModal === "endgame") {
        const modal = w.endgameModal;
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
        const buttons = [
          { id: "ENDGAME_RETRY", label: "REDEPLOY SECTOR", x: b1X, y: btnY, w: btnW, h: btnH, enabled: true, active: !modal.isVictory },
          { id: "ENDGAME_MAP",   label: "SECTOR MAP",      x: b2X, y: btnY, w: btnW, h: btnH, enabled: true, active: Boolean(modal.isVictory) }
        ];
        w.panelRects = { topBar: null, minimap: mmRect, selectedCard: null, hoveredCard: null, intelOverlay: null };
        return { view: w, buttons };
      }

      const selUnit = input.selectedUnit;
      const isPlayerTurn = input.state.activeTeam === 1 && !input.state.gameOver;
      const isCapitalSelected = Boolean(selUnit && selUnit.team === 1 && selUnit.flags.has("#capital ship"));
      const canShieldSelected = Boolean(
        isPlayerTurn &&
        selUnit &&
        selUnit.team === 1 &&
        input.state.ap > 0 &&
        deps.canShield(selUnit, { x: selUnit.x, y: selUnit.y })
      );
      const audioMuted = Boolean(input.state.audioMuted);
      const audioReady = Boolean(w.audioReady);
      const audioLabel = !audioReady ? "AUDIO: OFF" : (audioMuted ? "AUDIO: MUTE" : "AUDIO: ON");
      const themeLabel = String(input.state.theme || "default").toUpperCase();

      const btnH = Math.round(30 * US);
      const gap = Math.round(6 * US);
      const padRight = Math.round(10 * US);
      const topY = Math.round(10 * US);
      const botY = DS - btnH - Math.round(10 * US);

      // The HUD is a set of fixed-size canvas objects in the 768 design grid,
      // scaled uniformly with the canvas: two buttons top-right (reinforce +
      // menu), one bottom-right (end turn), everything else in the dropdown.
      const topDefs = [
        { id: "REINFORCEMENTS", label: "REINFORCEMENTS", w: Math.round(156 * US), enabled: isPlayerTurn, active: false },
        { id: "MENU",           label: w.menuOpen ? "MENU ^" : "MENU v",          w: Math.round(80 * US), enabled: true,         active: w.menuOpen }
      ];

      const botDefs = [
        { id: "END_TURN", label: "END TURN", w: Math.round(112 * US), enabled: isPlayerTurn, active: false }
      ];

      const layout = [];
      let curRight = DS - padRight;
      for (let i = topDefs.length - 1; i >= 0; i--) {
        const d = topDefs[i];
        const bw = d.w;
        const x = curRight - bw;
        layout.unshift({ id: d.id, label: d.label, x, y: topY, w: bw, h: btnH, enabled: d.enabled, active: d.active });
        curRight = x - gap;
      }
      const topButtonsLeftEdge = layout.length > 0 ? layout[0].x : (DS - padRight);

      // Dropdown menu hanging under the MENU button (fixed-size rows).
      let menuRect = null;
      if (w.menuOpen) {
        const itemW = Math.round(168 * US);
        const itemH = Math.round(30 * US);
        const itemGap = Math.round(2 * US);
        const menuX = DS - padRight - itemW;
        const menuY = topY + btnH + Math.round(4 * US);
        const items = [
          { id: "MENU_MAP",    label: "SECTOR MAP", enabled: true, active: false },
          { id: "MENU_THEME",  label: "THEME: " + themeLabel, enabled: true, active: false },
          { id: "MENU_AUDIO",  label: audioLabel, enabled: true, active: audioReady && !audioMuted },
          { id: "MENU_SHIELD", label: "REGEN SHIELD", enabled: canShieldSelected, active: canShieldSelected },
          { id: "MENU_HELP",   label: "HELP", enabled: true, active: false }
        ];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          layout.push({ id: it.id, label: it.label, x: menuX, y: menuY + i * (itemH + itemGap), w: itemW, h: itemH, enabled: it.enabled, active: it.active });
        }
        menuRect = {
          x: menuX - Math.round(5 * US),
          y: menuY - Math.round(5 * US),
          w: itemW + Math.round(10 * US),
          h: items.length * itemH + (items.length - 1) * itemGap + Math.round(10 * US)
        };
      }

      let botRight = DS - padRight;
      for (let i = botDefs.length - 1; i >= 0; i--) {
        const d = botDefs[i];
        const bw = d.w;
        const x = botRight - bw;
        layout.push({ id: d.id, label: d.label, x, y: botY, w: bw, h: btnH, enabled: d.enabled, active: d.active });
        botRight = x - gap;
      }
      const buttons = layout;

      const pad = Math.round(10 * US);
      const leftAvailW = Math.max(Math.round(160 * US), topButtonsLeftEdge - Math.round(18 * US));
      const barW = Math.min(Math.round(340 * US), leftAvailW);
      const barH = Math.round(46 * US);
      const topBarRect = { x: pad, y: pad, w: barW, h: barH };

      const cardW = Math.min(Math.round(308 * US), Math.max(Math.round(190 * US), DS - (mmRect.x + mmRect.w) - Math.round(24 * US)));
      const cardX = DS - padRight - cardW;
      let nextCardBottom = botY - Math.round(7 * US);
      let selRect = null;
      let hovRect = null;

      if (w.selectedTelemetry && w.selectedTelemetry.kind === "unit") {
        const sh = (w.panelRects.selectedCard && w.panelRects.selectedCard.h)
          ? w.panelRects.selectedCard.h
          : _estimateTelemetryCardHeight(w.selectedTelemetry, input.state.inspectMode, US);
        const sy = Math.max(Math.round(8 * US), nextCardBottom - sh);
        selRect = { x: cardX, y: sy, w: cardW, h: sh };
        nextCardBottom = sy - Math.round(6 * US);
      }

      const hoverSameAsSelected = Boolean(
        selRect &&
        input.state.selectedCell &&
        input.state.hoveredCell &&
        input.state.hoveredCell.x === input.state.selectedCell.x &&
        input.state.hoveredCell.y === input.state.selectedCell.y
      );
      if (input.state.inspectMode && input.state.hoveredCell && !hoverSameAsSelected && w.hoveredTelemetry && w.hoveredTelemetry.kind !== "none") {
        const hh = (w.panelRects.hoveredCard && w.panelRects.hoveredCard.h)
          ? w.panelRects.hoveredCard.h
          : _estimateTelemetryCardHeight(w.hoveredTelemetry, input.state.inspectMode, US);
        const hy = Math.max(Math.round(8 * US), nextCardBottom - hh);
        hovRect = { x: cardX, y: hy, w: cardW, h: hh };
      }

      let intelRect = null;
      if (w.intelOverlay && w.intelOverlay.visible) {
        const ix = pad;
        const iy = topBarRect.y + topBarRect.h + Math.round(8 * US);
        const iw = Math.min(DS - pad * 2, Math.round(410 * US));
        const linesCount = Math.max(1, Array.isArray(w.intelOverlay.lines) ? w.intelOverlay.lines.length * 2 : 2);
        const ih = (w.panelRects.intelOverlay && w.panelRects.intelOverlay.h)
          ? w.panelRects.intelOverlay.h
          : (Math.round(38 * US) + linesCount * Math.max(11, Math.round(12 * US)));
        intelRect = { x: ix, y: iy, w: iw, h: ih };
      }

      w.panelRects = {
        topBar: topBarRect,
        minimap: mmRect,
        selectedCard: selRect,
        hoveredCard: input.state.inspectMode ? hovRect : null,
        intelOverlay: intelRect,
        menu: menuRect
      };
      return { view: w, buttons };
    }

    function _updateLeftWing(view, input) {
      const w = _clone(view);
      const levels = deps.campaignLevels;
      const spec = levels.find(l => l.id === input.state.levelId) || levels[0];
      w.levelTag = spec.tag;
      return { view: w };
    }

    function _updateRightWing(view, input) {
      const w = _clone(view);
      if (!input.state.hoveredCell) {
        w.hoveredTelemetry = {
          coordTag: "[-- , --]",
          kind: "none",
          isHostile: false,
          title: "AWAITING SENSOR CURSOR...",
          subtitle: "",
          hp: 0,
          maxHp: 0,
          stats: "",
          flags: [],
          lines: []
        };
      } else {
        const { x, y } = input.state.hoveredCell;
        const coordStr = `[${String(x).padStart(2, "0")} , ${String(y).padStart(2, "0")}]`;
        const unit = deps.getUnitAt(x, y);
        const spotted = unit && deps.isSpotted(unit);
        if (spotted) {
          w.hoveredTelemetry = _buildUnitTelemetryModel(deps, unit, coordStr);
        } else {
          w.hoveredTelemetry = _buildTerrainTelemetryModel(deps, x, y, coordStr);
        }
      }

      const selUnit = input.selectedUnit;
      if (!selUnit || selUnit.team !== 1) {
        w.selectedTelemetry = {
          coordTag: "[-- , --]",
          kind: "none",
          title: "NO FRIENDLY VESSEL SELECTED",
          subtitle: "Click any Blue Fleet vessel to inspect or issue orders.",
          locusTag: "",
          hp: 0,
          maxHp: 0,
          stats: "",
          flags: []
        };
      } else {
        const coordStr = `[${String(selUnit.x).padStart(2, "0")} , ${String(selUnit.y).padStart(2, "0")}]`;
        w.selectedTelemetry = _buildUnitTelemetryModel(deps, selUnit, coordStr);
      }
      return _compose({ view: w }, _syncLayout(w, input));
    }

    function _updatePriorityBanner(view, input, recomputeAction) {
      const w = _clone(view);
      const cache = {
        priorityKey: input.cache ? input.cache.priorityKey : "",
        priorityLabel: input.cache ? input.cache.priorityLabel : null,
        hoveredSpotted: input.cache ? input.cache.hoveredSpotted : false
      };
      const hoveredCell = input.state.hoveredCell;
      if (w.activeModal !== null || input.state.activeTeam !== 1 || !hoveredCell) {
        w.priorityBanner.visible = false;
        w.priorityBanner.hoveredSpotted = false;
        cache.priorityKey = "";
        cache.priorityLabel = null;
        cache.hoveredSpotted = false;
        // The floating priority hint stays computed for the cache but is never
        // shown (HUD declutter: board badges carry the action affordances).
        w.priorityBanner.visible = false;
        return { view: w, banner: w.priorityBanner, cache };
      }

      const { x, y } = hoveredCell;
      const selUnit = input.selectedUnit;
      const key = `${input.state.activeTeam}|${selUnit ? selUnit.id : -1}|${selUnit ? selUnit.x : -1},${selUnit ? selUnit.y : -1}|${x},${y}|${input.state.ap}`;

      if (recomputeAction || key !== cache.priorityKey) {
        cache.priorityKey = key;
        const hoveredUnit = deps.getUnitAt(x, y);
        const hoveredSpotted = Boolean(hoveredUnit && deps.isSpotted(hoveredUnit));
        cache.hoveredSpotted = hoveredSpotted;

        let label = null;
        if (selUnit && selUnit.team === 1) {
          const B = { x, y };
          const bothCapAndShoot = deps.canCapture(selUnit, B) && deps.canShoot(selUnit, B);
          if (bothCapAndShoot) {
            const vp = deps.renderedViewport();
            const lx = (input.state.mousePx.x / vp.cellPx + vp.viewX) - x;
            const ly = (input.state.mousePx.y / vp.cellPx + vp.viewY) - y;
            if (lx >= 0 && lx <= 0.45 && ly >= 0 && ly <= 0.45) {
              label = "PRIORITY 2: MARINE BOARDING [1 AP] (HULL: FIRE)";
            } else {
              label = "PRIORITY 3: ENGAGE WEAPONS [1 AP] ('C'/SHIFT: BOARD)";
            }
          } else {
            const act = deps.priorityAction(selUnit, x, y);
            if (act === "MOVE") label = "PRIORITY 1: HELM MOVE [1 AP]";
            else if (act === "CAPTURE") label = "PRIORITY 2: MARINE BOARDING [1 AP]";
            else if (act === "SHOOT") label = "PRIORITY 3: ENGAGE WEAPONS [1 AP]";
            else if (act === "SHIELD") label = "PRIORITY 4: REGEN SHIELD [1 AP]";
          }
        }

        if (!label && hoveredSpotted && hoveredUnit.team === 1 && (!selUnit || selUnit.id !== hoveredUnit.id)) {
          label = `SELECT ${hoveredUnit.type.toUpperCase()}`;
        }
        cache.priorityLabel = label;
      }

      w.priorityBanner.hoveredSpotted = cache.hoveredSpotted;
      if (cache.priorityLabel) {
        const DS = input.metrics.displaySize;
        const US = input.metrics.uiScale;
        const cp = input.metrics.cellPx;
        const mx = (input.state.mousePx.x > 0 || input.state.mousePx.y > 0) ? input.state.mousePx.x : ((x - input.state.viewX + 0.5) * cp);
        const my = (input.state.mousePx.x > 0 || input.state.mousePx.y > 0) ? input.state.mousePx.y : ((y - input.state.viewY + 0.5) * cp);
        w.priorityBanner.visible = true;
        w.priorityBanner.label = cache.priorityLabel;
        w.priorityBanner.x = Math.min(DS - 210 * US, mx + 16 * US);
        w.priorityBanner.y = Math.max(64 * US, my - 24 * US);
      } else {
        w.priorityBanner.visible = false;
      }
      // The floating priority hint stays computed for the cache but is never
      // shown (HUD declutter: board badges carry the action affordances).
      w.priorityBanner.visible = false;
      return { view: w, banner: w.priorityBanner, cache };
    }

    function _showIntelOverlay(view, input, title, lines) {
      const w = _clone(view);
      w.intelOverlay.visible = true;
      w.intelOverlay.title = String(title || "OPERATIONAL TURN REPORT");
      w.intelOverlay.lines = Array.isArray(lines) ? lines.slice() : [];
      if (w.activeModal === "endgame" && !input.state.gameOver) {
        w.activeModal = null;
      }
      return _syncLayout(w, input);
    }

    function _hideIntelOverlay(view, input) {
      const w = _clone(view);
      if (w.intelOverlay.visible) {
        w.intelOverlay.visible = false;
        if (w.panelRects) w.panelRects.intelOverlay = null;
        return _syncLayout(w, input);
      }
      return { view: w };
    }

    function _toggleBridgeModal(view, input, forceState) {
      const w = _clone(view);
      if (w.activeModal !== null && w.activeModal !== "bridge") {
        return { view: w };
      }
      const isOpen = w.activeModal === "bridge";
      const nextState = forceState !== null ? Boolean(forceState) : !isOpen;

      if (nextState) {
        if (input.state.activeTeam !== 1 || input.state.gameOver) {
          return { view: w, sounds: [{ kind: "ui.invalid", payload: {} }] };
        }
        let effInput = input;
        let r = { view: w };
        const curSel = input.selectedUnit;
        if (!curSel || curSel.team !== 1 || !curSel.flags.has("#capital ship")) {
          const autoCap = input.units.find(u => u.hp > 0 && u.team === 1 && u.flags.has("!flagship") && u.flags.has("#capital ship"))
            || input.units.find(u => u.hp > 0 && u.team === 1 && u.flags.has("#capital ship"));
          if (autoCap) {
            // Game applies the selection from the returned `selection` data;
            // the recomputed telemetry below is computed as-if already applied.
            r.selection = { unitId: autoCap.id };
            effInput = Object.assign({}, input, { selectedUnit: autoCap });
            r = _compose(r, _updateRightWing(r.view, effInput));
          }
        }
        r.view.activeModal = "bridge";
        r = _compose(r, {
          sounds: [{ kind: "ui.modal.open", payload: {} }],
          flags: { clearInteraction: true }
        });
        return _compose(r, _renderBridgeShop(r.view, effInput, false));
      } else if (isOpen) {
        w.activeModal = null;
        return _compose({
          view: w,
          sounds: [{ kind: "ui.modal.close", payload: {} }],
          flags: { clearInteraction: true }
        }, _syncLayout(w, input));
      }
      return { view: w };
    }

    function _renderBridgeShop(view, input, silent) {
      const w = _clone(view);
      const selUnit = input.selectedUnit;
      const isCapitalSelected = Boolean(selUnit && selUnit.team === 1 && selUnit.flags.has("#capital ship"));
      const validCells = isCapitalSelected ? deps.validWarpCells(selUnit) : [];
      const canDeployLocus = isCapitalSelected && validCells.length > 0 && input.state.ap > 0;

      w.bridgeModal.credits = input.state.credits[1];
      w.bridgeModal.locusOk = canDeployLocus;

      if (!isCapitalSelected) {
        w.bridgeModal.locusText = "LOCUS OFFLINE: Select a friendly #capital ship on the board first to warp reinforcements!";
      } else if (validCells.length === 0) {
        w.bridgeModal.locusText = `LOCUS OBSTRUCTED: ${selUnit.type} at [${selUnit.x},${selUnit.y}] has 0 vacant R:6 cells!`;
      } else {
        w.bridgeModal.locusText = `ACTIVE LOCUS: ${selUnit.type.toUpperCase()} AT [${selUnit.x},${selUnit.y}] (${validCells.length} VACANT R:6 CELLS READY)`;
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
      w.bridgeModal.cards = cards;
      const r = _syncLayout(w, input);
      if (!silent) {
        r.flags = Object.assign({}, r.flags, { renderRequests: [{ skipBoard: false }] });
      }
      return r;
    }

    function _toggleCampaignModal(view, input, forceState) {
      const w = _clone(view);
      const isOpen = w.activeModal === "campaign";
      const nextState = forceState !== null ? Boolean(forceState) : !isOpen;

      if (nextState) {
        w.activeModal = "campaign";
        return _compose({
          view: w,
          sounds: [{ kind: "ui.modal.open", payload: {} }],
          flags: { clearInteraction: true }
        }, _renderCampaignCards(w, input, false));
      } else if (isOpen) {
        w.activeModal = input.state.gameOver ? "endgame" : null;
        return _compose({
          view: w,
          sounds: [{ kind: "ui.modal.close", payload: {} }],
          flags: { clearInteraction: true }
        }, _syncLayout(w, input));
      }
      return { view: w };
    }

    function _renderCampaignCards(view, input, silent) {
      const w = _clone(view);
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
      w.campaignModal.cards = cards;
      const r = _syncLayout(w, input);
      if (!silent) {
        r.flags = Object.assign({}, r.flags, { renderRequests: [{ skipBoard: false }] });
      }
      return r;
    }

    function _showEndgameModal(view, input, isVictory) {
      const w = _clone(view);
      w.endgameModal.isVictory = Boolean(isVictory);
      if (isVictory) {
        w.endgameModal.title = "SECTOR SECURED // !FLAGSHIP ELIMINATED";
        w.endgameModal.body = `All hostile Syndicate !flagship command vessels in Sector ${input.state.levelId} have been destroyed in ${input.state.turnNumber} turns.`;
      } else {
        w.endgameModal.title = "CRITICAL DEFEAT // !FLAGSHIP LOST";
        w.endgameModal.body = "All friendly !flagship command vessels have been destroyed. Command locus severed.";
      }
      w.activeModal = "endgame";
      return _compose({ view: w, flags: { clearInteraction: true } }, _syncLayout(w, input));
    }

    function _hideEndgameModal(view, input) {
      const w = _clone(view);
      if (w.activeModal === "endgame") {
        w.activeModal = null;
        return _compose({ view: w, flags: { clearInteraction: true } }, _syncLayout(w, input));
      }
      return { view: w };
    }

    // Theme switch: recomputes the whole view and RETURNS the requested
    // theme key as data; Game applies the theme state field / body attribute /
    // audio theme command.
    function _applyTheme(view, input, key) {
      let r = _updateAll(view, input);
      if (r.view.activeModal === "bridge") {
        r = _compose(r, _renderBridgeShop(r.view, input, false));
      } else if (r.view.activeModal === "campaign") {
        r = _compose(r, _renderCampaignCards(r.view, input, false));
      }
      r.theme = key;
      const reqs = (r.flags && r.flags.renderRequests) ? r.flags.renderRequests : [];
      r.flags = Object.assign({}, r.flags, { renderRequests: reqs.concat([{ now: input.now, theme: key }]) });
      return r;
    }

    function _updateAll(view, input) {
      let r = _compose({ selection: { sync: true } }, _updateLeftWing(view, input));
      r = _compose(r, _updateRightWing(r.view, input));
      r = _compose(r, _updatePriorityBanner(r.view, input, true));
      if (r.view.activeModal === "bridge") {
        r = _compose(r, _renderBridgeShop(r.view, input, true));
      }
      r = _compose(r, _syncLayout(r.view, input));
      return r;
    }

    // ---- public surface: pure functions, plain data out -------------------
    return {
      createInitialView,

      // deep-copied DTOs — never the live view (which reaches Graphics
      // through the render frame)
      snapshot(view) { return _clone(view); },
      panelRects(view) { return _clone(view.panelRects); },

      isModalOpen(view) { return view.activeModal !== null; },
      getActiveModal(view) { return view.activeModal; },
      isIntelVisible(view) {
        return Boolean(view.intelOverlay && view.intelOverlay.visible && view.activeModal === null);
      },

      setAudioReady(view, input, ready) {
        const w = _clone(view);
        w.audioReady = Boolean(ready);
        return _finalize({ view: w });
      },

      syncLayout(view, input) { return _finalize(_syncLayout(view, input)); },
      updateLeftWing(view, input) { return _finalize(_updateLeftWing(view, input)); },
      updateRightWing(view, input) { return _finalize(_updateRightWing(view, input)); },
      updatePriorityBanner(view, input, recomputeAction = true) {
        return _finalize(_updatePriorityBanner(view, input, recomputeAction));
      },

      showIntelOverlay(view, input, title, lines) {
        return _finalize(_showIntelOverlay(view, input, title, lines));
      },
      hideIntelOverlay(view, input) { return _finalize(_hideIntelOverlay(view, input)); },

      toggleBridgeModal(view, input, forceState = null) {
        return _finalize(_toggleBridgeModal(view, input, forceState));
      },
      renderBridgeShop(view, input, silent = false) {
        return _finalize(_renderBridgeShop(view, input, silent));
      },
      toggleCampaignModal(view, input, forceState = null) {
        return _finalize(_toggleCampaignModal(view, input, forceState));
      },
      toggleMenu(view, input, forceState = null) {
        const w = _clone(view);
        w.menuOpen = forceState !== null ? Boolean(forceState) : !w.menuOpen;
        return _finalize(_syncLayout(w, input));
      },
      isMenuOpen(view) { return Boolean(view.menuOpen); },
      toggleHelpModal(view, input, forceState = null) {
        const w = _clone(view);
        const isOpen = w.activeModal === "help";
        const next = forceState !== null ? Boolean(forceState) : !isOpen;
        if (next && w.activeModal !== null && w.activeModal !== "help") {
          return _finalize({ view: w });
        }
        if (next) {
          w.activeModal = "help";
          w.menuOpen = false;
          const levels = deps.campaignLevels;
          const spec = levels.find(l => l.id === input.state.levelId) || levels[0];
          const lines = ["#CONTROLS"];
          for (let i = 0; i < HELP_CONTROLS.length; i++) lines.push(HELP_CONTROLS[i]);
          if (spec && Array.isArray(spec.initialIntel)) {
            lines.push("#MISSION BRIEFING");
            for (let i = 0; i < spec.initialIntel.length; i++) lines.push(spec.initialIntel[i]);
          }
          w.helpModal = { title: "HELP // " + (spec ? spec.tag : "SECTOR"), lines, rect: null };
          return _finalize(_compose({
            view: w,
            sounds: [{ kind: "ui.modal.open", payload: {} }],
            flags: { clearInteraction: true }
          }, _syncLayout(w, input)));
        }
        if (isOpen) {
          w.activeModal = null;
          return _finalize(_compose({
            view: w,
            sounds: [{ kind: "ui.modal.close", payload: {} }],
            flags: { clearInteraction: true }
          }, _syncLayout(w, input)));
        }
        return _finalize({ view: w });
      },
      renderCampaignCards(view, input, silent = false) {
        return _finalize(_renderCampaignCards(view, input, silent));
      },

      showEndgameModal(view, input, isVictory) {
        return _finalize(_showEndgameModal(view, input, isVictory));
      },
      hideEndgameModal(view, input) { return _finalize(_hideEndgameModal(view, input)); },

      applyTheme(view, input, key) { return _finalize(_applyTheme(view, input, key)); },
      updateAll(view, input) { return _finalize(_updateAll(view, input)); }
    };
  }

  return {
    createInitialView,
    createHud
  };
})());
