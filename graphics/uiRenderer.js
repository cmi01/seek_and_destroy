"use strict";

// ============================================================
// UI RENDERER — Full canvas HUD, minimap composite, telemetry cards,
// priority banner, intel overlay, modals (Bridge, Campaign, Endgame),
// and interactive canvas buttons (driven by state.buttonHovered).
// Privately registered with Graphics (graphics.js); exposes zero globals.
// ============================================================
(() => {
  const _hasFlag = (u, f) => Boolean(u && u.flags && (typeof u.flags.has === "function" ? u.flags.has(f) : Array.isArray(u.flags) && u.flags.includes(f)));

  // ---- Pure plain-data helpers (local re-implementations over frame data) ----
  const _cellCenter = (gx, gy, CP) => ({ x: (gx + 0.5) * CP, y: (gy + 0.5) * CP });
  const _spottedBy = (u, team) => Boolean(u && (u.team === team || u.spottedByPlayer));
  const _effScanOf = u => (u && typeof u.effectiveScan === "number") ? u.effectiveScan : (u ? (u.scan || 0) : 0);
  const _unitAt = (state, gx, gy) => {
    const units = (state && Array.isArray(state.units)) ? state.units : [];
    return units.find(u => u && u.hp > 0 && u.x === gx && u.y === gy) || null;
  };

  function _drawChamferedRect(ctx, x, y, w, h, cut) {
    const c = Math.max(0, Math.min(cut, w * 0.4, h * 0.4));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.closePath();
  }

  function _wrapTextLines(ctx, text, maxWidth) {
    const raw = String(text || "");
    if (!raw) return [];
    const words = raw.split(/\s+/);
    const lines = [];
    let current = "";
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const test = current ? (current + " " + w) : w;
      if (ctx.measureText(test).width <= maxWidth || !current) {
        current = test;
      } else {
        lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function _fitTextToWidth(ctx, text, maxWidth) {
    const s = String(text || "");
    if (!s || maxWidth <= 0) return "";
    if (ctx.measureText(s).width <= maxWidth) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(s.slice(0, mid) + "…").width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return lo > 0 ? (s.slice(0, lo) + "…") : "";
  }

  function _drawOscilloscopeBox(ctx, x, y, w, h, uiHud, bp, C) {
    ctx.save();
    ctx.fillStyle = C["#06040b"];
    ctx.strokeStyle = (uiHud && uiHud.radioActive) ? C["#c084fc"] : C["rgba(148, 163, 184, 0.4)"];
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    const wave = (uiHud && uiHud.scopeWave) ? uiHud.scopeWave : null;
    ctx.strokeStyle = (uiHud && uiHud.radioActive) ? C["#c084fc"] : bp.accent;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const n = (wave && wave.length) ? wave.length : 32;
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const px = x + 2 + t * (w - 4);
      const v = wave ? wave[i] : 0;
      const py = y + h * 0.5 + v * (h * 0.40);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function _drawButtonWidget(ctx, b, hoveredId, pressedId, bp, US, F, C) {
    const isHovered = (hoveredId === b.id);
    const isPressed = (pressedId === b.id);
    const cut = Math.max(3, Math.round(5 * US));

    ctx.save();
    ctx.font = F["bold:7"];
    ctx.textBaseline = "middle";
    _drawChamferedRect(ctx, b.x, b.y, b.w, b.h, cut);

    if (!b.enabled) {
      ctx.fillStyle = C["rgba(6, 8, 14, 0.72)"];
      ctx.strokeStyle = C["rgba(148, 163, 184, 0.25)"];
      ctx.lineWidth = 1;
    } else if (isPressed) {
      ctx.fillStyle = bp.gold;
      ctx.strokeStyle = C["#ffffff"];
      ctx.lineWidth = 1.5;
    } else if (isHovered) {
      ctx.fillStyle = bp.accent;
      ctx.strokeStyle = bp.gold;
      ctx.shadowColor = bp.accent;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
    } else if (b.active) {
      ctx.fillStyle = C["rgba(15, 23, 42, 0.90)"];
      ctx.strokeStyle = bp.gold;
      ctx.lineWidth = 1.2;
    } else {
      ctx.fillStyle = C["rgba(6, 8, 14, 0.88)"];
      ctx.strokeStyle = bp.accent;
      ctx.lineWidth = 1;
    }

    ctx.fill();
    ctx.stroke();
    ctx.clip();

    const pipSize = Math.max(3, Math.round(4 * US));
    ctx.fillStyle = !b.enabled
      ? C["rgba(148, 163, 184, 0.35)"]
      : ((isHovered || isPressed) ? C["#06080e"] : (b.active ? bp.gold : bp.accent));
    ctx.fillRect(b.x + Math.round(6 * US), b.y + (b.h - pipSize) * 0.5, pipSize, pipSize);

    ctx.fillStyle = !b.enabled
      ? C["rgba(148, 163, 184, 0.45)"]
      : ((isHovered || isPressed) ? C["#06080e"] : (b.active ? bp.gold : C["#e2e8f0"]));
    ctx.fillText(b.label, b.x + Math.round(13 * US), b.y + b.h * 0.5 + 0.5);
    ctx.restore();
  }

  function _drawTopLeftHudBar(ctx, state, uiHud, bp, DS, US, leftMaxW, F, C) {
    const pad = Math.max(8, Math.round(10 * US));
    const barW = Math.max(180, Math.min(Math.round(334 * US), leftMaxW));
    const barH = Math.max(44, Math.round(50 * US));
    const cut = Math.max(4, Math.round(6 * US));
    const isAI = state.activeTeam !== 1;

    ctx.save();
    _drawChamferedRect(ctx, pad, pad, barW, barH, cut);
    ctx.fillStyle = C["rgba(6, 8, 14, 0.88)"];
    ctx.strokeStyle = isAI ? bp.hostile : bp.accent;
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    ctx.clip();

    // Left accent stripe
    ctx.fillStyle = isAI ? bp.hostile : bp.accent;
    ctx.fillRect(pad, pad, Math.max(2, Math.round(3 * US)), barH);

    const textX = pad + Math.round(9 * US);
    ctx.textBaseline = "top";

    const oscW = Math.max(38, Math.round(54 * US));
    const oscH = Math.max(11, Math.round(13 * US));
    const hasOsc = barW > 240 * US;
    if (hasOsc) {
      _drawOscilloscopeBox(ctx, pad + barW - oscW - Math.round(7 * US), pad + Math.round(5 * US), oscW, oscH, uiHud, bp, C);
    }

    // Row 1: Level tag
    ctx.font = F["bold:7"];
    ctx.fillStyle = C["#c084fc"];
    const lvlTag = (uiHud && uiHud.levelTag) ? uiHud.levelTag : `SECTOR ${state.levelId}`;
    const row1MaxW = hasOsc ? (barW - oscW - Math.round(22 * US)) : (barW - Math.round(16 * US));
    ctx.fillText(_fitTextToWidth(ctx, lvlTag, row1MaxW), textX, pad + Math.round(5 * US));

    // Row 2: Turn + AP pips + Credits
    const row2Y = pad + Math.round(20 * US);
    ctx.font = F["bold:7"];
    ctx.fillStyle = isAI ? bp.hostile : bp.accent;
    const turnStr = `T${String(state.turnNumber).padStart(2, "0")} ${isAI ? "AI" : "BLUE"}`;
    ctx.fillText(turnStr, textX, row2Y);

    // AP pips
    const apX = textX + Math.round(62 * US);
    const maxAp = state.maxAp || 4;
    ctx.fillStyle = C["#94a3b8"];
    ctx.fillText("AP:", apX, row2Y);
    for (let i = 0; i < maxAp; i++) {
      ctx.fillStyle = i < state.ap ? bp.accent : C["#334155"];
      ctx.fillText("◆", apX + Math.round((22 + i * 9) * US), row2Y);
    }

    // Credits & Income
    const credX = apX + Math.round((24 + maxAp * 9 + 8) * US);
    const credits = (state.credits && state.credits[1] !== undefined) ? state.credits[1] : 0;
    const income = (state.income && state.income[1] !== undefined) ? state.income[1] : 0;
    ctx.fillStyle = bp.gold;
    const credStr = `${credits}ⒸB`;
    ctx.fillText(credStr, credX, row2Y);
    const credW = ctx.measureText(credStr).width;
    ctx.fillStyle = C["#34d399"];
    ctx.font = F["regular:6"];
    ctx.fillText(`+${income}/T`, credX + credW + Math.round(5 * US), row2Y + Math.round(1 * US));

    // Row 3: Compact controls hint
    const row3Y = pad + Math.round(35 * US);
    ctx.font = F["regular:6"];
    ctx.fillStyle = C["#94a3b8"];
    ctx.fillText(_fitTextToWidth(ctx, "[LMB]ACT [WASD]PAN [WHL]ZOOM [SPC]SHOP [I]INFO", barW - Math.round(16 * US)), textX, row3Y);

    ctx.restore();
    return { x: pad, y: pad, w: barW, h: barH };
  }

  function _drawMinimapOnBattleCanvas(ctx, minimapCanvas, metrics, uiHud, bp, DS, US, F, C) {
    if (!minimapCanvas || !metrics) return null;
    const pad = Math.max(8, Math.round(10 * US));
    const mmSize = metrics.minimapSize || 120;
    const x = pad;
    const y = DS - mmSize - pad;

    ctx.save();
    ctx.fillStyle = C["rgba(6, 8, 14, 0.92)"];
    ctx.strokeStyle = bp.accent;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, mmSize, mmSize);
    ctx.drawImage(minimapCanvas, x + 1, y + 1, mmSize - 2, mmSize - 2);
    ctx.strokeRect(x + 0.5, y + 0.5, mmSize - 1, mmSize - 1);

    // Header label strip
    const lblH = Math.max(12, Math.round(14 * US));
    ctx.fillStyle = C["rgba(6, 8, 14, 0.82)"];
    ctx.fillRect(x + 1, y + 1, mmSize - 2, lblH);
    ctx.font = `${Math.max(7, Math.round(7.5 * US))}px monospace`;
    ctx.fillStyle = bp.accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lbl = (uiHud && uiHud.minimapLabel) ? uiHud.minimapLabel : "MINIMAP // 32×32";
    ctx.fillText(_fitTextToWidth(ctx, lbl, mmSize - 4), x + mmSize * 0.5, y + 1 + lblH * 0.5);
    ctx.restore();

    return { x, y, w: mmSize, h: mmSize };
  }

  function _drawTelemetryCard(ctx, model, labelPrefix, x, bottomY, w, bp, US, inspectMode, F, C) {
    if (!model) return null;
    const cut = Math.max(3, Math.round(5 * US));
    const isHostile = Boolean(model.isHostile);
    const borderCol = isHostile ? bp.hostile : (labelPrefix === "HOV" ? bp.gold : bp.accent);
    const padX = Math.round(8 * US);
    const padY = Math.round(6 * US);
    const innerW = w - padX * 2;
    const lineH = Math.max(11, Math.round(12 * US));
    const headerH = Math.max(13, Math.round(14 * US));

    ctx.save();
    ctx.font = F["regular:6"];

    const contentRows = [];
    if (model.kind === "unit") {
      // Row 1: HP bar + core stats
      const ratio = model.maxHp > 0 ? Math.max(0, Math.min(1, model.hp / model.maxHp)) : 0;
      const filled = Math.round(ratio * 8);
      const bar = "█".repeat(filled) + "░".repeat(8 - filled);
      contentRows.push({
        kind: "unitStats",
        hpText: `HP ${model.hp}/${model.maxHp} ${bar}`,
        statsText: model.stats || ""
      });

      // Row 2+: Unit flags (always shown, never overwritten by locusTag)
      const flagNames = (model.flags || []).map(f => f.flag).join(" ") || "NO ACTIVE FLAGS";
      const wrappedFlags = _wrapTextLines(ctx, flagNames, innerW);
      for (let i = 0; i < wrappedFlags.length; i++) {
        contentRows.push({ kind: "text", text: wrappedFlags[i], color: C["#94a3b8"] });
      }

      // Dedicated line for friendly capital ship warp locus status
      if (model.locusTag) {
        const wrappedLocus = _wrapTextLines(ctx, model.locusTag, innerW);
        for (let i = 0; i < wrappedLocus.length; i++) {
          contentRows.push({ kind: "text", text: wrappedLocus[i], color: C["#c084fc"] });
        }
      }

      // Inspect mode ([Hold I]): full wrapped descriptions for ALL unit flags
      if (inspectMode && Array.isArray(model.flags) && model.flags.length > 0) {
        for (let i = 0; i < model.flags.length; i++) {
          const f = model.flags[i];
          if (f && f.desc) {
            const descLines = _wrapTextLines(ctx, `${f.flag}: ${f.desc}`, innerW);
            for (let j = 0; j < descLines.length; j++) {
              contentRows.push({ kind: "text", text: descLines[j], color: bp.gold });
            }
          }
        }
      }
    } else {
      if (model.subtitle) {
        const subLines = _wrapTextLines(ctx, model.subtitle, innerW);
        for (let i = 0; i < subLines.length; i++) {
          contentRows.push({ kind: "text", text: subLines[i], color: C["#94a3b8"] });
        }
      }
      if (Array.isArray(model.lines)) {
        for (let i = 0; i < model.lines.length; i++) {
          const wrapped = _wrapTextLines(ctx, model.lines[i], innerW);
          for (let j = 0; j < wrapped.length; j++) {
            contentRows.push({ kind: "text", text: wrapped[j], color: C["#64748b"] });
          }
        }
      }
    }

    const h = Math.max(Math.round(44 * US), padY * 2 + headerH + contentRows.length * lineH);
    const y = Math.max(Math.round(8 * US), bottomY - h);

    _drawChamferedRect(ctx, x, y, w, h, cut);
    ctx.fillStyle = C["rgba(6, 8, 14, 0.90)"];
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1.1;
    ctx.fill();
    ctx.stroke();
    ctx.clip();

    ctx.fillStyle = borderCol;
    ctx.fillRect(x, y, Math.max(2, Math.round(3 * US)), h);

    const tx = x + padX;
    let cy = y + padY;
    ctx.textBaseline = "top";

    // Header line: HOV/SEL + Title + Coord
    ctx.font = F["bold:7"];
    ctx.fillStyle = borderCol;
    const titleStr = `${labelPrefix}: ${model.title || ""} ${model.coordTag || ""}`;
    ctx.fillText(_fitTextToWidth(ctx, titleStr, innerW), tx, cy);
    cy += headerH;

    for (let i = 0; i < contentRows.length; i++) {
      const row = contentRows[i];
      if (row.kind === "unitStats") {
        ctx.font = F["bold:6"];
        ctx.fillStyle = C["#34d399"];
        ctx.fillText(row.hpText, tx, cy);
        const hpW = ctx.measureText(row.hpText).width;
        ctx.font = F["regular:6"];
        ctx.fillStyle = C["#e2e8f0"];
        ctx.fillText(_fitTextToWidth(ctx, row.statsText, innerW - hpW - Math.round(8 * US)), tx + hpW + Math.round(8 * US), cy);
      } else {
        ctx.font = F["regular:6"];
        ctx.fillStyle = row.color;
        ctx.fillText(row.text, tx, cy);
      }
      cy += lineH;
    }

    ctx.restore();
    return { x, y, w, h };
  }

  function _drawIntelOverlay(ctx, uiHud, topBarRect, bp, DS, US, F, C) {
    if (!uiHud || !uiHud.intelOverlay || !uiHud.intelOverlay.visible) return null;
    const intel = uiHud.intelOverlay;
    const pad = Math.max(8, Math.round(10 * US));
    const x = pad;
    const y = (topBarRect ? (topBarRect.y + topBarRect.h) : pad) + Math.round(8 * US);
    const w = Math.min(DS - pad * 2, Math.round(410 * US));

    ctx.save();
    ctx.font = F["regular:6"];
    const wrappedBullets = [];
    const rawLines = Array.isArray(intel.lines) ? intel.lines : [];
    for (let i = 0; i < rawLines.length; i++) {
      const sub = _wrapTextLines(ctx, "• " + rawLines[i], w - Math.round(20 * US));
      for (let j = 0; j < sub.length; j++) wrappedBullets.push(sub[j]);
    }

    const lineH = Math.max(11, Math.round(12 * US));
    const h = Math.round(38 * US) + wrappedBullets.length * lineH;

    _drawChamferedRect(ctx, x, y, w, h, Math.round(6 * US));
    ctx.fillStyle = C["rgba(6, 8, 14, 0.93)"];
    ctx.strokeStyle = bp.accent;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.clip();

    ctx.fillStyle = bp.gold;
    ctx.fillRect(x, y, Math.max(3, Math.round(3 * US)), h);

    const tx = x + Math.round(10 * US);
    let cy = y + Math.round(6 * US);
    ctx.textBaseline = "top";
    ctx.font = F["bold:7"];
    ctx.fillStyle = bp.gold;
    ctx.fillText(_fitTextToWidth(ctx, intel.title || "OPERATIONAL TURN REPORT", w - Math.round(18 * US)), tx, cy);
    cy += Math.round(15 * US);

    ctx.font = F["regular:6"];
    ctx.fillStyle = C["#e2e8f0"];
    for (let i = 0; i < wrappedBullets.length; i++) {
      ctx.fillText(wrappedBullets[i], tx, cy);
      cy += lineH;
    }

    ctx.font = F["bold:6"];
    ctx.fillStyle = bp.accent;
    ctx.fillText("[CLICK REPORT TO ACKNOWLEDGE // DISMISS]", tx, y + h - Math.round(14 * US));
    ctx.restore();
    return { x, y, w, h };
  }

  function _drawPriorityBanner(ctx, uiHud, bp, DS, US, F, C) {
    if (!uiHud || !uiHud.priorityBanner || !uiHud.priorityBanner.visible) return;
    const b = uiHud.priorityBanner;
    if (!b.label) return;

    ctx.save();
    ctx.font = F["bold:6.5"];
    ctx.textBaseline = "middle";
    const textW = ctx.measureText(b.label).width;
    const padX = Math.round(8 * US);
    const w = textW + padX * 2;
    const h = Math.max(18, Math.round(20 * US));
    const x = Math.max(6, Math.min(DS - w - 6, b.x));
    const y = Math.max(6, Math.min(DS - h - 6, b.y));

    ctx.fillStyle = C["rgba(4, 6, 11, 0.94)"];
    ctx.strokeStyle = bp.gold;
    ctx.lineWidth = 1.2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = bp.gold;
    ctx.fillText(b.label, x + padX, y + h * 0.5 + 0.5);
    ctx.restore();
  }

  function _drawBridgeModal(ctx, state, uiHud, bp, DS, US, iconSprites, F, C) {
    const pad = Math.max(12, Math.round(18 * US));
    const mx = pad, my = pad;
    const mw = DS - pad * 2, mh = DS - pad * 2;
    const modal = (uiHud && uiHud.bridgeModal) ? uiHud.bridgeModal : { locusText: "", locusOk: false, credits: 0, cards: [] };

    ctx.save();
    // Backdrop
    ctx.fillStyle = C["rgba(3, 5, 10, 0.88)"];
    ctx.fillRect(0, 0, DS, DS);

    // Console frame
    _drawChamferedRect(ctx, mx, my, mw, mh, Math.round(10 * US));
    ctx.fillStyle = C["#060911"];
    ctx.strokeStyle = bp.accent;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    // Header
    const hdrH = Math.round(48 * US);
    ctx.fillStyle = C["rgba(10, 15, 26, 0.95)"];
    ctx.fillRect(mx + 1, my + 1, mw - 2, hdrH);
    ctx.strokeStyle = C["rgba(56, 189, 248, 0.3)"];
    ctx.beginPath();
    ctx.moveTo(mx, my + hdrH);
    ctx.lineTo(mx + mw, my + hdrH);
    ctx.stroke();

    // Close button & credits & scope in header right
    const closeW = Math.max(88, Math.round(106 * US));
    const closeH = Math.max(22, Math.round(26 * US));
    const closeX = mx + mw - closeW - Math.round(10 * US);
    const closeY = my + Math.round(11 * US);
    const closeBtn = { id: "CLOSE_MODAL", label: "RESUME [SPC]", x: closeX, y: closeY, w: closeW, h: closeH, enabled: true, active: false };
    _drawButtonWidget(ctx, closeBtn, state.buttonHovered, state.buttonPressed, bp, US, F, C);

    ctx.font = F["bold:8.5"];
    ctx.fillStyle = bp.gold;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const credStr = `${modal.credits} ⒸB`;
    const credRightX = closeX - Math.round(12 * US);
    ctx.fillText(credStr, credRightX, my + Math.round(24 * US));
    const credW = ctx.measureText(credStr).width;
    ctx.textAlign = "left";

    // Oscilloscope in header
    const oscW = Math.round(62 * US), oscH = Math.round(18 * US);
    const oscX = credRightX - credW - oscW - Math.round(12 * US);
    const showOsc = mw > 520 * US;
    if (showOsc) {
      _drawOscilloscopeBox(ctx, oscX, my + Math.round(15 * US), oscW, oscH, uiHud, bp, C);
    }

    const headerLeftMaxW = (showOsc ? oscX : (credRightX - credW)) - (mx + Math.round(20 * US));
    ctx.textBaseline = "top";
    ctx.font = F["bold:8"];
    ctx.fillStyle = bp.accent;
    ctx.fillText(_fitTextToWidth(ctx, "COMMAND BRIDGE // HYPERSPACE REINFORCEMENT LOCUS", headerLeftMaxW), mx + Math.round(12 * US), my + Math.round(6 * US));

    ctx.font = F["bold:6.2"];
    ctx.fillStyle = modal.locusOk ? C["#34d399"] : bp.hostile;
    ctx.fillText(_fitTextToWidth(ctx, modal.locusText || "", headerLeftMaxW), mx + Math.round(12 * US), my + Math.round(20 * US));

    if (modal.protocolText) {
      ctx.font = F["regular:5.8"];
      ctx.fillStyle = C["#94a3b8"];
      ctx.fillText(_fitTextToWidth(ctx, modal.protocolText, headerLeftMaxW), mx + Math.round(12 * US), my + Math.round(33 * US));
    }

    // Shop Cards Grid (3 columns x 6 rows for 17 buyable ships)
    const cards = Array.isArray(modal.cards) ? modal.cards : [];
    const cols = 3;
    const rows = Math.ceil(Math.max(1, cards.length) / cols);
    const gridPad = Math.round(10 * US);
    const gap = Math.round(7 * US);
    const gridX = mx + gridPad;
    const gridY = my + hdrH + gridPad;
    const gridW = mw - gridPad * 2;
    const gridH = mh - hdrH - gridPad * 2;
    const cardW = Math.floor((gridW - gap * (cols - 1)) / cols);
    const cardH = Math.floor((gridH - gap * (rows - 1)) / rows);

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridX + col * (cardW + gap);
      const cy = gridY + row * (cardH + gap);
      const btnId = "SHOP_BUY:" + c.shipName;
      const isHov = state.buttonHovered === btnId;
      const isPrs = state.buttonPressed === btnId;

      ctx.save();
      _drawChamferedRect(ctx, cx, cy, cardW, cardH, Math.round(5 * US));
      if (!c.affordable) {
        ctx.fillStyle = C["rgba(10, 15, 26, 0.45)"];
        ctx.strokeStyle = C["rgba(244, 63, 94, 0.35)"];
        ctx.lineWidth = 1;
      } else if (isPrs) {
        ctx.fillStyle = C["rgba(250, 204, 21, 0.25)"];
        ctx.strokeStyle = C["#ffffff"];
        ctx.lineWidth = 1.5;
      } else if (isHov) {
        ctx.fillStyle = C["rgba(2, 132, 199, 0.28)"];
        ctx.strokeStyle = bp.gold;
        ctx.lineWidth = 1.5;
      } else {
        ctx.fillStyle = C["rgba(10, 15, 26, 0.88)"];
        ctx.strokeStyle = C["rgba(56, 189, 248, 0.4)"];
        ctx.lineWidth = 1;
      }
      ctx.fill();
      ctx.stroke();
      ctx.clip();

      // Ship sprite icon on left of card
      const iconSlotW = Math.round(58 * US);
      const iconR = Math.min(cardH * 0.72, Math.round(42 * US));
      const iconCX = cx + Math.round(29 * US);
      const iconCY = cy + cardH * 0.54;
      // Blitted straight from atlas sprite data (sheet + source rect) handed
      // down by the parent — no callable draw handles cross the layer boundary.
      const iconSprite = (iconSprites && c.dummyUnit) ? iconSprites[c.shipName] : null;
      if (iconSprite && iconSprite.sheet) {
        ctx.save();
        if (!c.affordable) ctx.globalAlpha = 0.45;
        const lw = Math.ceil(iconR * 2.2);
        const lh = Math.ceil(iconR * 2.2);
        ctx.drawImage(iconSprite.sheet, iconSprite.sx, iconSprite.sy, iconSprite.sw, iconSprite.sh, iconCX - lw / 2, iconCY - lh / 2, lw, lh);
        ctx.restore();
      }

      const tx = cx + iconSlotW + Math.round(4 * US);
      const ty = cy + Math.round(7 * US);
      const textAvailW = cardW - (tx - cx) - Math.round(7 * US);
      ctx.textBaseline = "top";

      // Cost badge (right-aligned) — colored by credit sufficiency (c.priceOk) (ISS-039)
      ctx.font = F["bold:7"];
      const costStr = `${c.cost}ⒸB`;
      const costW = ctx.measureText(costStr).width;
      const priceOk = (c.priceOk !== undefined) ? c.priceOk : c.affordable;
      ctx.fillStyle = priceOk ? bp.gold : bp.hostile;
      ctx.textAlign = "right";
      ctx.fillText(costStr, cx + cardW - Math.round(7 * US), ty);
      ctx.textAlign = "left";

      // Ship name (fitted so it never collides with cost badge)
      ctx.fillStyle = c.affordable ? C["#e2e8f0"] : C["#64748b"];
      ctx.fillText(_fitTextToWidth(ctx, c.shipName, textAvailW - costW - Math.round(6 * US)), tx, ty);

      // Flags (wrapped up to 2 lines so multi-flag warships are legible)
      ctx.font = F["regular:5.8"];
      ctx.fillStyle = c.affordable ? bp.accent : C["#475569"];
      const flagLines = _wrapTextLines(ctx, c.flagsText || "STANDARD", textAvailW);
      const maxFlagLines = cardH >= Math.round(72 * US) ? 2 : 1;
      for (let fl = 0; fl < Math.min(maxFlagLines, flagLines.length); fl++) {
        ctx.fillText(flagLines[fl], tx, ty + Math.round((15 + fl * 11) * US));
      }

      // Stats anchored near bottom of card
      ctx.font = F["regular:6"];
      ctx.fillStyle = C["#94a3b8"];
      const statsStr = `HP:${c.hp} M:${c.move} FP:${c.fp} R:${c.range} S:${c.scan}`;
      ctx.fillText(_fitTextToWidth(ctx, statsStr, textAvailW), tx, cy + cardH - Math.round(16 * US));
      ctx.restore();
    }

    ctx.restore();
  }

  // Deterministic twinkle field — stable per-index positions so the star-chart
  // backdrop does not jitter between frames (only the alpha gently twinkles).
  function _hashUnit(seed) {
    const v = Math.sin(seed) * 43758.5453;
    return v - Math.floor(v);
  }

  // Campaign STARMAP — replaces the old 2-column level-select card grid.
  // One node per campaign level, connected in campaign order like a star
  // chart. Node geometry comes from the HUD snapshot (uiHud.campaignModal.nodes
  // / .layout), computed once by hud._computeStarmapLayout, so what is drawn
  // here exactly matches the clickable hit regions in State.canvasButtons.
  // Clicking a node fires the same "LEVEL_SELECT:<id>" button the old screen
  // used, which the input handler routes to the sector-start path.
  function _drawCampaignModal(ctx, state, uiHud, bp, DS, US, now, F, C) {
    const modal = (uiHud && uiHud.campaignModal) ? uiHud.campaignModal : { cards: [], nodes: [], layout: null };
    const cards = Array.isArray(modal.cards) ? modal.cards : [];
    const nodes = Array.isArray(modal.nodes) ? modal.nodes : [];
    const layout = modal.layout || null;

    const pad = Math.max(12, Math.round(20 * US));
    const mx = layout ? layout.mx : pad;
    const my = layout ? layout.my : pad;
    const mw = layout ? layout.mw : (DS - pad * 2);
    const mh = layout ? layout.mh : (DS - pad * 2);
    const hdrH = layout ? layout.hdrH : Math.round(48 * US);

    ctx.save();
    ctx.fillStyle = C["rgba(3, 5, 10, 0.88)"];
    ctx.fillRect(0, 0, DS, DS);

    // Modal frame
    _drawChamferedRect(ctx, mx, my, mw, mh, Math.round(10 * US));
    ctx.fillStyle = C["#060911"];
    ctx.strokeStyle = bp.accent;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    // Star-chart backdrop (clipped to the content area below the header)
    ctx.save();
    _drawChamferedRect(ctx, mx + 1, my + hdrH + 1, mw - 2, mh - hdrH - 2, Math.round(8 * US));
    ctx.clip();
    const fieldY0 = my + hdrH;
    const fieldH = mh - hdrH;
    for (let i = 0; i < 96; i++) {
      const sx = mx + _hashUnit(i * 12.9898 + 1.3) * mw;
      const sy = fieldY0 + _hashUnit(i * 78.233 + 4.1) * fieldH;
      const sz = 0.4 + _hashUnit(i * 4.11 + 9.7) * 1.3;
      ctx.globalAlpha = 0.18 + ((Math.sin(now * 0.001 + i) + 1) * 0.5) * 0.32;
      ctx.fillStyle = C["rgba(148, 163, 184, 0.75)"];
      ctx.fillRect(sx, sy, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Header bar
    ctx.fillStyle = C["rgba(10, 15, 26, 0.95)"];
    ctx.fillRect(mx + 1, my + 1, mw - 2, hdrH);
    ctx.strokeStyle = C["rgba(56, 189, 248, 0.3)"];
    ctx.beginPath();
    ctx.moveTo(mx, my + hdrH);
    ctx.lineTo(mx + mw, my + hdrH);
    ctx.stroke();

    // Close button (geometry shared with hit-test via layout.closeBtn)
    const closeBtn = (layout && layout.closeBtn)
      ? layout.closeBtn
      : { id: "CLOSE_MODAL", label: "CLOSE [ESC]", x: mx + mw - Math.round(108 * US), y: my + Math.round(11 * US), w: Math.max(82, Math.round(98 * US)), h: Math.max(22, Math.round(26 * US)), enabled: true, active: false };
    _drawButtonWidget(ctx, closeBtn, state.buttonHovered, state.buttonPressed, bp, US, F, C);

    const hdrTextW = closeBtn.x - (mx + Math.round(20 * US));
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = F["bold:8.5"];
    ctx.fillStyle = bp.accent;
    ctx.fillText(_fitTextToWidth(ctx, "CAMPAIGN STARMAP // SECTOR NAVIGATION", hdrTextW), mx + Math.round(12 * US), my + Math.round(8 * US));
    ctx.font = F["regular:6.5"];
    ctx.fillStyle = C["#94a3b8"];
    ctx.fillText(_fitTextToWidth(ctx, "Select a sector node to deploy. Eliminate all Syndicate !flagship vessels to secure it.", hdrTextW), mx + Math.round(12 * US), my + Math.round(27 * US));

    // Route lines between consecutive sectors (campaign order)
    if (nodes.length > 1) {
      ctx.save();
      ctx.setLineDash([Math.round(5 * US), Math.round(5 * US)]);
      ctx.lineWidth = 1.4;
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i], b = nodes[i + 1];
        const aDone = cards[i] && cards[i].isDone;
        ctx.strokeStyle = aDone ? C["rgba(250, 204, 21, 0.55)"] : C["rgba(56, 189, 248, 0.28)"];
        ctx.beginPath();
        ctx.moveTo(a.cx, a.cy);
        ctx.lineTo(b.cx, b.cy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Sector nodes
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const c = cards[i] || {};
      const btnId = "LEVEL_SELECT:" + node.id;
      const isHov = state.buttonHovered === btnId;
      const isPrs = state.buttonPressed === btnId;
      const isDone = Boolean(c.isDone);
      const isNext = Boolean(c.isNext);
      const ringCol = isDone ? C["#34d399"] : (isNext ? bp.gold : bp.accent);
      const baseAlpha = (isDone || isNext) ? 1 : 0.74;

      ctx.save();

      // Pulsing "next objective" halo
      if (isNext && !isDone) {
        const pulse = 1 + Math.sin(now * 0.005) * 0.08;
        ctx.strokeStyle = C["rgba(250, 204, 21, 0.45)"];
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(node.cx, node.cy, node.r * 1.25 * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (isHov || isNext) {
        ctx.shadowColor = isHov ? bp.gold : ringCol;
        ctx.shadowBlur = Math.round((isHov ? 16 : 10) * US);
      }

      // Node disc
      ctx.globalAlpha = baseAlpha;
      ctx.beginPath();
      ctx.arc(node.cx, node.cy, node.r, 0, Math.PI * 2);
      ctx.fillStyle = isPrs
        ? C["rgba(250, 204, 21, 0.30)"]
        : (isHov ? C["rgba(2, 132, 199, 0.35)"]
          : (isDone ? C["rgba(16, 95, 72, 0.50)"] : C["rgba(10, 15, 26, 0.92)"]));
      ctx.fill();
      ctx.lineWidth = (isHov || isNext) ? 2.2 : 1.4;
      ctx.strokeStyle = isHov ? bp.gold : ringCol;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner ring
      ctx.beginPath();
      ctx.arc(node.cx, node.cy, node.r * 0.62, 0, Math.PI * 2);
      ctx.strokeStyle = isDone ? C["rgba(52, 211, 153, 0.6)"] : C["rgba(148, 163, 184, 0.35)"];
      ctx.lineWidth = 1;
      ctx.stroke();

      // Center glyph: ✓ when secured, otherwise sector ordinal
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (isDone) {
        ctx.font = F["bold:12"];
        ctx.fillStyle = C["#34d399"];
        ctx.fillText("✓", node.cx, node.cy + Math.round(1 * US));
      } else {
        ctx.font = F["bold:11"];
        ctx.fillStyle = isNext ? bp.gold : C["#e2e8f0"];
        ctx.fillText(String(i + 1), node.cx, node.cy + Math.round(1 * US));
      }
      ctx.restore();

      // Label beneath node: short sector code + status
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const labelY = node.cy + node.r + Math.round(6 * US);
      const labelMaxW = Math.max(node.hitW, Math.round(150 * US));
      const tagRaw = String(c.tag || ("SECTOR " + node.id));
      const code = tagRaw.split("//")[0].trim() || tagRaw;
      ctx.font = F["bold:6.6"];
      ctx.fillStyle = isDone ? C["#34d399"] : (isNext ? bp.gold : C["#c084fc"]);
      ctx.fillText(_fitTextToWidth(ctx, code, labelMaxW), node.cx, labelY);
      ctx.font = F["regular:5.8"];
      ctx.fillStyle = C["#94a3b8"];
      const status = isDone ? "SECURED" : (isNext ? "NEXT OBJECTIVE" : "AVAILABLE");
      ctx.fillText(status, node.cx, labelY + Math.round(11 * US));
      ctx.restore();
    }

    // Hovered-sector detail strip along the bottom (title + deployment summary)
    const hovBtn = state.buttonHovered;
    if (typeof hovBtn === "string" && hovBtn.indexOf("LEVEL_SELECT:") === 0) {
      const hovId = hovBtn.slice("LEVEL_SELECT:".length);
      const hc = cards.find(c => String(c.id) === hovId);
      if (hc) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const stripY = my + mh - Math.round(34 * US);
        const stripW = mw - Math.round(40 * US);
        ctx.font = F["bold:7.4"];
        ctx.fillStyle = bp.gold;
        ctx.fillText(_fitTextToWidth(ctx, hc.title, stripW), mx + mw * 0.5, stripY);
        ctx.font = F["regular:6"];
        ctx.fillStyle = C["#94a3b8"];
        ctx.fillText(_fitTextToWidth(ctx, hc.creditsText || "", stripW), mx + mw * 0.5, stripY + Math.round(13 * US));
        ctx.restore();
      }
    }

    ctx.textAlign = "left";
    ctx.restore();
  }

  function _drawEndgameModal(ctx, state, uiHud, bp, DS, US, F, C) {
    const modal = (uiHud && uiHud.endgameModal) ? uiHud.endgameModal : { isVictory: true, title: "SECTOR SECURED", body: "" };
    const mw = Math.min(DS - Math.round(36 * US), Math.round(430 * US));
    const mh = Math.round(172 * US);
    const mx = Math.round((DS - mw) * 0.5);
    const my = Math.round((DS - mh) * 0.5);
    const accentCol = modal.isVictory ? bp.gold : bp.hostile;

    ctx.save();
    ctx.fillStyle = C["rgba(3, 5, 10, 0.86)"];
    ctx.fillRect(0, 0, DS, DS);

    _drawChamferedRect(ctx, mx, my, mw, mh, Math.round(10 * US));
    ctx.fillStyle = C["#060911"];
    ctx.strokeStyle = accentCol;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = F["bold:9.5"];
    ctx.fillStyle = accentCol;
    ctx.fillText(modal.title, mx + mw * 0.5, my + Math.round(18 * US));

    ctx.font = F["regular:6.8"];
    ctx.fillStyle = C["#cbd5e1"];
    const lines = _wrapTextLines(ctx, modal.body, mw - Math.round(32 * US));
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      ctx.fillText(lines[i], mx + mw * 0.5, my + Math.round((46 + i * 14) * US));
    }
    ctx.textAlign = "left";

    const btnW = Math.round(156 * US);
    const btnH = Math.max(24, Math.round(28 * US));
    const gap = Math.round(12 * US);
    const b1X = Math.round(mx + (mw - (btnW * 2 + gap)) * 0.5);
    const b2X = b1X + btnW + gap;
    const btnY = my + mh - btnH - Math.round(16 * US);

    // Highlight SECTOR MAP on victory and REDEPLOY SECTOR on defeat (ISS-071)
    const retryBtn = { id: "ENDGAME_RETRY", label: "REDEPLOY SECTOR", x: b1X, y: btnY, w: btnW, h: btnH, enabled: true, active: !modal.isVictory };
    const mapBtn   = { id: "ENDGAME_MAP",   label: "SECTOR MAP",      x: b2X, y: btnY, w: btnW, h: btnH, enabled: true, active: Boolean(modal.isVictory) };

    _drawButtonWidget(ctx, retryBtn, state.buttonHovered, state.buttonPressed, bp, US, F, C);
    _drawButtonWidget(ctx, mapBtn, state.buttonHovered, state.buttonPressed, bp, US, F, C);

    ctx.restore();
  }

  function drawBattleWorldReticles(cmd) {
    const {
      ctx, now, state, bp, CP, FS, DX0, DX1, DY0, DY1,
      fonts: F, colors: C
    } = cmd;

    const selUnit = state.selectedCell ? _unitAt(state, state.selectedCell.x, state.selectedCell.y) : null;
    if (selUnit && selUnit.team === 1 && state.activeTeam === 1 &&
        selUnit.x >= DX0 - 1 && selUnit.x <= DX1 &&
        selUnit.y >= DY0 - 1 && selUnit.y <= DY1) {
      const rx = selUnit.x * CP, ry = selUnit.y * CP;
      const pulse = Math.sin(now * 0.012) * 1.2;
      const arm = 6 * FS;
      const x0 = rx - pulse, y0 = ry - pulse;
      const x1 = rx + CP + pulse, y1 = ry + CP + pulse;

      ctx.save();
      ctx.strokeStyle = C["#ffffff"];
      ctx.shadowColor = bp.accent;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + arm); ctx.lineTo(x0, y0); ctx.lineTo(x0 + arm, y0);
      ctx.moveTo(x1 - arm, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + arm);
      ctx.moveTo(x0, y1 - arm); ctx.lineTo(x0, y1); ctx.lineTo(x0 + arm, y1);
      ctx.moveTo(x1 - arm, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - arm);
      ctx.stroke();
      ctx.restore();

      ctx.font = F["bold:7"];
      ctx.fillStyle = bp.accent;
      ctx.fillText("SEL", rx + 2 * FS, ry + 22 * FS);
    }

    if (state.hoveredCell) {
      const hx = state.hoveredCell.x * CP, hy = state.hoveredCell.y * CP;
      const unitAtHover = _unitAt(state, state.hoveredCell.x, state.hoveredCell.y);
      const detUnit = (unitAtHover && _spottedBy(unitAtHover, 1)) ? unitAtHover : null;

      if (detUnit) {
        const isHostile = detUnit.team === 2;
        ctx.strokeStyle = isHostile ? bp.hostile : bp.gold;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(hx + 1 * FS, hy + 1 * FS, 22 * FS, 22 * FS);

        const hc = _cellCenter(detUnit.x, detUnit.y, CP);
        ctx.save();

        // Movement reach envelope (dashed)
        if (detUnit.move > 0) {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = isHostile ? C["rgba(250, 204, 21, 0.22)"] : C["rgba(56, 189, 248, 0.22)"];
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(hc.x, hc.y, detUnit.move * CP, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Weapon range envelope (dashed)
        if (detUnit.range > 0) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = isHostile ? C["rgba(244, 63, 94, 0.34)"] : C["rgba(254, 72, 26, 0.28)"];
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(hc.x, hc.y, detUnit.range * CP, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Sensor scan envelope for hovered enemy (or when holding [I] on friendly)
        const effScan = _effScanOf(detUnit);
        if (effScan > 0 && (isHostile || state.inspectMode)) {
          ctx.setLineDash([2, 4]);
          ctx.strokeStyle = isHostile ? C["rgba(192, 132, 252, 0.26)"] : C["rgba(56, 189, 248, 0.30)"];
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(hc.x, hc.y, effScan * CP, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      } else {
        ctx.strokeStyle = C["rgba(148, 163, 184, 0.28)"];
        ctx.lineWidth = 1;
        ctx.strokeRect(hx + 0.5 * FS, hy + 0.5 * FS, 23 * FS, 23 * FS);
      }
    }
  }

  function drawHud(cmd) {
    const {
      ctx, now, state, bp, theme, DS, US: rawUS, metrics, minimapCanvas, uiHud,
      iconSprites, fonts: F, colors: C
    } = cmd;
    if (!state || !DS) return;
    const US = rawUS || (metrics && metrics.uiScale) || 1;

    // 1. If a full-screen modal is open, render modal overlay and set modal-only canvasButtons
    if (uiHud && uiHud.activeModal === "bridge") {
      _drawBridgeModal(ctx, state, uiHud, bp, DS, US, iconSprites, F, C);
      return;
    }
    if (uiHud && uiHud.activeModal === "campaign") {
      _drawCampaignModal(ctx, state, uiHud, bp, DS, US, now, F, C);
      return;
    }

    // 2. Composite Minimap in bottom-left of battle canvas
    const mmRect = _drawMinimapOnBattleCanvas(ctx, minimapCanvas, metrics, uiHud, bp, DS, US, F, C);

    if (uiHud && uiHud.activeModal === "endgame") {
      _drawEndgameModal(ctx, state, uiHud, bp, DS, US, F, C);
      return;
    }

    // 3. Standard HUD buttons (top-right and bottom-right)
    const selUnit = state.selectedCell ? _unitAt(state, state.selectedCell.x, state.selectedCell.y) : null;
    const isPlayerTurn = state.activeTeam === 1 && !state.gameOver;
    const isCapitalSelected = Boolean(selUnit && selUnit.team === 1 && _hasFlag(selUnit, "#capital ship"));
    const canShieldSelected = Boolean(
      isPlayerTurn &&
      selUnit &&
      selUnit.team === 1 &&
      state.ap > 0 &&
      Boolean(state.canShieldSelected)
    );
    const audioMuted = Boolean(state.audioSettings && state.audioSettings.muted);
    const audioReady = Boolean(uiHud && uiHud.audioReady);
    const audioLabel = !audioReady ? "AUD:OFF" : (audioMuted ? "AUD:MUTE" : "AUD:ON");
    const themeLabel = String(theme || state.theme || "default").toUpperCase();

    const btnH = Math.max(22, Math.round(25 * US));
    const gap = Math.max(5, Math.round(6 * US));
    const padRight = Math.max(8, Math.round(10 * US));
    const topY = Math.max(8, Math.round(10 * US));
    const botY = DS - btnH - Math.max(8, Math.round(10 * US));

    const topDefs = [
      { id: "BRIDGE", label: "[SPC] BRIDGE",     w: Math.round(108 * US), enabled: isPlayerTurn, active: isCapitalSelected },
      { id: "MAP",    label: "SECTOR MAP",       w: Math.round(94 * US),  enabled: true,         active: false },
      { id: "THEME",  label: `THM:${themeLabel}`, w: Math.round(96 * US),  enabled: true,         active: false },
      { id: "AUDIO",  label: audioLabel,         w: Math.round(80 * US),  enabled: true,         active: audioReady && !audioMuted }
    ];

    const botDefs = [
      { id: "SHIELD",   label: "REGEN SHIELD", w: Math.round(108 * US), enabled: canShieldSelected, active: canShieldSelected },
      { id: "END_TURN", label: "END TURN >>",  w: Math.round(98 * US),  enabled: isPlayerTurn,      active: false }
    ];

    const layout = [];
    let curRight = DS - padRight;
    for (let i = topDefs.length - 1; i >= 0; i--) {
      const d = topDefs[i];
      const w = Math.max(58, d.w);
      const x = curRight - w;
      layout.unshift({ id: d.id, label: d.label, x, y: topY, w, h: btnH, enabled: d.enabled, active: d.active });
      curRight = x - gap;
    }
    const topButtonsLeftEdge = layout.length > 0 ? layout[0].x : (DS - padRight);

    let botRight = DS - padRight;
    for (let i = botDefs.length - 1; i >= 0; i--) {
      const d = botDefs[i];
      const w = Math.max(66, d.w);
      const x = botRight - w;
      layout.push({ id: d.id, label: d.label, x, y: botY, w, h: btnH, enabled: d.enabled, active: d.active });
      botRight = x - gap;
    }

    const hoveredId = state.buttonHovered || null;
    const pressedId = state.buttonPressed || null;
    for (let i = 0; i < layout.length; i++) {
      _drawButtonWidget(ctx, layout[i], hoveredId, pressedId, bp, US, F, C);
    }

    // 4. Top-Left HUD Status Bar
    const leftAvailW = Math.max(160, topButtonsLeftEdge - Math.round(18 * US));
    const topBarRect = _drawTopLeftHudBar(ctx, state, uiHud, bp, DS, US, leftAvailW, F, C);

    // 5. Bottom Telemetry Cards (Selected Locus & Hovered Contact)
    let selRect = null;
    if (uiHud) {
      const cardW = Math.min(Math.round(308 * US), Math.max(190, DS - (mmRect ? (mmRect.x + mmRect.w) : 0) - Math.round(24 * US)));
      const cardX = DS - padRight - cardW;
      let nextCardBottom = botY - Math.round(7 * US);

      if (uiHud.selectedTelemetry && uiHud.selectedTelemetry.kind === "unit") {
        selRect = _drawTelemetryCard(ctx, uiHud.selectedTelemetry, "SEL", cardX, nextCardBottom, cardW, bp, US, state.inspectMode, F, C);
        if (selRect) nextCardBottom = selRect.y - Math.round(6 * US);
      }
      const hoverSameAsSelected = Boolean(
        selRect &&
        state.selectedCell &&
        state.hoveredCell &&
        state.hoveredCell.x === state.selectedCell.x &&
        state.hoveredCell.y === state.selectedCell.y
      );
      if (state.hoveredCell && !hoverSameAsSelected && uiHud.hoveredTelemetry && uiHud.hoveredTelemetry.kind !== "none") {
        _drawTelemetryCard(ctx, uiHud.hoveredTelemetry, "HOV", cardX, nextCardBottom, cardW, bp, US, state.inspectMode, F, C);
      }
    }

    // 6. Operational Intel Overlay (top-left below HUD bar)
    _drawIntelOverlay(ctx, uiHud, topBarRect, bp, DS, US, F, C);

    // 7. Priority Action Banner near cursor
    _drawPriorityBanner(ctx, uiHud, bp, DS, US, F, C);
  }

  function drawMinimapUi(cmd) {
    const { ctx, state, bp, cellPx, now, colors: C } = cmd;

    let vx = state.viewX;
    let vy = state.viewY;
    let vs = state.viewSpan;
    if (state.zoomAnim && state.zoomAnim.active) {
      const anim = state.zoomAnim;
      const t = Math.min(1, Math.max(0, (now - anim.start) / (anim.duration || 180)));
      const ease = 1 - Math.pow(1 - t, 3);
      vs = anim.fromSpan + (anim.toSpan - anim.fromSpan) * ease;
      vx = anim.fromX + (anim.toX - anim.fromX) * ease;
      vy = anim.fromY + (anim.toY - anim.fromY) * ease;
    }

    ctx.strokeStyle = bp.gold;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      vx * cellPx + 0.5,
      vy * cellPx + 0.5,
      vs * cellPx - 1,
      vs * cellPx - 1
    );

    if (state.selectedCell) {
      const spx = state.selectedCell.x * cellPx;
      const spy = state.selectedCell.y * cellPx;
      ctx.strokeStyle = C["#ffffff"];
      ctx.lineWidth = 1.5;
      ctx.strokeRect(spx + 1, spy + 1, cellPx - 2, cellPx - 2);
    }

    if (state.hoveredCell) {
      const hpx = state.hoveredCell.x * cellPx;
      const hpy = state.hoveredCell.y * cellPx;
      ctx.strokeStyle = C["rgba(250, 204, 21, 0.6)"];
      ctx.lineWidth = 1;
      ctx.strokeRect(hpx + 0.5, hpy + 0.5, cellPx - 1, cellPx - 1);
    }
  }

  Graphics._registerLayer("ui", {
    drawBattleWorldReticles,
    drawHud,
    drawMinimapUi
  });
})();
