"use strict";

// ============================================================
// hud.js — job: compose the HUD widget model and button list from per-domain pure children.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("hud", (() => {
  // This file's direct children (one per widget domain), registered through
  // the transient name-gated registrar below while they load.
  const _hudModules = {
    topBar: null,
    telemetry: null,
    menu: null,
    minimap: null,
    modals: null,
    banner: null,
    intel: null
  };
  let _regOpen = true;
  let _loadPromise = null;

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

  // Guarded fallback (the proven lazy-load entry-guard shape): when the
  // children have not loaded, the HUD model is simply not rebuilt. Game's
  // boot order guarantees the children registered before the first HUD
  // operation runs, so this only fires when a child script genuinely failed
  // (the loud load error above names it).
  function _childrenReady() {
    return Boolean(_hudModules.topBar && _hudModules.telemetry && _hudModules.menu &&
      _hudModules.minimap && _hudModules.modals && _hudModules.banner && _hudModules.intel);
  }
  function _fallbackView(view) {
    console.error("[S&D HUD] hud children are not loaded; the HUD model is not rebuilt.");
    return { view: _clone(view) };
  }

  function createHud(deps) {

    // ---- internal ops: (view, input) -> result (see RESULT SHAPE) ----------
    function _syncLayout(view, input) {
      const w = _clone(view);
      const DS = input.metrics.displaySize;

      if (w.activeModal === "bridge") {
        const buttons = _hudModules.modals.buildBridgeShopButtons(input, w.bridgeModal);
        w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
        return { view: w, buttons };
      }

      if (w.activeModal === "campaign") {
        // Starmap: one clickable node per campaign level. Node geometry is
        // computed by the shared starmap layout so the hit regions stored
        // here exactly match what the starmap draws (it reads the same
        // nodes/layout from the HUD snapshot).
        const cards = Array.isArray(w.campaignModal.cards) ? w.campaignModal.cards : [];
        const lay = _hudModules.modals.buildCampaignLayout(input, cards);
        w.campaignModal.nodes = lay.nodes;
        w.campaignModal.layout = lay.layout;
        w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
        return { view: w, buttons: lay.buttons };
      }

      // HELP — fixed-size canvas panel holding the text that is otherwise
      // hidden from the HUD: controls and the mission briefing.
      if (w.activeModal === "help") {
        const lines = Array.isArray(w.helpModal.lines) ? w.helpModal.lines : [];
        const panel = _hudModules.modals.buildHelpPanel(input, lines);
        w.helpModal.rows = panel.rows;
        w.helpModal.rect = panel.rect;
        w.panelRects = { topBar: null, minimap: null, selectedCard: null, hoveredCard: null, intelOverlay: null, menu: null };
        return { view: w, buttons: [panel.closeBtn] };
      }

      const mm = _hudModules.minimap.buildMinimapModel(input);
      const mmRect = mm.rect;

      if (w.activeModal === "endgame") {
        const buttons = _hudModules.modals.buildEndgameButtons(input, w.endgameModal);
        w.panelRects = { topBar: null, minimap: mmRect, selectedCard: null, hoveredCard: null, intelOverlay: null };
        return { view: w, buttons };
      }

      // Main HUD chrome: edge buttons + top bar, the dropdown menu, the
      // right-edge telemetry cards and the intel panel under the top bar.
      const chrome = _hudModules.topBar.buildTopBarChrome(input, w.menuOpen);
      const menu = _hudModules.menu.buildMenuModel(deps, input, w, {
        edgeX: DS - chrome.padRight,
        belowY: chrome.topY + chrome.btnH
      });
      const cards = _hudModules.telemetry.buildTelemetryCardRects(input, w, chrome, mmRect);
      const intelRect = _hudModules.intel.buildIntelRect(input, w, chrome.topBarRect);

      w.panelRects = {
        topBar: chrome.topBarRect,
        minimap: mmRect,
        selectedCard: cards.selectedCard,
        hoveredCard: input.state.inspectMode ? cards.hoveredCard : null,
        intelOverlay: intelRect,
        menu: menu.menuRect
      };
      return { view: w, buttons: chrome.topButtons.concat(menu.buttons, chrome.bottomButtons) };
    }

    function _updateLeftWing(view, input) {
      const w = _clone(view);
      w.levelTag = _hudModules.topBar.buildLevelTag(deps, input);
      return { view: w };
    }

    function _updateRightWing(view, input) {
      const w = _clone(view);
      const models = _hudModules.telemetry.buildTelemetryModels(deps, input);
      w.hoveredTelemetry = models.hoveredTelemetry;
      w.selectedTelemetry = models.selectedTelemetry;
      return _compose({ view: w }, _syncLayout(w, input));
    }

    function _updatePriorityBanner(view, input, recomputeAction) {
      const w = _clone(view);
      const r = _hudModules.banner.buildPriorityBanner(deps, input, w, input.cache, recomputeAction);
      w.priorityBanner = r.banner;
      return { view: w, banner: r.banner, cache: r.cache };
    }

    function _showIntelOverlay(view, input, title, lines) {
      const w = _clone(view);
      const m = _hudModules.intel.buildIntelModel(title, lines);
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
      const m = _hudModules.modals.buildBridgeShopModel(deps, input);
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
      w.campaignModal.cards = _hudModules.modals.buildCampaignCards(deps, input);
      const r = _syncLayout(w, input);
      if (!silent) {
        r.flags = Object.assign({}, r.flags, { renderRequests: [{ skipBoard: false }] });
      }
      return r;
    }

    function _showEndgameModal(view, input, isVictory) {
      const w = _clone(view);
      const m = _hudModules.modals.buildEndgameModel(input, isVictory);
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

      syncLayout(view, input) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_syncLayout(view, input));
      },
      updateLeftWing(view, input) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_updateLeftWing(view, input));
      },
      updateRightWing(view, input) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_updateRightWing(view, input));
      },
      updatePriorityBanner(view, input, recomputeAction = true) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_updatePriorityBanner(view, input, recomputeAction));
      },

      showIntelOverlay(view, input, title, lines) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_showIntelOverlay(view, input, title, lines));
      },
      hideIntelOverlay(view, input) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_hideIntelOverlay(view, input));
      },

      toggleBridgeModal(view, input, forceState = null) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_toggleBridgeModal(view, input, forceState));
      },
      renderBridgeShop(view, input, silent = false) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_renderBridgeShop(view, input, silent));
      },
      toggleCampaignModal(view, input, forceState = null) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_toggleCampaignModal(view, input, forceState));
      },
      toggleMenu(view, input, forceState = null) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        const w = _clone(view);
        w.menuOpen = forceState !== null ? Boolean(forceState) : !w.menuOpen;
        return _finalize(_syncLayout(w, input));
      },
      isMenuOpen(view) { return Boolean(view.menuOpen); },
      toggleHelpModal(view, input, forceState = null) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        const w = _clone(view);
        const isOpen = w.activeModal === "help";
        const next = forceState !== null ? Boolean(forceState) : !isOpen;
        if (next && w.activeModal !== null && w.activeModal !== "help") {
          return _finalize({ view: w });
        }
        if (next) {
          w.activeModal = "help";
          w.menuOpen = false;
          const help = _hudModules.modals.buildHelpLines(deps, input);
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
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_renderCampaignCards(view, input, silent));
      },

      showEndgameModal(view, input, isVictory) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_showEndgameModal(view, input, isVictory));
      },
      hideEndgameModal(view, input) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_hideEndgameModal(view, input));
      },

      applyTheme(view, input, key) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_applyTheme(view, input, key));
      },
      updateAll(view, input) {
        if (!_childrenReady()) return _finalize(_fallbackView(view));
        return _finalize(_updateAll(view, input));
      }
    };
  }

  // ---- this file's direct children (§1.4: the parent's own small loader) --
  function _loadScripts(list){
    return Promise.allSettled(list.map(src => new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false; // force in-order execution
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error("Failed to load script: " + src));
      document.head.appendChild(s);
    }))).then(results => {
      const failures = results.filter(r => r.status === "rejected").map(r => r.reason.message);
      if (failures.length > 0) throw new Error(failures.join("\n"));
    });
  }

  // Registrar exposed ONLY while this file's direct children load.
  createHud._register = function(name, mod){
    if (!_regOpen || !(name in _hudModules)) throw new Error("[S&D HUD] Unexpected registration for " + name);
    _hudModules[name] = mod;
  };

  // The children load the moment this module registers. Game's boot continues
  // with later, slower child loads that it awaits before the first HUD
  // operation, and the in-order script queue runs these children first — so
  // the guarded fallback above never fires in practice; any load failure is
  // reported loudly here.
  _loadPromise = (async () => {
    const g = typeof window !== "undefined" ? window : globalThis;
    g.createHud = createHud;
    try {
      await _loadScripts([
        "core/hudTopBar.js",
        "core/hudTelemetry.js",
        "core/hudMenu.js",
        "core/hudMinimap.js",
        "core/hudModals.js",
        "core/hudBanner.js",
        "core/hudIntel.js"
      ]);
    } finally {
      delete g.createHud;
      _regOpen = false;
      delete createHud._register;
    }
    const missing = Object.keys(_hudModules).filter(k => _hudModules[k] === null);
    if (missing.length > 0) {
      throw new Error("These scripts loaded but did not register their module:\n  " + missing.join("\n  "));
    }
  })();
  _loadPromise.catch(err => console.error("[S&D HUD]", err));

  return {
    createInitialView,
    createHud
  };
})());
