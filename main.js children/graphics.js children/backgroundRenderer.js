"use strict";
// ============================================================
// backgroundRenderer.js — job: build the frame's background layer draw list.
// Owner: graphics.js. Holds no state unless it is a core.
//
// C2: builders return DrawCmd[] data; only the main.js draw executor touches
// a canvas. All geometry here is plain numbers — no ctx, no getContext.
// ============================================================
const buildBackgroundLayer = (() => {
  // ---- Plain-data helpers (local re-implementations over frame data) -------
  const _spottedBy = (u, team) => Boolean(u && (u.team === team || u.spottedByPlayer));
  const _effScanOf = u => (u && typeof u.effectiveScan === "number") ? u.effectiveScan : (u ? (u.scan || 0) : 0);

  // 64 samples around an ellipse: at the crater sizes in play (a few px) the
  // polyline is below the rasterizer's resolution — visually identical.
  const ELLIPSE_SAMPLES = 64;

  function _ellipsePoints(cx, cy, rx, ry, rot, transform) {
    const pts = [];
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
      const a = (i / ELLIPSE_SAMPLES) * Math.PI * 2;
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      const px = cx + ex * cosR - ey * sinR;
      const py = cy + ex * sinR + ey * cosR;
      pts.push(transform ? transform(px, py) : { x: px, y: py });
    }
    return pts;
  }

  // Builds the procedural terrain tile paint list (nebulae + asteroid shapes),
  // in TILE-LOCAL pixel coordinates. `shapes[gx][gy]` is plain geometry data
  // computed by the composing core's single RNG source:
  // { seed, pts: [[x, y]…], ex, ey, erot }.
  function paintTerrain(cmd) {
    const { state, bp, gridSize, CP, FS, shapes } = cmd;
    const out = [];
    const originGx = (typeof cmd.originGx === "number") ? cmd.originGx : 0;
    const originGy = (typeof cmd.originGy === "number") ? cmd.originGy : 0;
    const gx0 = (typeof cmd.gx0 === "number") ? cmd.gx0 : 0;
    const gy0 = (typeof cmd.gy0 === "number") ? cmd.gy0 : 0;
    const gx1 = (typeof cmd.gx1 === "number") ? cmd.gx1 : gridSize;
    const gy1 = (typeof cmd.gy1 === "number") ? cmd.gy1 : gridSize;
    const ox = originGx * CP;
    const oy = originGy * CP;

    for (let gx = gx0; gx < gx1; gx++) {
      const col = state.terrain && state.terrain[gx];
      if (!col) continue;
      for (let gy = gy0; gy < gy1; gy++) {
        const t = col[gy];
        if (t !== "NEBULA" && t !== "ASTEROID") continue;
        const cx = (gx + 0.5) * CP - ox;
        const cy = (gy + 0.5) * CP - oy;

        if (t === "NEBULA") {
          out.push({
            op: "rect",
            x: gx * CP - ox, y: gy * CP - oy, w: CP, h: CP,
            fill: {
              gradient: {
                type: "radial",
                x0: cx, y0: cy, r0: 2, x1: cx, y1: cy, r1: CP * 1.15,
                stops: [[0, bp.neb0], [0.6, bp.neb1], [1, bp.neb2]]
              }
            }
          });
        } else if (t === "ASTEROID") {
          const shape = (shapes && shapes[gx] && shapes[gx][gy]) ? shapes[gx][gy] : null;
          if (!shape) continue;
          // The old code painted under translate(cx,cy) + rotate(seed·2π);
          // the rotation is baked into the geometry (and the gradient's end
          // points) here, so the executor needs no transform scope.
          const th = shape.seed * Math.PI * 2;
          const cosT = Math.cos(th), sinT = Math.sin(th);
          const toGlobal = (px, py) => ({
            x: cx + px * cosT - py * sinT,
            y: cy + px * sinT + py * cosT
          });

          const pts = shape.pts;
          const poly = [];
          for (let i = 0; i < pts.length; i++) poly.push(toGlobal(pts[i][0], pts[i][1]));

          const g0 = toGlobal(-8 * FS, -8 * FS);
          const g1 = toGlobal(8 * FS, 8 * FS);
          out.push({
            op: "path",
            points: poly,
            close: true,
            fill: {
              gradient: {
                type: "linear",
                x0: g0.x, y0: g0.y, x1: g1.x, y1: g1.y,
                stops: [[0, bp.rock0], [0.5, bp.rock1], [1, bp.rock2]]
              }
            },
            stroke: bp.rockStroke,
            lineWidth: 1.2 * FS
          });

          // Crater ellipse in the same rotated frame (flat translucent fill).
          out.push({
            op: "path",
            points: _ellipsePoints(shape.ex, shape.ey, 2.5 * FS, 1.8 * FS, shape.erot, toGlobal),
            close: true,
            fill: cmd.TC ? cmd.TC("rgba(0,0,0,0.3)") : "rgba(0,0,0,0.3)"
          });
        }
      }
    }
    return out;
  }

  function drawBattleGridAndTerrain(cmd) {
    const {
      visMatrix, state, bp, gridSize,
      CP, DX0, DX1, DY0, DY1
    } = cmd;
    const out = [];

    // 1. Batched grid lines (minor + major) (ISS-030) — one path per batch,
    // exactly the old stroke() batches (crossings composite once per batch).
    const minor = [];
    const major = [];
    for (let i = DX0; i <= DX1; i++) {
      const pos = i * CP;
      const dst = (i === 8 || i === 16 || i === 24) ? major : minor;
      dst.push({ x: pos, y: DY0 * CP, move: true }, { x: pos, y: DY1 * CP, move: true },
               { x: DX0 * CP, y: pos, move: true }, { x: DX1 * CP, y: pos, move: true });
    }
    out.push({ op: "path", points: minor, stroke: bp.gridMinor, lineWidth: 1 });
    out.push({ op: "path", points: major, stroke: bp.gridMajor, lineWidth: 1 });

    // 2. Batched coordinate ticks
    const ticks = [];
    for (let gx = 4; gx < gridSize; gx += 4) {
      if (gx < DX0 || gx >= DX1) continue;
      for (let gy = 4; gy < gridSize; gy += 4) {
        if (gy < DY0 || gy >= DY1) continue;
        const px = gx * CP, py = gy * CP;
        ticks.push({ x: px - 2, y: py, move: true }, { x: px + 2, y: py, move: true },
                   { x: px, y: py - 2, move: true }, { x: px, y: py + 2, move: true });
      }
    }
    out.push({ op: "path", points: ticks, stroke: bp.ticks, lineWidth: 1 });

    // 3. Cached procedural terrain (active visibility at 1.0 alpha, explored
    // memory at 0.45 alpha) (ISS-030, ISS-069). Tiles are referenced BY KEY;
    // the executor owns the tile canvases. Cells are disjoint, so the two
    // alpha classes batch like the old per-cell globalAlpha loop.
    const tiles = Array.isArray(cmd.terrainTiles) ? cmd.terrainTiles : null;
    const explored = state.exploredCells;
    const d = (typeof cmd.terrainDensity === "number" && cmd.terrainDensity > 0) ? cmd.terrainDensity : 1;
    if (tiles && tiles.length) {
      const visOps = [], memOps = [];
      for (let gx = DX0; gx < DX1; gx++) {
        const col = state.terrain && state.terrain[gx];
        if (!col) continue;
        for (let gy = DY0; gy < DY1; gy++) {
          const t = col[gy];
          if (t !== "NEBULA" && t !== "ASTEROID") continue;
          const isVis = Boolean(visMatrix[gx] && visMatrix[gx][gy]);
          const isExp = Boolean(explored && explored[gx] && explored[gx][gy]);
          if (!isVis && !isExp) continue;
          let tile = null;
          for (let i = 0; i < tiles.length; i++) {
            const cand = tiles[i];
            if (gx >= cand.gx0 && gx < cand.gx0 + cand.cellsX && gy >= cand.gy0 && gy < cand.gy0 + cand.cellsY) {
              tile = cand;
              break;
            }
          }
          if (!tile) continue;
          (isVis ? visOps : memOps).push({
            op: "image",
            sprite: "terrain:" + tile.key,
            sx: (gx - tile.originGx) * CP * d, sy: (gy - tile.originGy) * CP * d,
            sw: CP * d, sh: CP * d,
            dx: gx * CP, dy: gy * CP, dw: CP, dh: CP
          });
        }
      }
      if (visOps.length) out.push({ op: "group", alpha: 1.0, children: visOps });
      if (memOps.length) out.push({ op: "group", alpha: 0.45, children: memOps });
    }
    return out;
  }

  function drawBattleFog(cmd) {
    const { visMatrix, state, bp, CP, DX0, DX1, DY0, DY1, TC: rawTC } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);
    const explored = state && state.exploredCells;
    const out = [];

    // Fog fills over non-visible cells; the two alpha classes batch like the
    // old per-cell globalAlpha loop (cells are disjoint).
    const full = [], seen = [];
    for (let gx = DX0; gx < DX1; gx++) {
      for (let gy = DY0; gy < DY1; gy++) {
        if (visMatrix[gx][gy]) continue;
        const isExp = Boolean(explored && explored[gx] && explored[gx][gy]);
        (isExp ? seen : full).push({
          op: "rect", x: gx * CP, y: gy * CP, w: CP, h: CP, fill: bp.fogFill
        });
      }
    }
    if (full.length) out.push({ op: "group", alpha: 1.0, children: full });
    if (seen.length) out.push({ op: "group", alpha: 0.56, children: seen });

    // Batched diagonal hatch lines across all fogged cells (ISS-030) — one
    // stroke batch, exactly as before.
    const hatch = [];
    for (let gx = DX0; gx < DX1; gx++) {
      for (let gy = DY0; gy < DY1; gy++) {
        if (visMatrix[gx][gy]) continue;
        const rx = gx * CP, ry = gy * CP;
        hatch.push({ x: rx, y: ry + CP, move: true }, { x: rx + CP, y: ry, move: true });
      }
    }
    out.push({ op: "path", points: hatch, stroke: TC("rgba(255, 255, 255, 0.02)"), lineWidth: 1 });
    return out;
  }

  function drawMinimapBackground(cmd) {
    const { visMatrix, state, bp, gridSize, mmSize, cellPx, TC: rawTC } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);
    const explored = state && state.exploredCells;
    const out = [];

    // Background
    out.push({ op: "rect", x: 0, y: 0, w: mmSize, h: mmSize, fill: bp.bg });

    // Scanline texture
    for (let y = 0; y < mmSize; y += 3) {
      out.push({ op: "rect", x: 0, y: y, w: mmSize, h: 1, fill: TC("rgba(56, 189, 248, 0.02)") });
    }

    // Cells (terrain + explored memory + fog)
    for (let gx = 0; gx < gridSize; gx++) {
      for (let gy = 0; gy < gridSize; gy++) {
        const px = gx * cellPx, py = gy * cellPx;
        const visible = visMatrix[gx][gy];
        const isExp = Boolean(explored && explored[gx] && explored[gx][gy]);
        const terrain = state.terrain[gx][gy];

        if (!visible) {
          out.push({ op: "rect", x: px, y: py, w: cellPx, h: cellPx, fill: bp.fogFill });
          if (isExp && (terrain === "ASTEROID" || terrain === "NEBULA")) {
            if (terrain === "ASTEROID") {
              out.push({
                op: "group", alpha: 0.48, children: [
                  { op: "rect", x: px, y: py, w: cellPx, h: cellPx, fill: bp.mmRockOuter },
                  { op: "rect", x: px + cellPx * 0.20, y: py + cellPx * 0.20, w: cellPx * 0.60, h: cellPx * 0.60, fill: bp.mmRockInner }
                ]
              });
            } else {
              out.push({ op: "rect", x: px, y: py, w: cellPx, h: cellPx, fill: bp.neb0, alpha: 0.48 });
            }
          }
        } else if (terrain === "ASTEROID") {
          out.push({ op: "rect", x: px, y: py, w: cellPx, h: cellPx, fill: bp.mmRockOuter });
          out.push({ op: "rect", x: px + cellPx * 0.20, y: py + cellPx * 0.20, w: cellPx * 0.60, h: cellPx * 0.60, fill: bp.mmRockInner });
        } else if (terrain === "NEBULA") {
          out.push({ op: "rect", x: px, y: py, w: cellPx, h: cellPx, fill: bp.neb0 });
        }
      }
    }

    // Batched major grid lines on minimap
    const grid = [];
    for (let i = 8; i < gridSize; i += 8) {
      const pos = i * cellPx;
      grid.push({ x: pos, y: 0, move: true }, { x: pos, y: mmSize, move: true },
                { x: 0, y: pos, move: true }, { x: mmSize, y: pos, move: true });
    }
    out.push({ op: "path", points: grid, stroke: bp.gridMajor, lineWidth: 0.5 });
    return out;
  }

  // M3 campaign map: the red hyperspace field (Star Control 2-style).
  // Gravity wells are the only features; the field is dark from first paint
  // (screen-flash policy — no bright fills, the wells are the light).
  // cmd: { DS, map, colors } where map is the plain map DTO.
  function drawMapBackground(cmd) {
    const DS = cmd.DS;
    const map = cmd.map || {};
    const C = cmd.colors || {};
    const out = [];
    if (!DS) return out;

    out.push({
      op: "rect", x: 0, y: 0, w: DS, h: DS,
      fill: {
        gradient: {
          type: "radial",
          x0: DS / 2, y0: DS / 2, r0: DS * 0.08, x1: DS / 2, y1: DS / 2, r1: DS * 0.78,
          stops: [[0, C.hyperBg1 || "#2a0912"], [1, C.hyperBg0 || "#160509"]]
        }
      }
    });

    const span = map.span || 64;
    const scale = DS / span;
    const locs = map.locations || [];
    for (let i = 0; i < locs.length; i++) {
      const L = locs[i];
      const cx = (L.x - (map.x || 0)) * scale;
      const cy = (L.y - (map.y || 0)) * scale;
      const r = Math.max(6, (L.well || 6) * scale);

      out.push({
        op: "arc", cx: cx, cy: cy, r: r, start: 0, end: Math.PI * 2,
        fill: {
          gradient: {
            type: "radial",
            x0: cx, y0: cy, r0: 0, x1: cx, y1: cy, r1: r,
            stops: [
              [0, C.starGlow || "rgba(255, 180, 110, 0.30)"],
              [0.55, C.wellGlow || "rgba(255, 130, 90, 0.12)"],
              [1, "rgba(255, 130, 90, 0)"]
            ]
          }
        }
      });
      out.push({
        op: "arc", cx: cx, cy: cy, r: r, start: 0, end: Math.PI * 2,
        stroke: C.wellRing || "rgba(255, 150, 100, 0.55)",
        lineWidth: Math.max(1, r * 0.045)
      });

      const core = Math.max(3, r * 0.16);
      if (L.kind === "station") {
        out.push({ op: "rect", x: cx - core, y: cy - core, w: core * 2, h: core * 2, fill: C.station || "#7dd3fc" });
      } else if (L.kind === "nebula") {
        out.push({ op: "arc", cx: cx, cy: cy, r: core * 1.6, start: 0, end: Math.PI * 2, fill: C.nebula || "rgba(190, 110, 225, 0.75)" });
      } else {
        out.push({ op: "arc", cx: cx, cy: cy, r: core, start: 0, end: Math.PI * 2, fill: C.planet || "#f0a070" });
      }
    }
    return out;
  }

  // C5: one argument-dispatch surface; member names kept verbatim as op values.
  return function (cmd) {
    switch (cmd.op) {
      case "paintTerrain": return paintTerrain(cmd);
      case "drawBattleGridAndTerrain": return drawBattleGridAndTerrain(cmd);
      case "drawBattleFog": return drawBattleFog(cmd);
      case "drawMinimapBackground": return drawMinimapBackground(cmd);
      case "drawMapBackground": return drawMapBackground(cmd);
      default: throw new Error("buildBackgroundLayer: unknown op " + String(cmd && cmd.op));
    }
  };
})();
