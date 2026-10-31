"use strict";

// ============================================================
// hudMenu.js — job: build the dropdown-menu model — item buttons and the menu panel rect.
// Owner: core/hud.js. Holds no state unless it is a core.
// ============================================================
(() => {
  // The dropdown menu hanging under the MENU button (fixed-size rows). Pure:
  // input + view state + the top bar child's edge anchor in, plain data out.
  function buildMenuModel(deps, input, view, anchor) {
    if (!view.menuOpen) return { buttons: [], menuRect: null };

    const US = input.metrics.uiScale;
    const selUnit = input.selectedUnit;
    const isPlayerTurn = input.state.activeTeam === 1 && !input.state.gameOver;
    const canShieldSelected = Boolean(
      isPlayerTurn &&
      selUnit &&
      selUnit.team === 1 &&
      input.state.ap > 0 &&
      deps.canShield(selUnit, { x: selUnit.x, y: selUnit.y })
    );
    const audioMuted = Boolean(input.state.audioMuted);
    const audioReady = Boolean(view.audioReady);
    const audioLabel = !audioReady ? "AUDIO: OFF" : (audioMuted ? "AUDIO: MUTE" : "AUDIO: ON");
    const themeLabel = String(input.state.theme || "default").toUpperCase();

    const itemW = Math.round(168 * US);
    const itemH = Math.round(30 * US);
    const itemGap = Math.round(2 * US);
    const menuX = anchor.edgeX - itemW;
    const menuY = anchor.belowY + Math.round(4 * US);
    const items = [
      { id: "MENU_MAP",    label: "SECTOR MAP", enabled: true, active: false },
      { id: "MENU_THEME",  label: "THEME: " + themeLabel, enabled: true, active: false },
      { id: "MENU_AUDIO",  label: audioLabel, enabled: true, active: audioReady && !audioMuted },
      { id: "MENU_SHIELD", label: "REGEN SHIELD", enabled: canShieldSelected, active: canShieldSelected },
      { id: "MENU_HELP",   label: "HELP", enabled: true, active: false }
    ];
    const buttons = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      buttons.push({ id: it.id, label: it.label, x: menuX, y: menuY + i * (itemH + itemGap), w: itemW, h: itemH, enabled: it.enabled, active: it.active });
    }
    const menuRect = {
      x: menuX - Math.round(5 * US),
      y: menuY - Math.round(5 * US),
      w: itemW + Math.round(10 * US),
      h: items.length * itemH + (items.length - 1) * itemGap + Math.round(10 * US)
    };
    return { buttons, menuRect };
  }

  createHud._register("menu", {
    buildMenuModel
  });
})();
