"use strict";

// ============================================================
// OBJECT RENDERER — Sprite atlases, ship dynamic subsystems, sensors & tactical overlays.
// Privately registered with Graphics (graphics.js); exposes zero globals.
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

  const THEME_FILES = {
    default: "sprites_default.png",
    retro: "sprites_retro.png",
    alien: "sprites_alien.png"
  };

  // `baked` = { theme: dataURL } handed down by the parent (graphics.js); null falls back to files.
  function initBakedAtlases(atlasState, baked) {
    if (!atlasState) return;

    Object.keys(THEME_FILES).forEach(theme => {
      if (atlasState.images[theme]) return;
      const img = new Image();
      atlasState.images[theme] = img;
      const p = new Promise(resolve => {
        img.onload = () => {
          resolve(img);
        };
        img.onerror = () => {
          console.error("[S&D graphics] Failed to decode sprite atlas for theme \"" + theme + "\"; ships in this theme will not draw.");
          resolve(null);
        };
      });
      atlasState.readyPromises.push(p);
      img.src = (baked && baked[theme]) ? baked[theme] : THEME_FILES[theme];
    });
  }

  // Resolves once every theme atlas has decoded (or failed — failures resolve to null).
  function whenReady(atlasState) {
    return Promise.all((atlasState && Array.isArray(atlasState.readyPromises)) ? atlasState.readyPromises : []);
  }

  function railgunPulseOffset(nowMs, periodMs) {
    const P = periodMs || 1100;
    const u = (((nowMs % P) + P) % P) / P;
    return u < 0.5 ? u * 2 : 2 - u * 2;
  }

  function getSpriteSlice(unit, tKey, atlasImages, spriteConfig) {
    if (!unit || !atlasImages) return null;
    const cfg = spriteConfig || DEFAULT_SPRITE_CONFIG;
    const tilePx = cfg.tilePx || 106;
    const shipOrder = cfg.shipRows || DEFAULT_SPRITE_CONFIG.shipRows;
    const marineSentRow = cfg.marineSentRows || DEFAULT_SPRITE_CONFIG.marineSentRows;
    const sheet = atlasImages[tKey || "default"];
    if (!sheet) return null;
    const sentMarines = _hasFlag(unit, "#space marines") && _hasFlag(unit, "-sent boarding party");
    const row = (sentMarines && marineSentRow[unit.type] !== undefined)
      ? marineSentRow[unit.type]
      : shipOrder.indexOf(unit.type);
    if (row < 0) return null;
    const col = (unit.team === 2 ? 4 : 0)
              | (_hasFlag(unit, "-moved") ? 2 : 0)
              | (_hasFlag(unit, "-attacked") ? 1 : 0);
    return {
      sheet,
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

  function blitSprite(ctx, sprite, cx, cy, targetCellPx) {
    if (!sprite || !sprite.sheet) return;
    const lw = Math.ceil(targetCellPx * 2.2);
    const lh = Math.ceil(targetCellPx * 2.2);
    ctx.drawImage(sprite.sheet, sprite.sx, sprite.sy, sprite.sw, sprite.sh, cx - lw / 2, cy - lh / 2, lw, lh);
  }

  function drawUnitStatic(ctx, cx, cy, cellPx, unit, tKey, atlasImages, spriteConfig) {
    const slice = getSpriteSlice(unit, tKey, atlasImages, spriteConfig);
    if (slice) blitSprite(ctx, slice, cx, cy, cellPx);
  }

  function _plumeTri(ctx, xN, pyPx, R, len, color, flicker, halfWidthR, TC) {
    if (!(len > 0.5)) return;
    const hw = (halfWidthR || 0.09) * R;
    const grad = ctx.createLinearGradient(xN, 0, xN - len, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(1, TC("rgba(0,0,0,0)"));
    ctx.save();
    ctx.globalAlpha = flicker;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xN, pyPx - hw);
    ctx.lineTo(xN - len, pyPx);
    ctx.lineTo(xN, pyPx + hw);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawUnitDynamic(ctx, cx, cy, cellPx, unit, now, bp, shipSpecs, lodCellPx, rawTC) {
    const TC = typeof rawTC === "function" ? rawTC : (c => c);
    const spec = (shipSpecs && unit) ? shipSpecs[unit.type] : null;
    if (!spec || !bp) return;
    const lodPx = lodCellPx || cellPx;
    const R = (cellPx * 0.5) * 0.85;
    const rot = unit.team === 1 ? 0 : Math.PI;
    const isMoved = _hasFlag(unit, "-moved");
    const isAttacked = _hasFlag(unit, "-attacked");

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    // D1: Engine plumes
    if (!isMoved && spec.plumes && spec.plumes.length > 0) {
      const pl = bp.plumeSpec;
      const P = bp.plume[unit.team === 1 ? 1 : 2];
      const flicker = pl.flickerBase + pl.flickerAmp * Math.sin(now * pl.flickerFreq + cx * pl.flickerSpatial);
      const baseLen = (pl.baseLenR + pl.lenAmpR * Math.sin(now * pl.lenFreq)) * R;
      const xN = pl.nozzleX * R;
      const coreR = Math.max(pl.minCoreRadiusPx, R * pl.coreRadiusR);

      for (let i = 0; i < spec.plumes.length; i++) {
        const py = spec.plumes[i];
        const phase = now * pl.phaseFreq + i * pl.phaseStep;
        const len = baseLen * (pl.phaseBase + pl.phaseAmp * Math.sin(phase));
        const pyPx = py * R;

        _plumeTri(ctx, xN, pyPx, R, len, P.outer, flicker, pl.halfWidthR, TC);
        _plumeTri(ctx, xN, pyPx, R, len * pl.midLenScale, P.mid, flicker, pl.halfWidthR, TC);
        ctx.fillStyle = P.inner;
        ctx.fillRect(xN - len * pl.innerLenScale, pyPx - pl.innerHeightPx / 2, len * pl.innerLenScale, pl.innerHeightPx);
        ctx.fillStyle = P.core;
        ctx.beginPath();
        ctx.arc(xN, pyPx, coreR, 0, TAU);
        ctx.fill();
      }
    }

    // D2: Railgun pulse
    if (!isAttacked && spec.railgunTier > 0 && lodPx >= 28) {
      const rp = bp.rail;
      const tier = spec.railgunTier;
      const x0 = tier === 1 ? -0.50 * R : -0.78 * R;
      const gunLen = tier === 1 ? 1.46 * R : 1.86 * R;
      const halfH = tier === 1 ? 0.10 * R : 0.21 * R;
      const chanH = halfH * 0.44;
      const seg = gunLen * rp.segmentScale;

      const tri = railgunPulseOffset(now, rp.periodMs);
      const e = tri < 0.5 ? 2 * tri * tri : 1 - Math.pow(-2 * tri + 2, 2) / 2;
      const px = x0 + e * (gunLen - seg);

      const glow = ctx.createLinearGradient(px, 0, px + seg, 0);
      glow.addColorStop(0, rp.glowZero);
      glow.addColorStop(0.5, rp.glow);
      glow.addColorStop(1, rp.glowZero);
      ctx.fillStyle = glow;
      ctx.fillRect(px, -chanH * rp.glowHeightScale, seg, chanH * rp.glowHeightScale * 2);

      const hot = ctx.createLinearGradient(px, 0, px + seg, 0);
      hot.addColorStop(0, rp.hotZero);
      hot.addColorStop(0.5, rp.core);
      hot.addColorStop(1, rp.hotZero);
      ctx.fillStyle = hot;
      ctx.fillRect(px, -chanH * rp.coreHeightScale, seg, chanH * rp.coreHeightScale * 2);
    }

    // D3: Animated shield bubble
    if (_hasFlag(unit, "+shield")) {
      const sb = bp.shield;
      const pulse = sb.pulseBase + sb.pulseAmp * Math.sin(now * sb.pulseFreq);
      const sRad = R * sb.radiusScale * pulse;
      const outG = sb.outerGradScale;

      const shieldGrad = ctx.createRadialGradient(0, 0, sRad * sb.innerGradScale, 0, 0, sRad * outG);
      shieldGrad.addColorStop(0, sb.gradStop0);
      shieldGrad.addColorStop(0.8, sb.gradStopMid);
      shieldGrad.addColorStop(1, sb.gradStop1);
      ctx.fillStyle = shieldGrad;
      ctx.beginPath();
      ctx.arc(0, 0, sRad * outG, 0, TAU);
      ctx.fill();

      const vCount = sb.vertices;
      ctx.beginPath();
      for (let i = 0; i < vCount; i++) {
        const a = (i * TAU) / vCount + now * sb.rotFreq;
        const wobble = 1 + sb.wobbleAmp * Math.sin(now * sb.wobbleFreq + i * sb.wobblePhaseStep);
        const vx = Math.cos(a) * sRad * wobble;
        const vy = Math.sin(a) * sRad * wobble;
        if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.strokeStyle = sb.strokeColor;
      ctx.lineWidth = sb.lineWidth;
      ctx.stroke();

      const ns = sb.nodeSize;
      const nh = ns / 2;
      ctx.fillStyle = sb.nodeColor;
      for (let i = 0; i < vCount; i++) {
        const a = (i * TAU) / vCount + now * sb.rotFreq;
        const wobble = 1 + sb.wobbleAmp * Math.sin(now * sb.wobbleFreq + i * sb.wobblePhaseStep);
        ctx.fillRect(Math.cos(a) * sRad * wobble - nh, Math.sin(a) * sRad * wobble - nh, ns, ns);
      }
    }

    ctx.restore();

    // D4: HP badge
    if (lodPx >= 18 && unit.maxHp > 1) {
      const hb = bp.hpBadge;
      const s = cellPx / 24;
      ctx.fillStyle = hb.bgColor;
      ctx.fillRect(cx + 1 * s, cy + 3 * s, 11 * s, 8 * s);
      ctx.font = `bold ${Math.max(6, Math.round(8 * s))}px monospace`;
      ctx.fillStyle = unit.hp < unit.maxHp ? hb.damagedColor : hb.healthyColor;
      ctx.fillText(String(unit.hp), cx + 2 * s, cy + 10 * s);
    }

    // D5: !flagship command insignia (gold command ring + top-left crown star badge)
    if (_hasFlag(unit, "!flagship")) {
      const s = cellPx / 24;
      ctx.save();
      ctx.strokeStyle = bp.gold;
      ctx.lineWidth = Math.max(1, 1.3 * s);
      ctx.setLineDash([3 * s, 2 * s]);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.18, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      const bx = cx - 9 * s;
      const by = cy - 9 * s;
      const br = Math.max(2.2, 3.2 * s);
      ctx.fillStyle = TC("#06080e");
      ctx.beginPath();
      ctx.arc(bx, by, br + 1.1 * s, 0, TAU);
      ctx.fill();

      ctx.fillStyle = bp.gold;
      ctx.beginPath();
      ctx.moveTo(bx, by - br);
      ctx.lineTo(bx + br * 0.85, by);
      ctx.lineTo(bx, by + br);
      ctx.lineTo(bx - br * 0.85, by);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBattleWarpArcs(cmd) {
    const {
      ctx, state, CP, TS, DX0, DX1, DY0, DY1,
      spawnRadius, gridToCenter, isUnitSpottedByTeam, fontHelper, TC: rawTC
    } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    state.units.forEach(u => {
      if (u.hp <= 0 || !_hasFlag(u, "#capital ship")) return;
      if (u.team === 2 && !isUnitSpottedByTeam(u, 1)) return;
      const margin = spawnRadius + 1;
      if (u.x < DX0 - margin || u.x > DX1 + margin || u.y < DY0 - margin || u.y > DY1 + margin) return;
      const c = gridToCenter(u.x, u.y);
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
    const {
      ctx, now, state, bp, theme, shipSpecs, CP, lodCellPx, DX0, DX1, DY0, DY1,
      gridToCenter, getUnitAt, getEffectiveScan, isUnitSpottedByTeam,
      atlasImages, spriteConfig, TC: rawTC
    } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);

    // LAYER 2: Sensor circles
    state.units.forEach(u => {
      if (u.hp <= 0 || u.team !== 1) return;
      const effScan = getEffectiveScan(u);
      if (effScan <= 0) return;
      if (u.x + effScan < DX0 || u.x - effScan > DX1 || u.y + effScan < DY0 || u.y - effScan > DY1) return;
      const c = gridToCenter(u.x, u.y);
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
      const selUnit = getUnitAt(state.selectedCell.x, state.selectedCell.y);
      if (selUnit && selUnit.team === 1 &&
          selUnit.x >= DX0 - 1 && selUnit.x <= DX1 &&
          selUnit.y >= DY0 - 1 && selUnit.y <= DY1) {
        const effScan = getEffectiveScan(selUnit);
        if (effScan > 0) {
          const c = gridToCenter(selUnit.x, selUnit.y);
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
      const p1 = gridToCenter(vec.from.x, vec.from.y);
      const p2 = gridToCenter(vec.to.x, vec.to.y);
      if (vec.kind === "move") { ctx.setLineDash([2, 4]); ctx.strokeStyle = TC("rgba(244, 63, 94, 0.45)"); }
      else if (vec.kind === "shoot") { ctx.setLineDash([5, 3]); ctx.strokeStyle = TC("rgba(254, 72, 26, 0.7)"); }
      else if (vec.kind === "capture") { ctx.setLineDash([3, 3]); ctx.strokeStyle = TC("rgba(250, 204, 21, 0.75)"); }
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });
    ctx.restore();

    // LAYER 3: Ships
    const glidingIds = new Set(
      state.animations.filter(a => a.kind === "glide" && (now - a.start) < a.duration).map(a => a.unitId)
    );
    state.units.forEach(u => {
      if (u.hp <= 0) return;
      if (glidingIds.has(u.id)) return;
      if (!isUnitSpottedByTeam(u, 1)) return;
      if (u.x < DX0 - 1 || u.x > DX1 || u.y < DY0 - 1 || u.y > DY1) return;
      const c = gridToCenter(u.x, u.y);
      const sprite = getSpriteSlice(u, theme, atlasImages, spriteConfig);
      blitSprite(ctx, sprite, c.x, c.y, CP);
      drawUnitDynamic(ctx, c.x, c.y, CP, u, now, bp, shipSpecs, lodCellPx, TC);
    });
  }

  function drawBattleTacticalOverlays(cmd) {
    const {
      ctx, state, bp, CP, FS,
      gridToCenter, fontHelper, TC: rawTC
    } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);

    const ov = state && state.tacticalOverlays;
    if (!ov || !ov.active) return;

    const cA = gridToCenter(ov.originX, ov.originY);
    const cells = Array.isArray(ov.cells) ? ov.cells : [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const gx = cell.gx, gy = cell.gy;
      const rx = gx * CP, ry = gy * CP;
      const cB = gridToCenter(gx, gy);

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
      const cB = gridToCenter(ml.toX, ml.toY);
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
    const { ctx, state, bp, cellPx, isUnitSpottedByTeam } = cmd;
    state.units.forEach(u => {
      if (u.hp <= 0) return;
      if (!isUnitSpottedByTeam(u, 1)) return;
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
    initAtlases: initBakedAtlases,
    whenReady,
    railgunPulseOffset,
    spriteKey,
    getSpriteSlice,
    blitSprite,
    drawUnitStatic,
    drawUnitDynamic,
    drawBattleWarpArcs,
    drawBattleObjects,
    drawBattleTacticalOverlays,
    drawMinimapUnits
  });
})();
