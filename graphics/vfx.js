"use strict";
// ============================================================
// vfx.js — job: draw the frame's effects layer.
// Owner: graphics/graphics.js. Holds no state unless it is a core.
// ============================================================
(() => {
  const _cellCenter = (gx, gy, CP) => ({ x: (gx + 0.5) * CP, y: (gy + 0.5) * CP });

  function drawAnimation(cmd, anim) {
    const { ctx, now, CP, TS, fontHelper, TC: rawTC } = cmd;
    const TC = typeof rawTC === "function" ? rawTC : (c => c);
    if (!anim) return;
    const t = Math.min(1, Math.max(0, (now - anim.start) / anim.duration));

    if (anim.kind === "spotted") {
      const c = _cellCenter(anim.cell.x, anim.cell.y, CP);
      const s = (2.0 - t) * CP * 0.5;
      ctx.strokeStyle = TC("#f43f5e");
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x - s, c.y - s, s * 2, s * 2);
      ctx.beginPath();
      ctx.arc(c.x, c.y, CP * (0.5 + t * 1.1), 0, Math.PI * 2);
      ctx.stroke();
    } else if (anim.kind === "weapon") {
      const p1 = _cellCenter(anim.from.x, anim.from.y, CP);
      const p2 = _cellCenter(anim.to.x, anim.to.y, CP);
      if (anim.wType === "railgun") {
        ctx.strokeStyle = TC("rgba(56, 189, 248, 0.65)");
        ctx.lineWidth = CP * 0.25 * (1 - t * 0.5);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.strokeStyle = TC("#ffffff");
        ctx.lineWidth = Math.max(1, CP * 0.083);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else if (anim.wType === "missile") {
        const count = Math.min(4, Math.max(1, anim.damage));
        ctx.fillStyle = TC("#fb923c");
        for (let i = 0; i < count; i++) {
          const mt = Math.min(1, Math.max(0, t * 1.2 - i * 0.08));
          const lx = p1.x + (p2.x - p1.x) * mt;
          const ly = p1.y + (p2.y - p1.y) * mt - Math.sin(mt * Math.PI) * CP * 0.583 * (i % 2 === 0 ? 1 : -1);
          const ps = Math.max(2, CP * 0.167);
          ctx.fillRect(lx - ps / 2, ly - ps / 2, ps, ps);
        }
      } else {
        const count = Math.max(2, anim.damage);
        ctx.fillStyle = TC("#facc15");
        for (let i = 0; i < count; i++) {
          const bt = Math.min(1, Math.max(0, t * 1.3 - i * 0.05));
          const lx = p1.x + (p2.x - p1.x) * bt;
          const ly = p1.y + (p2.y - p1.y) * bt;
          const ps = Math.max(2, CP * 0.167);
          ctx.fillRect(lx - ps / 2, ly - ps / 2, ps, ps);
        }
      }
      if (t > 0.35) {
        ctx.font = fontHelper("bold", 9);
        ctx.fillStyle = anim.shieldStripped ? TC("#38bdf8") : TC("#f43f5e");
        const label = anim.shieldStripped ? "SHIELD BROKEN (-1 HP)" : `-${anim.damage} HP`;
        ctx.fillText(label, p2.x - 16 * TS, p2.y - 10 * TS - t * 8 * TS);
      }
    } else if (anim.kind === "destroy") {
      const c = _cellCenter(anim.cell.x, anim.cell.y, CP);
      if (t < 0.35) {
        // Soft warm shockwave that grows and fades — the screen must never
        // strobe, so no white flash, even at max zoom where one cell is huge.
        const ft = t / 0.35;
        ctx.save();
        ctx.globalAlpha = 0.45 * (1 - ft);
        ctx.fillStyle = TC("#fdba74");
        ctx.beginPath();
        ctx.arc(c.x, c.y, CP * 1.2 * ft, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = TC("#fe481a");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, CP * 1.4 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = fontHelper("bold", 9);
      ctx.fillStyle = TC("#facc15");
      ctx.fillText(`DESTROYED [${anim.shipType}]`, c.x - 28 * TS, c.y - 12 * TS - t * 10 * TS);
    } else if (anim.kind === "capture") {
      const p1 = _cellCenter(anim.from.x, anim.from.y, CP);
      const p2 = _cellCenter(anim.to.x, anim.to.y, CP);
      const ct = Math.min(1, t * 1.8);
      const lx = p1.x + (p2.x - p1.x) * ct, ly = p1.y + (p2.y - p1.y) * ct;
      const cs = Math.max(3, CP * 0.25);
      ctx.fillStyle = TC("#facc15");
      ctx.fillRect(lx - cs / 2, ly - cs / 2, cs, cs);
      ctx.font = fontHelper("bold", 9);
      ctx.fillText(`CAPTURED [${anim.targetName}]`, p2.x - 24 * TS, p2.y - 10 * TS - t * 8 * TS);
    } else if (anim.kind === "shieldup" || anim.kind === "shielddrop") {
      const c = _cellCenter(anim.cell.x, anim.cell.y, CP);
      const rad = anim.kind === "shieldup" ? CP * 0.5 * t : CP * 0.5 * (1 - t);
      ctx.strokeStyle = TC("#78dcff");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(0.5, rad), 0, Math.PI * 2);
      ctx.stroke();
    } else if (anim.kind === "warp") {
      const c = _cellCenter(anim.cell.x, anim.cell.y, CP);
      const w = (1 - t) * CP * 2.5;
      ctx.fillStyle = TC("#c084fc");
      ctx.fillRect(c.x - w * 0.5, c.y - 2, w, 4);
      ctx.font = fontHelper("bold", 9);
      ctx.fillText(`[WARP IN: ${anim.shipType}]`, c.x - 28 * TS, c.y - 10 * TS - t * 8 * TS);
    }
  }

  Graphics._registerLayer("vfx", {
    drawAnimation
  });
})();
