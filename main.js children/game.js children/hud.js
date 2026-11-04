"use strict";

// ============================================================
// hud.js — job: compose the HUD widget model and button list from per-domain pure children.
// Owner: game.js. Holds no state.
// ============================================================

// ONE composing function. Its direct children are classic scripts loaded by
// the central loader (the shell) before this file's function is ever called, so
// each child's single pure function is visible here by name — no load
// handshake, no registrar, no transient globals in this file.
//
// RESULT SHAPE — every operation takes (view, input) and returns plain data:
//   { view?, buttons?, theme?, selection?, cache?, sounds?, flags? }
// where flags = { clearInteraction, renderRequests }. Game owns the view and
// applies each result; nothing here holds anything between calls.

// ---- private plumbing ------------------------------------------------------
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

// The boot-time view: the empty HUD model Game holds until its first update.
// Pure: no arguments, a fresh plain object out.
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
    // M4: the station storefront (replaces the bridge shop as the general
    // storefront; the bridge modal keeps the in-battle reinforcements view).
    stationModal: {
      title: "STATION",
      subtitle: "",
      walletText: "",
      tab: null,
      tabs: [],
      rows: [],
      panel: null,
      note: ""
    },
    deployModal: {
      title: "DEPLOYMENT",
      capText: "",
      capLines: [],
      rows: [],
      panel: null
    },
    endgameModal: {
      isVictory: true,
      title: "SECTOR SECURED // VICTORY",
      body: ""
    },
    // M3: the campaign-map HUD model and the open hailing shell's encounter
    // (plain data; the shell content is rebuilt from it each update).
    mapHud: null,
    hailEncounter: null,
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

