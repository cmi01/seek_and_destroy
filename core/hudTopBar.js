"use strict";

// ============================================================
// hudTopBar.js — job: build the top-bar chrome model — level tag row, action-button rows, button edge metrics and the top-bar rect.
// Owner: core/hud.js. Holds no state unless it is a core.
// ============================================================
(() => {
  // The level tag text: the current campaign level's tag (first level as the
  // boot fallback). Pure: level list + input state in, string out.
  function buildLevelTag(deps, input) {
    const levels = deps.campaignLevels;
    const spec = levels.find(l => l.id === input.state.levelId) || levels[0];
    return spec.tag;
  }

  // The chrome geometry: two buttons top-right (reinforce + menu), one
  // bottom-right (end turn), and the top-left bar rect sized to the buttons'
  // left edge — the fixed-size 768 design grid scaled by uiScale. Pure:
  // input in, plain metrics/button data out.
  function buildTopBarChrome(input, menuOpen) {
    const DS = input.metrics.displaySize;
    const US = input.metrics.uiScale;
    const isPlayerTurn = input.state.activeTeam === 1 && !input.state.gameOver;

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
      { id: "MENU",           label: menuOpen ? "MENU ^" : "MENU v",          w: Math.round(80 * US), enabled: true,         active: menuOpen }
    ];

    const botDefs = [
      { id: "END_TURN", label: "END TURN", w: Math.round(112 * US), enabled: isPlayerTurn, active: false }
    ];

    const topButtons = [];
    let curRight = DS - padRight;
    for (let i = topDefs.length - 1; i >= 0; i--) {
      const d = topDefs[i];
      const bw = d.w;
      const x = curRight - bw;
      topButtons.unshift({ id: d.id, label: d.label, x, y: topY, w: bw, h: btnH, enabled: d.enabled, active: d.active });
      curRight = x - gap;
    }
    const topButtonsLeftEdge = topButtons.length > 0 ? topButtons[0].x : (DS - padRight);

    const bottomButtons = [];
    let botRight = DS - padRight;
    for (let i = botDefs.length - 1; i >= 0; i--) {
      const d = botDefs[i];
      const bw = d.w;
      const x = botRight - bw;
      bottomButtons.push({ id: d.id, label: d.label, x, y: botY, w: bw, h: btnH, enabled: d.enabled, active: d.active });
      botRight = x - gap;
    }

    const pad = Math.round(10 * US);
    const leftAvailW = Math.max(Math.round(160 * US), topButtonsLeftEdge - Math.round(18 * US));
    const barW = Math.min(Math.round(340 * US), leftAvailW);
    const barH = Math.round(46 * US);

    return {
      topButtons,
      bottomButtons,
      topButtonsLeftEdge,
      btnH,
      padRight,
      topY,
      botY,
      topBarRect: { x: pad, y: pad, w: barW, h: barH }
    };
  }

  createHud._register("topBar", {
    buildLevelTag,
    buildTopBarChrome
  });
})();
