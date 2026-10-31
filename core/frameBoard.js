"use strict";

// ============================================================
// frameBoard.js — job: build the render frame's board slice: grid geometry,
// terrain cells and explored/fog shading.
// Owner: core/game.js (pure child). Holds no state.
// ============================================================
Game._registerModule("frameBoard", deps => {
  // deps = { frameCopy, freshCopy } — the parent's plain-copy helpers
  // (copy-on-write memoization lives with the state owner), so slice fields
  // never alias live state and grid copy identity stays stable across frames.

  function build(p){
    // p = { gridSize, spawnRadius, state, visCache, renderedViewport, metrics }
    // — state-shape params in, plain board slice out.
    const st = p.state;

    const m = p.metrics;
    const metricsDTO = m ? {
      displaySize: m.displaySize,
      viewportWidth: m.viewportWidth,
      viewportHeight: m.viewportHeight,
      isWidescreen: m.isWidescreen,
      renderScale: m.renderScale,
      devicePx: m.devicePx,
      cellPx: m.cellPx,
      fontScale: m.fontScale,
      textScale: m.textScale,
      uiScale: m.uiScale,
      minimapSize: m.minimapSize,
      minimapCanvasSize: m.minimapCanvasSize,
      minimapDevicePx: m.minimapDevicePx
    } : null;

    // Render extents: the plain view span widened to cover an in-flight zoom
    // animation so both endpoint frames stay inside the drawn region.
    const vp = p.renderedViewport;
    const anim = st.zoomAnim;
    let dx0 = st.viewX, dx1 = st.viewX + st.viewSpan;
    let dy0 = st.viewY, dy1 = st.viewY + st.viewSpan;
    if (anim && anim.active){
      dx0 = Math.max(0, Math.floor(Math.min(anim.fromX, anim.toX)));
      dx1 = Math.min(p.gridSize, Math.ceil(Math.max(anim.fromX + anim.fromSpan, anim.toX + anim.toSpan)));
      dy0 = Math.max(0, Math.floor(Math.min(anim.fromY, anim.toY)));
      dy1 = Math.min(p.gridSize, Math.ceil(Math.max(anim.fromY + anim.fromSpan, anim.toY + anim.toSpan)));
    }
    const viewportDTO = {
      viewX: st.viewX,
      viewY: st.viewY,
      viewSpan: st.viewSpan,
      renderViewX: vp.viewX,
      renderViewY: vp.viewY,
      renderViewSpan: vp.viewSpan,
      dx0, dx1, dy0, dy1
    };

    return {
      GRID_SIZE: p.gridSize,
      SPAWN_RADIUS: p.spawnRadius,
      metrics: metricsDTO,
      viewport: viewportDTO,
      terrain: deps.frameCopy(st.terrain),
      asteroidSeeds: deps.frameCopy(st.asteroidSeeds),
      exploredCells: deps.freshCopy(st.exploredCells),
      visCache: deps.frameCopy(p.visCache),
      viewX: st.viewX,
      viewY: st.viewY,
      viewSpan: st.viewSpan,
      zoomAnim: st.zoomAnim ? { ...st.zoomAnim } : { active: false }
    };
  }

  return { build };
});