// The composing function: binds Game's query deps once and returns the pure
// per-operation HUD surface.
const createHud = function (deps) {

  // ---- internal ops: (view, input) -> result (see RESULT SHAPE) ----------
  function _syncLayout(view, input) {
    const w = _clone(view);
    const DS = input.metrics.displaySize;

    if (w.activeModal === "bridge") {
      const shop = buildReserveButtons(input, w.bridgeModal);
      w.bridgeModal.layout = shop.layout;
      w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
      return { view: w, buttons: shop.buttons };
    }

    if (w.activeModal === "campaign") {
      // Starmap: one clickable node per campaign level. Node geometry is
      // computed by the shared starmap layout so the hit regions stored
      // here exactly match what the starmap draws (it reads the same
      // nodes/layout from the HUD snapshot).
      const cards = Array.isArray(w.campaignModal.cards) ? w.campaignModal.cards : [];
      const lay = buildCampaignLayout(input, cards);
      w.campaignModal.nodes = lay.nodes;
      w.campaignModal.layout = lay.layout;
      w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
      return { view: w, buttons: lay.buttons };
    }

    if (w.activeModal === "deploy") {
      const m = buildDeploymentModel(deps, input);
      w.deployModal.title = m.title;
      w.deployModal.capText = m.capText;
      w.deployModal.capLines = m.capLines;
      w.deployModal.rows = m.rows;
      w.deployModal.wallet = m.wallet;
      const built = buildDeploymentButtons(input, m);
      w.deployModal.panel = built.panel;
      w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
      return { view: w, buttons: built.buttons };
    }

    // HELP — fixed-size canvas panel holding the text that is otherwise
    // hidden from the HUD: controls and the mission briefing.
    if (w.activeModal === "help") {
      const lines = Array.isArray(w.helpModal.lines) ? w.helpModal.lines : [];
      const panel = buildHelpPanel(input, lines);
      w.helpModal.rows = panel.rows;
      w.helpModal.rect = panel.rect;
      w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
      return { view: w, buttons: [panel.closeBtn] };
    }

    // M4 station storefront: rows + posted quotes arrive as plain data
    // (input.state.station); this layer only lays them out.
    if (w.activeModal === "station") {
      const m = buildStationModel((input.state && input.state.station) || {}, { metrics: input.metrics });
      w.stationModal.title = m.title;
      w.stationModal.subtitle = m.subtitle;
      w.stationModal.walletText = m.walletText;
      w.stationModal.tab = m.tab;
      w.stationModal.tabs = m.tabs;
      w.stationModal.rows = m.rows;
      w.stationModal.panel = m.panel;
      w.stationModal.note = m.note;
      w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
      return { view: w, buttons: m.buttons };
    }

    const mm = buildMinimapModel(input);
    const mmRect = mm.rect;

    if (w.activeModal === "endgame") {
      const built = buildEndgameButtons(input, w.endgameModal);
      w.endgameModal.panel = built.panel;
      w.endgameModal.lines = built.lines;
      w.endgameModal.lineH = built.lineH;
      w.panelRects = { topBar: null, minimap: mmRect, selectedCard: null, hoveredCard: null, intelOverlay: null };
      return { view: w, buttons: built.buttons };
    }

    // Main HUD chrome: edge buttons + top bar, the dropdown menu, the
    // right-edge telemetry cards and the intel panel under the top bar.
    const chrome = buildTopBarChrome(input, w.menuOpen);
    const menu = buildMenuModel(deps, input, w, {
      edgeX: DS - chrome.padRight,
      belowY: chrome.topY + chrome.btnH
    });
    const cards = buildTelemetryCardRects(input, w, chrome, mmRect);
    const intelRect = buildIntelRect(input, w, chrome.topBarRect);

    w.panelRects = {
      topBar: chrome.topBarRect,
      minimap: mmRect,
      selectedCard: cards.selectedCard,
      hoveredCard: input.state.inspectMode ? cards.hoveredCard : null,
      intelOverlay: intelRect,
      menu: menu.menuRect
    };
    return { view: w, buttons: chrome.topButtons.concat(menu.buttons, chrome.bottomButtons, cards.weaponButtons || []) };
  }

  // ---- M3 map HUD + hailing shell --------------------------------------
  // Rebuilds the map HUD model (map status line + hailing shell geometry)
  // from the live map section. The shell content comes from the parent's
  // other child, injected as plain data (hail: the dialogue model built
  // from the stored encounter).
  function _updateMapHud(view, input, mapState, extra) {
    const w = _clone(view);
    const d = (extra && typeof extra === "object") ? Object.assign({}, extra) : {};
    d.metrics = input.metrics;
    // M6(c): the open shell carries the full panel (voice line + Q11
    // options) when the parent supplied a dialogue model; the M3 shell is
    // the fallback for encounters without one.
    d.hail = w.hailEncounter
      ? (w.hailDialogue ? buildHailPanel(w.hailEncounter, w.hailDialogue) : buildHailModel(w.hailEncounter))
      : null;
    w.mapHud = buildMapHudModel(mapState, d);
    if (w.mapHud && w.mapHud.levelTag) w.levelTag = w.mapHud.levelTag;
    const r = _compose({ view: w }, _syncLayout(w, input));
    if (r.view.mapHud && r.view.mapHud.hail && Array.isArray(r.view.mapHud.hail.buttons)) {
      r.buttons = (r.buttons || []).concat(r.view.mapHud.hail.buttons);
    }
    if (r.view.mapHud && r.view.mapHud.station && Array.isArray(r.view.mapHud.station.buttons)) {
      r.buttons = (r.buttons || []).concat(r.view.mapHud.station.buttons);
    }
    return _finalize(r);
  }

  function _updateLeftWing(view, input) {
    const w = _clone(view);
    w.levelTag = buildLevelTag(deps, input);
    w.wallet = (input.state && typeof input.state.wallet === "number") ? input.state.wallet : 0;
    return { view: w };
  }

  function _updateRightWing(view, input) {
    const w = _clone(view);
    const models = buildTelemetryModels(deps, input);
    w.hoveredTelemetry = models.hoveredTelemetry;
    w.selectedTelemetry = models.selectedTelemetry;
    return _compose({ view: w }, _syncLayout(w, input));
  }

  function _updatePriorityBanner(view, input, recomputeAction) {
    const w = _clone(view);
    const r = buildPriorityBanner(deps, input, w, input.cache, recomputeAction);
    w.priorityBanner = r.banner;
    return { view: w, banner: r.banner, cache: r.cache };
  }

  function _showIntelOverlay(view, input, title, lines) {
    const w = _clone(view);
    const m = buildIntelModel(title, lines);
    w.intelOverlay.visible = m.visible;
    w.intelOverlay.title = m.title;
    w.intelOverlay.lines = m.lines;
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

  function _toggleStationModal(view, input, forceState) {
    const w = _clone(view);
    const isOpen = w.activeModal === "station";
    const nextState = forceState !== null ? Boolean(forceState) : !isOpen;
    if (nextState) {
      if (!(input.state && input.state.station && input.state.station.open)) {
        return { view: w, sounds: [{ kind: "ui.invalid", payload: {} }] };
      }
      w.activeModal = "station";
      return _compose({
        view: w,
        sounds: isOpen ? [] : [{ kind: "ui.modal.open", payload: {} }],
        flags: { clearInteraction: true }
      }, _syncLayout(w, input));
    }
    if (isOpen) {
      w.activeModal = null;
      return _compose({
        view: w,
        sounds: [{ kind: "ui.modal.close", payload: {} }],
        flags: { clearInteraction: true }
      }, _syncLayout(w, input));
    }
    return { view: w };
  }

  function _toggleDeployModal(view, input, forceState) {
    const w = _clone(view);
    const isOpen = w.activeModal === "deploy";
    const nextState = forceState !== null ? Boolean(forceState) : !isOpen;
    if (nextState) {
      w.activeModal = "deploy";
      return _compose({
        view: w,
        sounds: isOpen ? [] : [{ kind: "ui.modal.open", payload: {} }],
        flags: { clearInteraction: true }
      }, _syncLayout(w, input));
    }
    if (isOpen) {
      w.activeModal = null;
      return _compose({
        view: w,
        sounds: [{ kind: "ui.modal.close", payload: {} }],
        flags: { clearInteraction: true }
      }, _syncLayout(w, input));
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
    const m = buildReserveModel(deps, input);
    w.bridgeModal.credits = m.credits;
    w.bridgeModal.locusOk = m.locusOk;
    w.bridgeModal.locusText = m.locusText;
    w.bridgeModal.cards = m.cards;
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
    w.campaignModal.cards = buildCampaignCards(deps, input);
    const r = _syncLayout(w, input);
    if (!silent) {
      r.flags = Object.assign({}, r.flags, { renderRequests: [{ skipBoard: false }] });
    }
    return r;
  }

  function _showEndgameModal(view, input, isVictory) {
    const w = _clone(view);
    const m = buildEndgameModel(input, isVictory);
    w.endgameModal.isVictory = m.isVictory;
    w.endgameModal.title = m.title;
    w.endgameModal.body = m.body;
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
    } else if (r.view.activeModal === "campaign") {
      r = _compose(r, _renderCampaignCards(r.view, input, true));
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
        const help = buildHelpLines(deps, input);
        w.helpModal = { title: help.title, lines: help.lines, rect: null };
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
    toggleDeployModal(view, input, forceState = null) {
      return _finalize(_toggleDeployModal(view, input, forceState));
    },

    // M4: the station storefront modal (opened from the map HUD when the
    // fleet is docked at a station).
    toggleStationModal(view, input, forceState = null) {
      return _finalize(_toggleStationModal(view, input, forceState));
    },
    stationModel(view, input) {
      return buildStationModel((input.state && input.state.station) || {}, { metrics: input.metrics });
    },

    // M3: map HUD + hailing shell. The encounter is plain data in, the shell
    // model is rebuilt from it on every map update (state lives in the map
    // section; this view only mirrors it).
    updateMapHud(view, input, mapState, extra = null) {
      return _updateMapHud(view, input, mapState, extra);
    },
    showHailPanel(view, input, encounter, dialogue) {
      const w = _clone(view);
      w.hailEncounter = encounter ? JSON.parse(JSON.stringify(encounter)) : null;
      // M6(c): the faction dialogue model (voice line + Q11 options) rides
      // with the encounter so the panel child can lay the shell out.
      w.hailDialogue = dialogue ? JSON.parse(JSON.stringify(dialogue)) : null;
      return _finalize(_compose({
        view: w,
        sounds: [{ kind: "ui.modal.open", payload: {} }],
        flags: { clearInteraction: true }
      }, _syncLayout(w, input)));
    },
    hideHailPanel(view, input) {
      const w = _clone(view);
      if (!w.hailEncounter) return _finalize({ view: w });
      w.hailEncounter = null;
      w.hailDialogue = null;
      return _finalize(_compose({
        view: w,
        sounds: [{ kind: "ui.modal.close", payload: {} }],
        flags: { clearInteraction: true }
      }, _syncLayout(w, input)));
    },

    // Pure model reads (test/debug bridge): the two map children exposed as
    // data-in/data-out with no view mutation.
    hailModel(view, input, encounter) { return buildHailModel(encounter); },
    hailPanel(view, input, encounter, dialogue) { return buildHailPanel(encounter, dialogue); },
    outfitModel(input) { return buildOutfitModel(input); },
    mapHudModel(view, input, mapState, extra = null) {
      const d = (extra && typeof extra === "object") ? Object.assign({}, extra) : {};
      d.metrics = input.metrics;
      d.hail = (view && view.hailEncounter)
        ? ((view && view.hailDialogue) ? buildHailPanel(view.hailEncounter, view.hailDialogue) : buildHailModel(view.hailEncounter))
        : (d.hail || null);
      return buildMapHudModel(mapState, d);
    },

    showEndgameModal(view, input, isVictory) {
      return _finalize(_showEndgameModal(view, input, isVictory));
    },
    hideEndgameModal(view, input) { return _finalize(_hideEndgameModal(view, input)); },

    applyTheme(view, input, key) { return _finalize(_applyTheme(view, input, key)); },
    updateAll(view, input) { return _finalize(_updateAll(view, input)); }
  };
};

// The parent reads this file's ONE function as `createHud`; the boot-time
// initial view travels beside it as a property of that same function (not a
// second exposed function — one job, one function, one file). The parent
// captures this payload when it loads the file.
createHud.createInitialView = createInitialView;
// Loading convention: this file defines createHud at top level (with the
// initial-view payload attached); the owner captures it after the boot list.
