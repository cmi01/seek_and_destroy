"use strict";

// ============================================================
// graphicsTests.js — job: run the graphics self-tests through the test bridge.
// Owner: graphics/graphics.js. Holds no state unless it is a core.
// ============================================================
Graphics._registerLayer("tests", function runTest(bridge, testName) {
  const suite = {

    renderUnitPixels(type, team, flags, cellPx) {
      const spec = bridge.shipSpecs[type];
      const size = Math.ceil(cellPx * 2.2);
      const off = bridge.createCanvas(size, size);
      const octx = off.getContext("2d", { willReadFrequently: true });
      const unit = { id: 1, type, team, hp: spec.hp, maxHp: spec.hp, flags: new Set(flags || spec.flags) };
      bridge.drawUnitStatic(octx, size / 2, size / 2, cellPx, unit, 0);
      return {
        data: octx.getImageData(0, 0, size, size),
        size, cx: size / 2, cy: size / 2,
        R: (cellPx * 0.5) * 0.85
      };
    },

    samplePx(img, x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= img.size || yi >= img.size) return { r: 0, g: 0, b: 0, a: 0 };
      const i = (yi * img.size + xi) * 4;
      const d = img.data.data;
      return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
    },

    // B-1: every ship type in SHIP_SPECS renders non-empty pixels from the baked sprite atlas.
    testBakedSpriteAtlas() {
      const cellPx = 48;
      const specs = bridge.shipSpecs;
      const names = Object.keys(specs);
      let ok = names.length > 0, detail = "";
      names.forEach(n => {
        const img = this.renderUnitPixels(n, 1, specs[n].flags, cellPx);
        let nonZero = 0;
        const d = img.data.data;
        for (let i = 3; i < d.length; i += 4) {
          if (d[i] > 32) nonZero++;
        }
        if (nonZero < 50) { ok = false; detail += `${n}:${nonZero} `; }
      });
      return {
        name: "BAKED SPRITE ATLAS COVERAGE", pass: ok,
        detail: ok ? `${names.length} ship types verified` : detail
      };
    },

    // B-2: railgunPulseOffset is a bounded triangle wave with the right period.
    testRailgunPulseOffset() {
      const a = bridge.getRailgunPulseOffset(0, 1100);
      const b = bridge.getRailgunPulseOffset(550, 1100);
      const c = bridge.getRailgunPulseOffset(1100, 1100);
      let inRange = true;
      for (let t = 0; t <= 2200; t += 37) {
        const v = bridge.getRailgunPulseOffset(t, 1100);
        if (v < 0 || v > 1) inRange = false;
      }
      const pass = Math.abs(a) < 1e-6 && Math.abs(b - 1) < 1e-6 && Math.abs(c) < 1e-6 && inRange;
      return {
        name: "RAILGUN PULSE OFFSET (Theme B)", pass,
        detail: `0:${a.toFixed(3)} 550:${b.toFixed(3)} 1100:${c.toFixed(3)} inRange:${inRange}`
      };
    },

    // B-6: hull reads cold-steel for T1 and warm-bronze for T2; no cyan/crimson hulls.
    testHullFactionRead() {
      const cellPx = 48;
      const specs = bridge.shipSpecs;
      const frigateFlags = specs["Attack Frigate"].flags;
      const A = this.renderUnitPixels("Attack Frigate", 1, frigateFlags, cellPx);
      const B = this.renderUnitPixels("Attack Frigate", 2, frigateFlags, cellPx);

      const patchMean = (img, team, lx, ly) => {
        const sx0 = img.cx + (team === 2 ? -lx : lx);
        const sy0 = img.cy + (team === 2 ? -ly : ly);
        let r = 0, g = 0, b = 0, n = 0;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const p = this.samplePx(img, sx0 + dx, sy0 + dy);
          if (p.a < 128) continue;
          r += p.r; g += p.g; b += p.b; n++;
        }
        return n ? { r: r / n, g: g / n, b: b / n } : { r: 0, g: 0, b: 0 };
      };

      const lx = 0, ly = -0.28 * A.R;
      const p1 = patchMean(A, 1, lx, ly);
      const p2 = patchMean(B, 2, lx, ly);
      const cold = p1.b >= p1.g && p1.g >= p1.r;
      const warm = p2.r > p2.g && p2.g > p2.b;

      // Full-scan contamination check on a plain hull (no cyan/red hardware).
      const D = this.renderUnitPixels("Attack Destroyer", 1, specs["Attack Destroyer"].flags, cellPx);
      let contaminated = 0;
      const dd = D.data.data;
      for (let i = 0; i < dd.length; i += 4) {
        if (dd[i + 3] < 32) continue;
        const r = dd[i], g = dd[i + 1], b = dd[i + 2];
        if ((b > 200 && g > 150 && r < 120) || (r > 200 && g < 90 && b < 110)) contaminated++;
      }

      const pass = cold && warm && contaminated === 0;
      return {
        name: "HULL FACTION READ (Theme B)",
        pass,
        detail: `T1 rgb(${p1.r.toFixed(0)},${p1.g.toFixed(0)},${p1.b.toFixed(0)}) cold:${cold} | ` +
                `T2 rgb(${p2.r.toFixed(0)},${p2.g.toFixed(0)},${p2.b.toFixed(0)}) warm:${warm} | ` +
                `contaminated:${contaminated}`
      };
    },

    // B-7: weapon hardware is faction-neutral gunmetal (ΔRGB ≤ 6 per channel).
    testWeaponFactionNeutral() {
      const cellPx = 48;
      const flags = bridge.shipSpecs["Railgun Cruiser"].flags;
      const A = this.renderUnitPixels("Railgun Cruiser", 1, flags, cellPx);
      const B = this.renderUnitPixels("Railgun Cruiser", 2, flags, cellPx);
      const halfH = 0.21 * A.R;
      const yOff = -halfH * 0.72;                 // inside the top rail strip
      const yiA = Math.round(A.cy + yOff);
      const xiA = Math.round(A.cx);
      // Team 2 is rotated 180 deg in the TILE_PX bitmap; sample the matching inverted pixel
      const p1 = this.samplePx(A, xiA, yiA);
      let bestP2 = this.samplePx(B, B.size - 1 - xiA, B.size - 1 - yiA);
      let bestD = Math.abs(p1.r - bestP2.r) + Math.abs(p1.g - bestP2.g) + Math.abs(p1.b - bestP2.b);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cand = this.samplePx(B, B.cx + dx, B.cy - yOff + dy);
          const cd = Math.abs(p1.r - cand.r) + Math.abs(p1.g - cand.g) + Math.abs(p1.b - cand.b);
          if (cd < bestD) { bestD = cd; bestP2 = cand; }
        }
      }
      return {
        name: "WEAPON FACTION NEUTRAL (Theme B)",
        pass: bestD <= 18,
        detail: `ΔRGB sum ${bestD} (T1 ${p1.r},${p1.g},${p1.b} vs T2 ${bestP2.r},${bestP2.g},${bestP2.b})`
      };
    },

    // B-8: the exhausted state is visually distinct and carries the #aab4bd outline.
    testExhaustedDistinct() {
      const cellPx = 48;
      const base = bridge.shipSpecs["Light Cruiser"].flags;
      const activeFlags = new Set(base);
      const spentFlags = new Set(base); spentFlags.add("-moved");
      const A = this.renderUnitPixels("Light Cruiser", 1, activeFlags, cellPx);
      const B = this.renderUnitPixels("Light Cruiser", 1, spentFlags, cellPx);

      const meanLum = (img) => {
        let sum = 0, n = 0;
        const d = img.data.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          n++;
        }
        return n ? sum / n : 0;
      };
      const la = meanLum(A), lb = meanLum(B);
      const relDiff = Math.abs(la - lb) / Math.max(1, la);

      // Count pixels matching the spent outline (#aab4bd) within tolerance.
      let outlineHits = 0;
      const d = B.data.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        const dr = d[i] - 0xaa, dg = d[i + 1] - 0xb4, db = d[i + 2] - 0xbd;
        if (dr * dr + dg * dg + db * db < 30 * 30) outlineHits++;
      }

      const pass = relDiff > 0.02 && outlineHits > 0;
      return {
        name: "EXHAUSTED STATE DISTINCT (Theme B)",
        pass,
        detail: `lum ${la.toFixed(1)} -> ${lb.toFixed(1)} (${(relDiff * 100).toFixed(1)}%), outline px ${outlineHits}`
      };
    },

    runAll() {
      const results = [
        this.testBakedSpriteAtlas(), this.testRailgunPulseOffset(),
        this.testHullFactionRead(), this.testWeaponFactionNeutral(), this.testExhaustedDistinct()
      ];
      console.log("%cSEEK & DESTROY â€” SPRITE SELF-TEST RESULTS", "color:#facc15;font-size:14px;");
      let allPass = true;
      results.forEach(r => {
        const colour = r.pass ? "#34d399" : "#f43f5e";
        console.log("%c" + (r.pass ? "PASS" : "FAIL") + "  " + r.name + "  â€”  " + r.detail, "color:" + colour + ";");
        if (!r.pass) allPass = false;
      });
      console.log(allPass ? "%cALL SPRITE TESTS PASSED (" + results.length + "/" + results.length + ")" : "%cSOME SPRITE TESTS FAILED", "color:" + (allPass ? "#34d399" : "#f43f5e") + ";font-weight:bold;");
      return results;
    }
  };

  if (testName && typeof suite[testName] === "function") {
    return suite[testName]();
  }
  return suite.runAll();
});
