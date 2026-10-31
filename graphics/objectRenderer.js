"use strict";
// ============================================================
// OBJECT RENDERER — Sprite-slice queries, warp arcs, sensors,
// historical vectors & tactical overlays. Pure data in / pixels
// out: it never touches document, never loads images, and never
// draws another layer's work. Privately registered with Graphics
// (graphics.js); exposes zero globals.
// ============================================================
(() => {
  const _hasFlag = (u, f) => Boolean(u && u.flags && (typeof u.flags.has === "function" ? u.flags.has(f) : Array.isArray(u.flags) && u.flags.includes(f)));

  const TAU = Math.PI * 2;
  const DEFAULT_SPRITE_CONFIG = {
    tilePx: 106,
    shipRows: [
      "Shuttle", "Fighter", "Probe", "Bomber", "Boarding APC",
      "Attack Frigate", "Missile Frigate", "Attack Destroyer", "Railgun Destroyer", "Missile Destroyer",
      "Light Cruiser", "Railgun Cruiser", "Heavy Cruiser", "Missile Cruiser",
      "Battlecruiser", "Missile Battleship", "Battleship", "Flagship Battlecruiser"
    ],
    marineSentRows: {
      "Boarding APC": 18,
      "Missile Battleship": 19,
      "Battleship": 20
    }
  };

  // ---- Plain-data helpers (local re-implementations over frame data) -------
  const _cellCenter = (gx, gy, CP) => ({ x: (gx + 0.5) * CP, y: (gy + 0.5) * CP });
  const _spottedBy = (u, team) => Boolean(u && (u.team === team || u.spottedByPlayer));
  const _effScanOf = u => (u && typeof u.effectiveScan === "number") ? u.effectiveScan : (u ? (u.scan || 0) : 0);
  const _unitAt = (state, gx, gy) => {
    const units = (state && Array.isArray(state.units)) ? state.units : [];
    return units.find(u => u && u.hp > 0 && u.x === gx && u.y === gy) || null;
  };

  // Pure data query: numeric sprite-slice descriptor + sheet key. No live
  // Image handles — the parent resolves sheetKey to the atlas Image itself.
  function getSpriteSlice(unit, tKey, spriteConfig) {
    if (!unit) return null;
    const cfg = spriteConfig || DEFAULT_SPRITE_CONFIG;
    const tilePx = cfg.tilePx || 106;
    const shipOrder = cfg.shipRows || DEFAULT_SPRITE_CONFIG.shipRows;
    const marineSentRow = cfg.marineSentRows || DEFAULT_SPRITE_CONFIG.marineSentRows;
    const sentMarines = _hasFlag(unit, "#space marines") && _hasFlag(unit, "-sent boarding party");
    const row = (sentMarines && marineSentRow[unit.type] !== undefined)
      ? marineSentRow[unit.type]
      : shipOrder.indexOf(unit.type);
    if (row < 0) return null;
    const col = (unit.team === 2 ? 4 : 0)
              | (_hasFlag(unit, "-moved") ? 2 : 0)
              | (_hasFlag(unit, "-attacked") ? 1 : 0);
    return {
      sheetKey: tKey || "default",
      sx: col * tilePx,
      sy: row * tilePx,
      sw: tilePx,
      sh: tilePx
    };
  }

  function spriteKey(unit, cellPx, tKey) {
    const flags = (unit && unit.flags) ? [...unit.flags].sort().join("|") : "";
    return `${tKey || "default"}_${unit ? unit.type : ""}_${unit ? unit.team : 0}_${flags}_${cellPx}`;
  }

  function drawBattleWarpArcs(cmd) {
    const {
      ctx, state, CP, TS, DX0, DX1, DY0, DY1,
      spawnRadius, fontHelper, TC: rawTC
    } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    state.units.forEach(u => {
      if (u.hp <= 0 || !_hasFlag(u, "#capital ship")) return;
      if (u.team === 2 && !_spottedBy(u, 1)) return;
      const margin = spawnRadius + 1;
      if (u.x < DX0 - margin || u.x > DX1 + margin || u.y < DY0 - margin || u.y > DY1 + margin) return;
      const c = _cellCenter(u.x, u.y, CP);
      const radPx = spawnRadius * CP;
      const isSelected = state.selectedCell && state.selectedCell.x === u.x && state.selectedCell.y === u.y;
      ctx.strokeStyle = u.team === 1
        ? (isSelected ? TC("rgba(56, 189, 248, 0.38)") : TC("rgba(56, 189, 248, 0.18)"))
        : TC("rgba(244, 63, 94, 0.22)");
      ctx.beginPath();
      ctx.arc(c.x, c.y, radPx, 0, TAU);
      ctx.stroke();
      if (u.team === 1 && isSelected) {
        ctx.font = fontHelper(null, 9);
        ctx.fillStyle = TC("rgba(56, 189, 248, 0.45)");
        ctx.fillText("T1 WARP PERIMETER [R:6]", Math.max(6 * TS, c.x - 68 * TS), Math.max(12 * TS, c.y - radPx - 4 * TS));
      }
    });
    ctx.restore();
  }

  function drawBattleObjects(cmd) {
    const { ctx, now, state, bp, CP, DX0, DX1, DY0, DY1, TC: rawTC } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);

    // LAYER 2: Sensor circles
    state.units.forEach(u => {
      if (u.hp <= 0 || u.team !== 1) return;
      const effScan = _effScanOf(u);
      if (effScan <= 0) return;
      if (u.x + effScan < DX0 || u.x - effScan > DX1 || u.y + effScan < DY0 || u.y - effScan > DY1) return;
      const c = _cellCenter(u.x, u.y, CP);
      ctx.fillStyle = bp.sensorFill;
      ctx.strokeStyle = bp.sensorStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, effScan * CP, 0, TAU);
      ctx.fill();
      ctx.stroke();
    });

    // Radar wedge
    if (state.selectedCell) {
      const selUnit = _unitAt(state, state.selectedCell.x, state.selectedCell.y);
      if (selUnit && selUnit.team === 1 &&
          selUnit.x >= DX0 - 1 && selUnit.x <= DX1 &&
          selUnit.y >= DY0 - 1 && selUnit.y <= DY1) {
        const effScan = _effScanOf(selUnit);
        if (effScan > 0) {
          const c = _cellCenter(selUnit.x, selUnit.y, CP);
          const angle = (now * 0.002) % TAU;
          ctx.fillStyle = bp.wedgeFill;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.arc(c.x, c.y, effScan * CP, angle, angle + (15 * Math.PI) / 180);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Historical vectors
    ctx.save();
    ctx.lineWidth = 1.5;
    state.historicalVectors.forEach(vec => {
      const inView = p => p.x >= DX0 - 1 && p.x <= DX1 && p.y >= DY0 - 1 && p.y <= DY1;
      if (!inView(vec.from) && !inView(vec.to)) return;
      const p1 = _cellCenter(vec.from.x, vec.from.y, CP);
      const p2 = _cellCenter(vec.to.x, vec.to.y, CP);
      if (vec.kind === "move") { ctx.setLineDash([2, 4]); ctx.strokeStyle = TC("rgba(244, 63, 94, 0.45)"); }
      else if (vec.kind === "shoot") { ctx.setLineDash([5, 3]); ctx.strokeStyle = TC("rgba(254, 72, 26, 0.7)"); }
      else if (vec.kind === "capture") { ctx.setLineDash([3, 3]); ctx.strokeStyle = TC("rgba(250, 204, 21, 0.75)"); }
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });
    ctx.restore();

    // (Ships are drawn by the parent's own ship renderer, after this call.)
  }

  function drawBattleTacticalOverlays(cmd) {
    const {
      ctx, state, bp, CP, FS,
      fontHelper, TC: rawTC
    } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);

    const ov = state && state.tacticalOverlays;
    if (!ov || !ov.active) return;

    const cA = _cellCenter(ov.originX, ov.originY, CP);
    const cells = Array.isArray(ov.cells) ? ov.cells : [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const gx = cell.gx, gy = cell.gy;
      const rx = gx * CP, ry = gy * CP;
      const cB = _cellCenter(gx, gy, CP);

      if (cell.canMove) {
        ctx.strokeStyle = bp.moveBox;
        ctx.lineWidth = 1;
        const m3 = 3 * FS, m18 = 18 * FS, m2 = 2 * FS;
        ctx.strokeRect(rx + m3, ry + m3, m18, m18);
        const ang = Math.atan2(cB.y - cA.y, cB.x - cA.x);
        ctx.save();
        ctx.translate(cB.x, cB.y);
        ctx.rotate(ang);
        ctx.strokeStyle = bp.moveArrow;
        ctx.beginPath();
        ctx.moveTo(-m3, -m3);
        ctx.lineTo(m2, 0);
        ctx.lineTo(-m3, m3);
        ctx.stroke();
        ctx.restore();
      }

      if (cell.canShoot) {
        if (cell.spottedEnemyDmg !== null && cell.spottedEnemyDmg !== undefined) {
          ctx.strokeStyle = TC("#fe481a");
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(rx + 12 * FS, ry + 2 * FS);
          ctx.lineTo(rx + 22 * FS, ry + 12 * FS);
          ctx.lineTo(rx + 12 * FS, ry + 22 * FS);
          ctx.lineTo(rx + 2 * FS, ry + 12 * FS);
          ctx.closePath();
          ctx.stroke();
          ctx.font = fontHelper("bold", 9);
          ctx.fillStyle = TC("#fe481a");
          ctx.fillText(String(cell.spottedEnemyDmg), rx + 15 * FS, ry + 21 * FS);
        } else if (cell.isHovered) {
          // Show potential firepower readout on hovered cell only (ISS-048)
          ctx.font = fontHelper("bold", 8);
          ctx.fillStyle = TC("rgba(254, 72, 26, 0.85)");
          ctx.fillText(String(cell.firepower), rx + 15 * FS, ry + 21 * FS);
        } else {
          // Subtle weapon-range reticle dot on empty/unoccupied cells to avoid numeric clutter (ISS-048)
          ctx.fillStyle = TC("rgba(254, 72, 26, 0.26)");
          ctx.fillRect(rx + 19 * FS, ry + 19 * FS, Math.max(1.5, 2 * FS), Math.max(1.5, 2 * FS));
        }
      }

      if (cell.canCapture) {
        ctx.font = fontHelper("bold", 10);
        ctx.fillStyle = TC("#000000"); ctx.fillText("C", rx + 3 * FS, ry + 10 * FS);
        ctx.fillStyle = TC("#ffffff"); ctx.fillText("C", rx + 2 * FS, ry + 9 * FS);
      }

      if (cell.canShield) {
        ctx.font = fontHelper("bold", 10);
        ctx.fillStyle = TC("#000000"); ctx.fillText("S", rx + 16 * FS, ry + 10 * FS);
        ctx.fillStyle = TC("#ffffff"); ctx.fillText("S", rx + 15 * FS, ry + 9 * FS);
      }
    }

    if (ov.hoveredMoveLine) {
      const ml = ov.hoveredMoveLine;
      const cB = _cellCenter(ml.toX, ml.toY, CP);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = bp.accent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cA.x, cA.y);
      ctx.lineTo(cB.x, cB.y);
      ctx.stroke();
      ctx.restore();
      ctx.font = fontHelper(null, 9);
      ctx.fillStyle = bp.accent;
      ctx.fillText(`D:${ml.dist.toFixed(1)}`, cB.x + 6 * FS, cB.y - 6 * FS);
    }
  }

  function drawMinimapUnits(cmd) {
    const { ctx, state, bp, cellPx } = cmd;
    state.units.forEach(u => {
      if (u.hp <= 0) return;
      if (!_spottedBy(u, 1)) return;
      const px = u.x * cellPx + cellPx / 2;
      const py = u.y * cellPx + cellPx / 2;
      const hull = bp.hull[u.team === 1 ? 1 : 2];
      if (_hasFlag(u, "!flagship")) {
        const rf = Math.max(2.6, cellPx * 0.52);
        ctx.fillStyle = hull.lit;
        ctx.beginPath();
        ctx.moveTo(px, py - rf);
        ctx.lineTo(px + rf, py);
        ctx.lineTo(px, py + rf);
        ctx.lineTo(px - rf, py);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = bp.gold;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        const r = Math.max(1.5, cellPx * 0.28);
        ctx.fillStyle = hull.lit;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = hull.dark;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    });
  }

  Graphics._registerLayer("object", {
    spriteKey,
    getSpriteSlice,
    drawBattleWarpArcs,
    drawBattleObjects,
    drawBattleTacticalOverlays,
    drawMinimapUnits
  });
})();
