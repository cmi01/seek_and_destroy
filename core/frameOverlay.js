"use strict";

// ============================================================
// frameOverlay.js — job: build the render frame's overlay slice: tactical
// affordance cells, damage numbers, badges, highlights and the move line.
// Owner: core/game.js (pure child). Holds no state.
// ============================================================
Game._registerModule("frameOverlay", deps => {
  // deps = { buildUnitIndex, canMove, hasLineOfSight, hasFlag,
  //          computeShootOutcome, inRange, dist, getSpottedEnemyAt,
  //          canCapture, canShield } — the parent's pure rule/action queries,
  // injected so this child holds no state and references nothing outside its
  // parent.

  function build(p){
    // p = { state, visCache, selUnit, isPlayerTurn, baseState, gridSize,
    //      dx0, dx1, dy0, dy1 } — state-shape params in, plain overlay out.
    const st = p.state;
    const selUnit = p.selUnit;

    const tacticalOverlays = { active: false, originX: 0, originY: 0, cells: [], hoveredMoveLine: null };
    if (selUnit && selUnit.team === 1 && p.isPlayerTurn && st.ap > 0){
      tacticalOverlays.active = true;
      tacticalOverlays.originX = selUnit.x;
      tacticalOverlays.originY = selUnit.y;
      const explored = st.exploredCells;
      const rawVis = p.visCache;
      // Affordances are computed over KNOWN terrain only (what the player has
      // seen), never the true fogged board.
      const knownTerrain = Array.from({ length: p.gridSize }, (_, x) =>
        Array.from({ length: p.gridSize }, (__, y) => {
          const isKnown = Boolean((rawVis && rawVis[x] && rawVis[x][y]) || (explored && explored[x] && explored[x][y]));
          return isKnown && st.terrain && st.terrain[x] ? st.terrain[x][y] : "EMPTY";
        })
      );
      const knownCtx = Object.create(p.baseState);
      knownCtx.terrain = knownTerrain;
      knownCtx.unitIndex = deps.buildUnitIndex(st.units);
      const canMoveKnown = (u, b) => deps.canMove(knownCtx, u, b);
      const hasKnownLos = (x0, y0, x1, y1, mode) => deps.hasLineOfSight(knownCtx, x0, y0, x1, y1, mode);

      for (let gx = p.dx0; gx < p.dx1; gx++){
        for (let gy = p.dy0; gy < p.dy1; gy++){
          const B = { x: gx, y: gy };
          const cm = canMoveKnown(selUnit, B);
          const cs = Boolean(
            !deps.hasFlag(selUnit, "-attacked") &&
            selUnit.firepower > 0 &&
            !(gx === selUnit.x && gy === selUnit.y) &&
            deps.inRange(selUnit, B, selUnit.range) &&
            hasKnownLos(selUnit.x, selUnit.y, gx, gy, "WEAPON")
          );
          const spottedEnemy = cs ? deps.getSpottedEnemyAt(gx, gy, 1) : null;
          const spottedEnemyDmg = spottedEnemy ? deps.computeShootOutcome(selUnit, spottedEnemy).damageDealt : null;
          const isHov = Boolean(st.hoveredCell && st.hoveredCell.x === gx && st.hoveredCell.y === gy);
          const cc = deps.canCapture(selUnit, B);
          const csh = deps.canShield(selUnit, B);
          if (cm || cs || cc || csh){
            tacticalOverlays.cells.push({
              gx, gy,
              canMove: cm,
              canShoot: cs,
              spottedEnemyDmg,
              isHovered: isHov,
              firepower: selUnit.firepower,
              canCapture: cc,
              canShield: csh
            });
          }
        }
      }
      if (st.hoveredCell && canMoveKnown(selUnit, st.hoveredCell)){
        tacticalOverlays.hoveredMoveLine = {
          fromX: selUnit.x,
          fromY: selUnit.y,
          toX: st.hoveredCell.x,
          toY: st.hoveredCell.y,
          dist: deps.dist(selUnit, st.hoveredCell)
        };
      }
    }

    return { tacticalOverlays };
  }

  return { build };
});
