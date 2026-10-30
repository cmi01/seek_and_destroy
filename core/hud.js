"use strict";

// ============================================================
// HUD — Stateless pure view-model & layout/hitbox calculator for the canvas
// HUD: top bar, telemetry cards, priority banner, intel overlay,
// Bridge / Campaign / Endgame modals, oscilloscope sampling, theme switching &
// warp-anomaly frame effect.
// Privately registered with Game (core/game.js); holds zero module-scoped
// mutable state and exposes zero globals.
// ============================================================
Game._registerModule("hud", (() => {
  function createInitialHudStore() {
    return {
      scopeBuf: null,
      cachedPriorityKey: "",
      cachedPriorityLabel: null,
      cachedHoveredSpotted: false,
      hudState: {
        levelTag: "SECTOR // INITIALIZING",
        minimapLabel: "MINIMAP 32×32 · VIEW 32×32",
        audioReady: false,
        radioActive: false,
        scopeWave: new Float32Array(64),
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
          intelOverlay: null
        }
      }
    };
  }

  function _estimateTelemetryCardHeight(model, inspectMode, US) {
    if (!model || model.kind === "none") return 0;
    const padY = Math.round(6 * US);
    const headerH = Math.max(13, Math.round(14 * US));
    const lineH = Math.max(11, Math.round(12 * US));
    let rows = 2;
    if (model.kind === "unit") {
      if (model.locusTag) rows += 1;
      if (inspectMode && Array.isArray(model.flags)) {
        rows += model.flags.length * 2;
      }
    } else if (Array.isArray(model.lines)) {
      rows += model.lines.length;
    }
    return Math.max(Math.round(44 * US), padY * 2 + headerH + rows * lineH);
  }

  // ----------------------------------------------------------------
  // STARMAP LAYOUT — single deterministic source of truth for the
  // campaign starmap. Both the hit-test layout (syncLayout) and the
  // renderer (uiRenderer._drawCampaignModal) consume the node geometry
  // computed here (the renderer reads it from the HUD snapshot), so the
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

  function createHud(deps) {
    const store = deps.hudStore;
    const _hudState = store.hudState;
    const State = deps.State;
    const MathGrid = deps.MathGrid;
    const Visibility = deps.Visibility;
    const Actions = deps.Actions;
    const Selection = deps.Selection;
    const Rules = deps.Rules;
    const Themes = deps.Themes;
    const GameAudio = deps.GameAudio;
    const getHost = deps.getHost;
    const getCampaignLevels = deps.getCampaignLevels;
    const getShipSpecs = deps.getShipSpecs;

    function _getCanvas() {
      const h = getHost();
      return h ? h.getBattleCanvas() : null;
    }

    function _clearButtonInteraction() {
      if (State.buttonHovered !== null) State.buttonHovered = null;
      if (State.buttonPressed !== null) State.buttonPressed = null;
    }

    function _buildUnitTelemetryModel(unit, coordStr) {
      const effScan = Visibility.getEffectiveScan(unit);
      const inNebula = State.terrain[unit.x] && State.terrain[unit.x][unit.y] === "NEBULA";
      const teamLabel = unit.team === 1 ? "BLUE FLEET [T1]" : "SYNDICATE [T2]";

      let locusTag = "";
      if (unit.team === 1 && unit.flags.has("#capital ship")) {
        const openCells = Actions.getValidWarpCells(unit).length;
        locusTag = `WARP LOCUS [R:6]: ${openCells} VACANT — [SPACE]`;
      }

      const flagDescs = Rules.get ? Rules.get().flagDescriptions : Rules.flagDescriptions;
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

    function _buildTerrainTelemetryModel(gx, gy, coordStr) {
      const isVis = Visibility.isCellVisibleToTeam(gx, gy, 1);
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
      const t = State.terrain[gx] ? State.terrain[gx][gy] : "EMPTY";
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

    return {
      refreshMinimapLabel() {
        const span = State.viewSpan;
        _hudState.minimapLabel = `MINIMAP 32×32 · VIEW ${span}×${span}`;
      },

      isModalOpen() {
        return _hudState.activeModal !== null;
      },

      getActiveModal() {
        return _hudState.activeModal;
      },

      isIntelVisible() {
        return Boolean(_hudState.intelOverlay && _hudState.intelOverlay.visible && _hudState.activeModal === null);
      },

      getPanelRects() {
        return _hudState.panelRects;
      },

      setMinimapLabel(lbl) {
        _hudState.minimapLabel = String(lbl || "MINIMAP 32×32");
      },

      setAudioReady(ready) {
        _hudState.audioReady = Boolean(ready);
      },

      getSnapshot() {
        return _hudState;
      },

      syncLayout() {
        const host = getHost();
        const DS = host ? host.getDisplaySize() : 768;
        const US = (host && host.getUiScale) ? host.getUiScale() : 1;
        const mmSize = (host && host.metrics && host.metrics.minimapSize) ? host.metrics.minimapSize : 120;

        if (_hudState.activeModal === "bridge") {
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
          const cards = Array.isArray(_hudState.bridgeModal.cards) ? _hudState.bridgeModal.cards : [];
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
          State.canvasButtons = buttons;
          _hudState.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null };
          return;
        }

        if (_hudState.activeModal === "campaign") {
          // Starmap: one clickable node per campaign level. Node geometry is
          // computed by the shared _computeStarmapLayout so the hit regions
          // stored here exactly match what uiRenderer draws (it reads the same
          // nodes/layout from the HUD snapshot).
          const cards = Array.isArray(_hudState.campaignModal.cards) ? _hudState.campaignModal.cards : [];
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
          State.canvasButtons = buttons;
          _hudState.campaignModal.nodes = layout.nodes;
          _hudState.campaignModal.layout = {
            mx: layout.mx, my: layout.my, mw: layout.mw, mh: layout.mh,
            hdrH: layout.hdrH, closeBtn: layout.closeBtn
          };
          _hudState.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null };
          return;
        }

        const mmPad = Math.max(8, Math.round(10 * US));
        const mmRect = { x: mmPad, y: DS - mmSize - mmPad, w: mmSize, h: mmSize };

        if (_hudState.activeModal === "endgame") {
          const modal = _hudState.endgameModal;
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
          State.canvasButtons = [
            { id: "ENDGAME_RETRY", label: "REDEPLOY SECTOR", x: b1X, y: btnY, w: btnW, h: btnH, enabled: true, active: !modal.isVictory },
            { id: "ENDGAME_MAP",   label: "SECTOR MAP",      x: b2X, y: btnY, w: btnW, h: btnH, enabled: true, active: Boolean(modal.isVictory) }
          ];
          _hudState.panelRects = { topBar: null, minimap: mmRect, selectedCard: null, hoveredCard: null, intelOverlay: null };
          return;
        }

        const selUnit = Selection.getUnit();
        const isPlayerTurn = State.activeTeam === 1 && !State.gameOver;
        const isCapitalSelected = Boolean(selUnit && selUnit.team === 1 && selUnit.flags.has("#capital ship"));
        const canShieldSelected = Boolean(
          isPlayerTurn &&
          selUnit &&
          selUnit.team === 1 &&
          State.ap > 0 &&
          Actions.canShield(selUnit, { x: selUnit.x, y: selUnit.y })
        );
        const audioMuted = Boolean(State.audioSettings && State.audioSettings.muted);
        const audioReady = Boolean(_hudState.audioReady);
        const audioLabel = !audioReady ? "AUD:OFF" : (audioMuted ? "AUD:MUTE" : "AUD:ON");
        const themeLabel = String(State.theme || "default").toUpperCase();

        const btnH = Math.max(22, Math.round(25 * US));
        const gap = Math.max(5, Math.round(6 * US));
        const padRight = Math.max(8, Math.round(10 * US));
        const topY = Math.max(8, Math.round(10 * US));
        const botY = DS - btnH - Math.max(8, Math.round(10 * US));

        const topDefs = [
          { id: "BRIDGE", label: "[SPC] BRIDGE",      w: Math.round(108 * US), enabled: isPlayerTurn, active: isCapitalSelected },
          { id: "MAP",    label: "SECTOR MAP",        w: Math.round(94 * US),  enabled: true,         active: false },
          { id: "THEME",  label: `THM:${themeLabel}`, w: Math.round(96 * US),  enabled: true,         active: false },
          { id: "AUDIO",  label: audioLabel,          w: Math.round(80 * US),  enabled: true,         active: audioReady && !audioMuted }
        ];

        const botDefs = [
          { id: "SHIELD",   label: "REGEN SHIELD", w: Math.round(108 * US), enabled: canShieldSelected, active: canShieldSelected },
          { id: "END_TURN", label: "END TURN >>",  w: Math.round(98 * US),  enabled: isPlayerTurn,      active: false }
        ];

        const layout = [];
        let curRight = DS - padRight;
        for (let i = topDefs.length - 1; i >= 0; i--) {
          const d = topDefs[i];
          const w = Math.max(58, d.w);
          const x = curRight - w;
          layout.unshift({ id: d.id, label: d.label, x, y: topY, w, h: btnH, enabled: d.enabled, active: d.active });
          curRight = x - gap;
        }
        const topButtonsLeftEdge = layout.length > 0 ? layout[0].x : (DS - padRight);

        let botRight = DS - padRight;
        for (let i = botDefs.length - 1; i >= 0; i--) {
          const d = botDefs[i];
          const w = Math.max(66, d.w);
          const x = botRight - w;
          layout.push({ id: d.id, label: d.label, x, y: botY, w, h: btnH, enabled: d.enabled, active: d.active });
          botRight = x - gap;
        }
        State.canvasButtons = layout;

        const pad = Math.max(8, Math.round(10 * US));
        const leftAvailW = Math.max(160, topButtonsLeftEdge - Math.round(18 * US));
        const barW = Math.max(180, Math.min(Math.round(334 * US), leftAvailW));
        const barH = Math.max(44, Math.round(50 * US));
        const topBarRect = { x: pad, y: pad, w: barW, h: barH };

        const cardW = Math.min(Math.round(308 * US), Math.max(190, DS - (mmRect.x + mmRect.w) - Math.round(24 * US)));
        const cardX = DS - padRight - cardW;
        let nextCardBottom = botY - Math.round(7 * US);
        let selRect = null;
        let hovRect = null;

        if (_hudState.selectedTelemetry && _hudState.selectedTelemetry.kind === "unit") {
          const sh = (_hudState.panelRects.selectedCard && _hudState.panelRects.selectedCard.h)
            ? _hudState.panelRects.selectedCard.h
            : _estimateTelemetryCardHeight(_hudState.selectedTelemetry, State.inspectMode, US);
          const sy = Math.max(Math.round(8 * US), nextCardBottom - sh);
          selRect = { x: cardX, y: sy, w: cardW, h: sh };
          nextCardBottom = sy - Math.round(6 * US);
        }

        const hoverSameAsSelected = Boolean(
          selRect &&
          State.selectedCell &&
          State.hoveredCell &&
          State.hoveredCell.x === State.selectedCell.x &&
          State.hoveredCell.y === State.selectedCell.y
        );
        if (State.hoveredCell && !hoverSameAsSelected && _hudState.hoveredTelemetry && _hudState.hoveredTelemetry.kind !== "none") {
          const hh = (_hudState.panelRects.hoveredCard && _hudState.panelRects.hoveredCard.h)
            ? _hudState.panelRects.hoveredCard.h
            : _estimateTelemetryCardHeight(_hudState.hoveredTelemetry, State.inspectMode, US);
          const hy = Math.max(Math.round(8 * US), nextCardBottom - hh);
          hovRect = { x: cardX, y: hy, w: cardW, h: hh };
        }

        let intelRect = null;
        if (_hudState.intelOverlay && _hudState.intelOverlay.visible) {
          const ix = pad;
          const iy = topBarRect.y + topBarRect.h + Math.round(8 * US);
          const iw = Math.min(DS - pad * 2, Math.round(410 * US));
          const linesCount = Math.max(1, Array.isArray(_hudState.intelOverlay.lines) ? _hudState.intelOverlay.lines.length * 2 : 2);
          const ih = (_hudState.panelRects.intelOverlay && _hudState.panelRects.intelOverlay.h)
            ? _hudState.panelRects.intelOverlay.h
            : (Math.round(38 * US) + linesCount * Math.max(11, Math.round(12 * US)));
          intelRect = { x: ix, y: iy, w: iw, h: ih };
        }

        _hudState.panelRects = {
          topBar: topBarRect,
          minimap: mmRect,
          selectedCard: selRect,
          hoveredCard: hovRect,
          intelOverlay: intelRect
        };
      },

      updateLeftWing() {
        const levels = getCampaignLevels();
        const spec = levels.find(l => l.id === State.levelId) || levels[0];
        _hudState.levelTag = spec.tag;
      },

      updateRightWing() {
        if (!State.hoveredCell) {
          _hudState.hoveredTelemetry = {
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
          const { x, y } = State.hoveredCell;
          const coordStr = `[${String(x).padStart(2, "0")} , ${String(y).padStart(2, "0")}]`;
          const unit = MathGrid.getUnitAt(x, y);
          const spotted = unit && Visibility.isUnitSpottedByTeam(unit, 1);
          if (spotted) {
            _hudState.hoveredTelemetry = _buildUnitTelemetryModel(unit, coordStr);
          } else {
            _hudState.hoveredTelemetry = _buildTerrainTelemetryModel(x, y, coordStr);
          }
        }

        const selUnit = Selection.getUnit();
        if (!selUnit || selUnit.team !== 1) {
          _hudState.selectedTelemetry = {
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
          _hudState.selectedTelemetry = _buildUnitTelemetryModel(selUnit, coordStr);
        }
        this.syncLayout();
      },

      updatePriorityBanner(recomputeAction = true) {
        if (_hudState.activeModal !== null || State.activeTeam !== 1 || !State.hoveredCell) {
          _hudState.priorityBanner.visible = false;
          _hudState.priorityBanner.hoveredSpotted = false;
          store.cachedPriorityKey = "";
          store.cachedPriorityLabel = null;
          store.cachedHoveredSpotted = false;
          return;
        }

        const { x, y } = State.hoveredCell;
        const selUnit = Selection.getUnit();
        const key = `${State.activeTeam}|${selUnit ? selUnit.id : -1}|${selUnit ? selUnit.x : -1},${selUnit ? selUnit.y : -1}|${x},${y}|${State.ap}`;

        if (recomputeAction || key !== store.cachedPriorityKey) {
          store.cachedPriorityKey = key;
          const hoveredUnit = MathGrid.getUnitAt(x, y);
          const hoveredSpotted = Boolean(hoveredUnit && Visibility.isUnitSpottedByTeam(hoveredUnit, 1));
          store.cachedHoveredSpotted = hoveredSpotted;

          let label = null;
          if (selUnit && selUnit.team === 1) {
            const B = { x, y };
            const bothCapAndShoot = Actions.canCapture(selUnit, B) && Actions.canShoot(selUnit, B);
            if (bothCapAndShoot) {
              const vp = MathGrid.getRenderedViewport();
              const lx = (State.mousePx.x / vp.cellPx + vp.viewX) - x;
              const ly = (State.mousePx.y / vp.cellPx + vp.viewY) - y;
              if (lx >= 0 && lx <= 0.45 && ly >= 0 && ly <= 0.45) {
                label = "PRIORITY 2: MARINE BOARDING [1 AP] (HULL: FIRE)";
              } else {
                label = "PRIORITY 3: ENGAGE WEAPONS [1 AP] ('C'/SHIFT: BOARD)";
              }
            } else {
              const act = Actions.getPriorityActionAt(selUnit, x, y);
              if (act === "MOVE") label = "PRIORITY 1: HELM MOVE [1 AP]";
              else if (act === "CAPTURE") label = "PRIORITY 2: MARINE BOARDING [1 AP]";
              else if (act === "SHOOT") label = "PRIORITY 3: ENGAGE WEAPONS [1 AP]";
              else if (act === "SHIELD") label = "PRIORITY 4: REGEN SHIELD [1 AP]";
            }
          }

          if (!label && hoveredSpotted && hoveredUnit.team === 1 && (!selUnit || selUnit.id !== hoveredUnit.id)) {
            label = `SELECT ${hoveredUnit.type.toUpperCase()}`;
          }
          store.cachedPriorityLabel = label;
        }

        _hudState.priorityBanner.hoveredSpotted = store.cachedHoveredSpotted;
        if (store.cachedPriorityLabel) {
          const host = getHost();
          const DS = host ? host.getDisplaySize() : 768;
          const US = (host && host.getUiScale) ? host.getUiScale() : 1;
          const cp = host ? host.getCellPx() : (DS / State.viewSpan);
          const mx = (State.mousePx.x > 0 || State.mousePx.y > 0) ? State.mousePx.x : ((x - State.viewX + 0.5) * cp);
          const my = (State.mousePx.x > 0 || State.mousePx.y > 0) ? State.mousePx.y : ((y - State.viewY + 0.5) * cp);
          _hudState.priorityBanner.visible = true;
          _hudState.priorityBanner.label = store.cachedPriorityLabel;
          _hudState.priorityBanner.x = Math.min(DS - 210 * US, mx + 16 * US);
          _hudState.priorityBanner.y = Math.max(64 * US, my - 24 * US);
        } else {
          _hudState.priorityBanner.visible = false;
        }
      },

      showIntelOverlay(title, lines) {
        _hudState.intelOverlay.visible = true;
        _hudState.intelOverlay.title = String(title || "OPERATIONAL TURN REPORT");
        _hudState.intelOverlay.lines = Array.isArray(lines) ? lines.slice() : [];
        if (_hudState.activeModal === "endgame" && !State.gameOver) {
          _hudState.activeModal = null;
        }
        this.syncLayout();
      },

      hideIntelOverlay() {
        if (_hudState.intelOverlay.visible) {
          _hudState.intelOverlay.visible = false;
          if (_hudState.panelRects) _hudState.panelRects.intelOverlay = null;
          this.syncLayout();
        }
      },

      toggleBridgeModal(forceState = null) {
        if (_hudState.activeModal !== null && _hudState.activeModal !== "bridge") {
          if (forceState === false) return;
          return;
        }
        const isOpen = _hudState.activeModal === "bridge";
        const nextState = forceState !== null ? Boolean(forceState) : !isOpen;

        if (nextState) {
          if (State.activeTeam !== 1 || State.gameOver) { GameAudio.play("ui.invalid"); return; }
          const curSel = Selection.getUnit();
          if (!curSel || curSel.team !== 1 || !curSel.flags.has("#capital ship")) {
            const autoCap = State.units.find(u => u.hp > 0 && u.team === 1 && u.flags.has("!flagship") && u.flags.has("#capital ship"))
              || State.units.find(u => u.hp > 0 && u.team === 1 && u.flags.has("#capital ship"));
            if (autoCap) {
              Selection.select(autoCap);
              this.updateRightWing();
            }
          }
          GameAudio.play("ui.modal.open");
          _clearButtonInteraction();
          _hudState.activeModal = "bridge";
          this.renderBridgeShop();
        } else if (isOpen) {
          GameAudio.play("ui.modal.close");
          _clearButtonInteraction();
          _hudState.activeModal = null;
          this.syncLayout();
        }
      },

      renderBridgeShop(silent = false) {
        const selUnit = Selection.getUnit();
        const isCapitalSelected = Boolean(selUnit && selUnit.team === 1 && selUnit.flags.has("#capital ship"));
        const validCells = isCapitalSelected ? Actions.getValidWarpCells(selUnit) : [];
        const canDeployLocus = isCapitalSelected && validCells.length > 0 && State.ap > 0;

        _hudState.bridgeModal.credits = State.credits[1];
        _hudState.bridgeModal.locusOk = canDeployLocus;

        if (!isCapitalSelected) {
          _hudState.bridgeModal.locusText = "LOCUS OFFLINE: Select a friendly #capital ship on the board first to warp reinforcements!";
        } else if (validCells.length === 0) {
          _hudState.bridgeModal.locusText = `LOCUS OBSTRUCTED: ${selUnit.type} at [${selUnit.x},${selUnit.y}] has 0 vacant R:6 cells!`;
        } else {
          _hudState.bridgeModal.locusText = `ACTIVE LOCUS: ${selUnit.type.toUpperCase()} AT [${selUnit.x},${selUnit.y}] (${validCells.length} VACANT R:6 CELLS READY)`;
        }

        const shipSpecs = getShipSpecs();
        const cards = [];
        Object.entries(shipSpecs).forEach(([shipName, spec]) => {
          if (!spec.flags.includes("buyable")) return;
          const priceOk = Boolean(State.credits[1] >= spec.cost);
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
        _hudState.bridgeModal.cards = cards;
        this.syncLayout();

        const host = getHost();
        if (!silent && host) {
          host.requestRender({ skipBoard: false });
        }
      },

      toggleCampaignModal(forceState = null) {
        const isOpen = _hudState.activeModal === "campaign";
        const nextState = forceState !== null ? Boolean(forceState) : !isOpen;

        if (nextState) {
          GameAudio.play("ui.modal.open");
          _clearButtonInteraction();
          _hudState.activeModal = "campaign";
          this.renderCampaignCards();
        } else if (isOpen) {
          GameAudio.play("ui.modal.close");
          _clearButtonInteraction();
          _hudState.activeModal = State.gameOver ? "endgame" : null;
          this.syncLayout();
        }
      },

      renderCampaignCards(silent = false) {
        const levels = getCampaignLevels();
        const shipSpecs = getShipSpecs();
        const cards = levels.map(lvl => {
          const isDone = State.completedLevels.has(lvl.id);
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
        _hudState.campaignModal.cards = cards;
        this.syncLayout();
        const host = getHost();
        if (!silent && host) {
          host.requestRender({ skipBoard: false });
        }
      },

      showEndgameModal(isVictory) {
        _clearButtonInteraction();
        _hudState.endgameModal.isVictory = Boolean(isVictory);
        if (isVictory) {
          _hudState.endgameModal.title = "SECTOR SECURED // !FLAGSHIP ELIMINATED";
          _hudState.endgameModal.body = `All hostile Syndicate !flagship command vessels in Sector ${State.levelId} have been destroyed in ${State.turnNumber} turns.`;
        } else {
          _hudState.endgameModal.title = "CRITICAL DEFEAT // !FLAGSHIP LOST";
          _hudState.endgameModal.body = "All friendly !flagship command vessels have been destroyed. Command locus severed.";
        }
        _hudState.activeModal = "endgame";
        this.syncLayout();
      },

      hideEndgameModal() {
        if (_hudState.activeModal === "endgame") {
          _clearButtonInteraction();
          _hudState.activeModal = null;
          this.syncLayout();
        }
      },

      sampleOscilloscope(now) {
        const analyser = GameAudio.getAnalyser();
        const radioUntil = GameAudio.getRadioActiveUntil();
        const radioActive = now < (radioUntil || 0);
        _hudState.radioActive = radioActive;
        const wave = _hudState.scopeWave;
        const n = wave.length;

        if (analyser && !store.scopeBuf) store.scopeBuf = new Uint8Array(analyser.fftSize);
        if (analyser && store.scopeBuf) {
          analyser.getByteTimeDomainData(store.scopeBuf);
          const step = Math.max(1, Math.floor(store.scopeBuf.length / n));
          for (let i = 0; i < n; i++) {
            const idx = Math.min(store.scopeBuf.length - 1, i * step);
            wave[i] = (store.scopeBuf[idx] - 128) / 128;
          }
        } else {
          const freq = radioActive ? 0.35 : 0.12;
          const amp = radioActive ? 0.78 : 0.14;
          for (let i = 0; i < n; i++) {
            wave[i] = Math.sin(i * freq + now * 0.012) * amp * Math.sin(now * 0.003 + i * 0.06);
          }
        }
      },

      setTheme(theme) {
        const key = Themes.setActive(theme);
        State.theme = key;
        if (typeof document !== "undefined" && document.body) {
          document.body.setAttribute("data-theme", key);
        }
        GameAudio.setTheme(key);
        this.updateAll();
        if (_hudState.activeModal === "bridge") {
          this.renderBridgeShop();
        } else if (_hudState.activeModal === "campaign") {
          this.renderCampaignCards();
        }
        const host = getHost();
        if (host) {
          host.requestRender({ now: performance.now(), theme: key });
        }
        return key;
      },

      getTheme() {
        return State.theme || "default";
      },

      triggerWarpAnomaly() {
        const canvas = _getCanvas();
        if (!canvas) return;
        canvas.classList.add("warp-anomaly");
        setTimeout(() => canvas.classList.remove("warp-anomaly"), 300);
      },

      updateAll() {
        Selection.sync();
        this.updateLeftWing();
        this.updateRightWing();
        this.updatePriorityBanner(true);
        if (_hudState.activeModal === "bridge") {
          this.renderBridgeShop(true);
        }
        this.syncLayout();
      }
    };
  }

  return {
    createInitialHudStore,
    createHud
  };
})());
