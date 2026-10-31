"use strict";

// ============================================================
// hudBanner.js — job: build the priority-hint banner model and its memo cache.
// Owner: core/hud.js. Holds no state unless it is a core.
// ============================================================
(() => {
  // The floating priority hint for the hovered action. Pure: query deps +
  // input + the previous memo cache in, banner model + next cache out. (The
  // banner stays computed for the cache but never shown — HUD declutter: the
  // board badges carry the action affordances.)
  function buildPriorityBanner(deps, input, view, prevCache, recomputeAction) {
    const banner = {
      visible: view.priorityBanner.visible,
      label: view.priorityBanner.label,
      x: view.priorityBanner.x,
      y: view.priorityBanner.y,
      hoveredSpotted: view.priorityBanner.hoveredSpotted
    };
    const cache = {
      priorityKey: prevCache ? prevCache.priorityKey : "",
      priorityLabel: prevCache ? prevCache.priorityLabel : null,
      hoveredSpotted: prevCache ? prevCache.hoveredSpotted : false
    };
    const hoveredCell = input.state.hoveredCell;
    if (view.activeModal !== null || input.state.activeTeam !== 1 || !hoveredCell) {
      banner.visible = false;
      banner.hoveredSpotted = false;
      cache.priorityKey = "";
      cache.priorityLabel = null;
      cache.hoveredSpotted = false;
      // The floating priority hint stays computed for the cache but is never
      // shown (HUD declutter: board badges carry the action affordances).
      banner.visible = false;
      return { banner, cache };
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

    banner.hoveredSpotted = cache.hoveredSpotted;
    if (cache.priorityLabel) {
      const DS = input.metrics.displaySize;
      const US = input.metrics.uiScale;
      const cp = input.metrics.cellPx;
      const mx = (input.state.mousePx.x > 0 || input.state.mousePx.y > 0) ? input.state.mousePx.x : ((x - input.state.viewX + 0.5) * cp);
      const my = (input.state.mousePx.x > 0 || input.state.mousePx.y > 0) ? input.state.mousePx.y : ((y - input.state.viewY + 0.5) * cp);
      banner.visible = true;
      banner.label = cache.priorityLabel;
      banner.x = Math.min(DS - 210 * US, mx + 16 * US);
      banner.y = Math.max(64 * US, my - 24 * US);
    } else {
      banner.visible = false;
    }
    // The floating priority hint stays computed for the cache but is never
    // shown (HUD declutter: board badges carry the action affordances).
    banner.visible = false;
    return { banner, cache };
  }

  createHud._register("banner", {
    buildPriorityBanner
  });
})();
