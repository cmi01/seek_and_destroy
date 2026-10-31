"use strict";
// ============================================================
// backgroundRenderer.js — job: draw the frame's background layer.
// Owner: graphics/graphics.js. Holds no state unless it is a core.
// ============================================================
(() => {
  // ---- Plain-data helpers (local re-implementations over frame data) -------
  const _spottedBy = (u, team) => Boolean(u && (u.team === team || u.spottedByPlayer));
  const _effScanOf = u => (u && typeof u.effectiveScan === "number") ? u.effectiveScan : (u ? (u.scan || 0) : 0);

  // Paints procedural terrain (nebulae + asteroid shapes) into the parent's
  // offscreen cache canvas. `shapes[gx][gy]` is plain geometry data computed
  // by the parent's single RNG source: { seed, pts: [[x, y]…], ex, ey, erot }.
  // Returns nothing but pixels.
  function paintTerrain(cmd) {
    const { canvas, state, bp, gridSize, CP, FS, shapes, TC: rawTC } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);
    if (!canvas) return;
    const totalPx = Math.max(64, Math.ceil(gridSize * CP));
    const tctx = canvas.getContext("2d");
    tctx.clearRect(0, 0, totalPx, totalPx);

    for (let gx = 0; gx < gridSize; gx++) {
      const col = state.terrain && state.terrain[gx];
      if (!col) continue;
      for (let gy = 0; gy < gridSize; gy++) {
        const t = col[gy];
        if (t !== "NEBULA" && t !== "ASTEROID") continue;
        const cx = (gx + 0.5) * CP;
        const cy = (gy + 0.5) * CP;

        if (t === "NEBULA") {
          const nebGrad = tctx.createRadialGradient(cx, cy, 2, cx, cy, CP * 1.15);
          nebGrad.addColorStop(0, bp.neb0);
          nebGrad.addColorStop(0.6, bp.neb1);
          nebGrad.addColorStop(1, bp.neb2);
          tctx.fillStyle = nebGrad;
          tctx.fillRect(gx * CP, gy * CP, CP, CP);
        } else if (t === "ASTEROID") {
          const shape = (shapes && shapes[gx] && shapes[gx][gy]) ? shapes[gx][gy] : null;
          if (!shape) continue;
          tctx.save();
          tctx.translate(cx, cy);
          tctx.rotate(shape.seed * Math.PI * 2);

          tctx.beginPath();
          const pts = shape.pts;
          for (let i = 0; i < pts.length; i++) {
            if (i === 0) tctx.moveTo(pts[i][0], pts[i][1]); else tctx.lineTo(pts[i][0], pts[i][1]);
          }
          tctx.closePath();

          const rockGrad = tctx.createLinearGradient(-8 * FS, -8 * FS, 8 * FS, 8 * FS);
          rockGrad.addColorStop(0, bp.rock0);
          rockGrad.addColorStop(0.5, bp.rock1);
          rockGrad.addColorStop(1, bp.rock2);
          tctx.fillStyle = rockGrad;
          tctx.strokeStyle = bp.rockStroke;
          tctx.lineWidth = 1.2 * FS;
          tctx.fill();
          tctx.stroke();

          tctx.fillStyle = TC("rgba(0,0,0,0.3)");
          tctx.beginPath();
          tctx.ellipse(shape.ex, shape.ey, 2.5 * FS, 1.8 * FS, shape.erot, 0, Math.PI * 2);
          tctx.fill();

          tctx.restore();
        }
      }
    }
  }

  function drawBattleGridAndTerrain(cmd) {
    const {
      ctx, visMatrix, state, bp, gridSize,
      CP, FS, DX0, DX1, DY0, DY1, terrainCanvas
    } = cmd;

    // 1. Batched grid lines (minor + major) (ISS-030)
    ctx.lineWidth = 1;
    ctx.strokeStyle = bp.gridMinor;
    ctx.beginPath();
    for (let i = DX0; i <= DX1; i++) {
      if (i === 8 || i === 16 || i === 24) continue;
      const pos = i * CP;
      ctx.moveTo(pos, DY0 * CP);
      ctx.lineTo(pos, DY1 * CP);
      ctx.moveTo(DX0 * CP, pos);
      ctx.lineTo(DX1 * CP, pos);
    }
    ctx.stroke();

    ctx.strokeStyle = bp.gridMajor;
    ctx.beginPath();
    for (let i = DX0; i <= DX1; i++) {
      if (i !== 8 && i !== 16 && i !== 24) continue;
      const pos = i * CP;
      ctx.moveTo(pos, DY0 * CP);
      ctx.lineTo(pos, DY1 * CP);
      ctx.moveTo(DX0 * CP, pos);
      ctx.lineTo(DX1 * CP, pos);
    }
    ctx.stroke();

    // 2. Batched coordinate ticks
    ctx.strokeStyle = bp.ticks;
    ctx.beginPath();
    for (let gx = 4; gx < gridSize; gx += 4) {
      if (gx < DX0 || gx >= DX1) continue;
      for (let gy = 4; gy < gridSize; gy += 4) {
        if (gy < DY0 || gy >= DY1) continue;
        const px = gx * CP, py = gy * CP;
        ctx.moveTo(px - 2, py);
        ctx.lineTo(px + 2, py);
        ctx.moveTo(px, py - 2);
        ctx.lineTo(px, py + 2);
      }
    }
    ctx.stroke();

    // 3. Cached procedural terrain (active visibility at 1.0 alpha, explored memory at 0.45 alpha) (ISS-030, ISS-069)
    const cacheCanvas = terrainCanvas || null;
    const explored = state.exploredCells;
    if (cacheCanvas) {
      ctx.save();
      for (let gx = DX0; gx < DX1; gx++) {
        const col = state.terrain && state.terrain[gx];
        if (!col) continue;
        for (let gy = DY0; gy < DY1; gy++) {
          const t = col[gy];
          if (t !== "NEBULA" && t !== "ASTEROID") continue;
          const isVis = Boolean(visMatrix[gx] && visMatrix[gx][gy]);
          const isExp = Boolean(explored && explored[gx] && explored[gx][gy]);
          if (!isVis && !isExp) continue;
          ctx.globalAlpha = isVis ? 1.0 : 0.45;
          const sx = gx * CP, sy = gy * CP;
          ctx.drawImage(cacheCanvas, sx, sy, CP, CP, sx, sy, CP, CP);
        }
      }
      ctx.restore();
    }
  }

  function drawBattleFog(cmd) {
    const { ctx, visMatrix, state, bp, CP, DX0, DX1, DY0, DY1, TC: rawTC } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);
    const explored = state && state.exploredCells;

    ctx.save();
    ctx.fillStyle = bp.fogFill;
    for (let gx = DX0; gx < DX1; gx++) {
      for (let gy = DY0; gy < DY1; gy++) {
        if (visMatrix[gx][gy]) continue;
        const isExp = Boolean(explored && explored[gx] && explored[gx][gy]);
        ctx.globalAlpha = isExp ? 0.56 : 1.0;
        ctx.fillRect(gx * CP, gy * CP, CP, CP);
      }
    }
    ctx.restore();
    // Batched diagonal hatch lines across all fogged cells in a single stroke call (ISS-030)
    ctx.lineWidth = 1;
    ctx.strokeStyle = TC("rgba(255, 255, 255, 0.02)");
    ctx.beginPath();
    for (let gx = DX0; gx < DX1; gx++) {
      for (let gy = DY0; gy < DY1; gy++) {
        if (visMatrix[gx][gy]) continue;
        const rx = gx * CP, ry = gy * CP;
        ctx.moveTo(rx, ry + CP);
        ctx.lineTo(rx + CP, ry);
      }
    }
    ctx.stroke();
  }

  function drawMinimapBackground(cmd) {
    const { ctx, visMatrix, state, bp, gridSize, mmSize, cellPx, TC: rawTC } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);
    const explored = state && state.exploredCells;

    // Background
    ctx.fillStyle = bp.bg;
    ctx.fillRect(0, 0, mmSize, mmSize);

    // Scanline texture
    ctx.fillStyle = TC("rgba(56, 189, 248, 0.02)");
    for (let y = 0; y < mmSize; y += 3) ctx.fillRect(0, y, mmSize, 1);

    // Cells (terrain + explored memory + fog)
    for (let gx = 0; gx < gridSize; gx++) {
      for (let gy = 0; gy < gridSize; gy++) {
        const px = gx * cellPx, py = gy * cellPx;
        const visible = visMatrix[gx][gy];
        const isExp = Boolean(explored && explored[gx] && explored[gx][gy]);
        const terrain = state.terrain[gx][gy];

        if (!visible) {
          ctx.fillStyle = bp.fogFill;
          ctx.fillRect(px, py, cellPx, cellPx);
          if (isExp && (terrain === "ASTEROID" || terrain === "NEBULA")) {
            ctx.save();
            ctx.globalAlpha = 0.48;
            if (terrain === "ASTEROID") {
              ctx.fillStyle = bp.mmRockOuter;
              ctx.fillRect(px, py, cellPx, cellPx);
              ctx.fillStyle = bp.mmRockInner;
              ctx.fillRect(px + cellPx * 0.20, py + cellPx * 0.20, cellPx * 0.60, cellPx * 0.60);
            } else {
              ctx.fillStyle = bp.neb0;
              ctx.fillRect(px, py, cellPx, cellPx);
            }
            ctx.restore();
          }
        } else if (terrain === "ASTEROID") {
          ctx.fillStyle = bp.mmRockOuter;
          ctx.fillRect(px, py, cellPx, cellPx);
          ctx.fillStyle = bp.mmRockInner;
          ctx.fillRect(px + cellPx * 0.20, py + cellPx * 0.20, cellPx * 0.60, cellPx * 0.60);
        } else if (terrain === "NEBULA") {
          ctx.fillStyle = bp.neb0;
          ctx.fillRect(px, py, cellPx, cellPx);
        }
      }
    }

    // Batched major grid lines on minimap
    ctx.strokeStyle = bp.gridMajor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 8; i < gridSize; i += 8) {
      const pos = i * cellPx;
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, mmSize);
      ctx.moveTo(0, pos);
      ctx.lineTo(mmSize, pos);
    }
    ctx.stroke();
  }

  Graphics._registerLayer("background", {
    paintTerrain,
    drawBattleGridAndTerrain,
    drawBattleFog,
    drawMinimapBackground
  });
})();
