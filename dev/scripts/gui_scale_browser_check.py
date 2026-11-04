#!/usr/bin/env python3
"""Live DPI / OS-scale check for Seek & Destroy.

Boots the game in headless Chromium, forces the same 1920x1080 OS-scale
rows as the audit (100/125/150/200/250%), plus the 200px minimum canvas
and a DPR change that does not resize. Asserts GS-01/02/03 numerically,
that GS-04..GS-11 labels are drawn without an ellipsis, and GS-12
terrain density (viewSpan 5, dpr 1 vs 2).

  python3 dev/scripts/gui_scale_browser_check.py [--root REPO] [--port N]
      [--out DIR] [--skip-shots]

Exit 0 when every assertion passes. Screenshots land under --out.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

import importlib
from PIL import Image, ImageChops, ImageStat


SCALES = [
    # name, cssW, cssH, dpr  — 1920x1080 panel at that OS scale
    ("os100", 1920, 1080, 1.00),
    ("os125", 1536, 864, 1.25),
    ("os150", 1280, 720, 1.50),
    ("os200", 960, 540, 2.00),
    ("os250", 768, 432, 2.50),
]
# Endgame sets gameOver, which pins the HUD on that modal. Probe it last.
SCREENS = ("base", "campaign", "help", "bridge", "deploy", "endgame")
ELLIPSIS = "\u2026"
# GS-14/GS-15 pinned label list: every label on the four reported surfaces,
# with the alignment its owner documents (left-anchored text must draw with
# textAlign "left"; the GS-14 defect class draws it inherited "center").
PINS = {
    "campaign": (("CLOSE [ESC]", "left"),),
    "endgame": (("REDEPLOY SECTOR", "left"), ("SECTOR MAP", "left"),
                ("CRITICAL DEFEAT", "center"), ("All friendly", "center")),
    "help": (("CLOSE", "left"), ("CONTROLS", "left"), ("[LMB]", "left")),
    "bridge": (("RESUME [SPC]", "left"),),
    "deploy": (("DEPLOYMENT", "center"), ("CONFIRM DEPLOYMENT", "left"),
               ("CORNER SLOTS", "center"), ("ALWAYS ON", "center")),
    "base": (("REINFORCEMENTS", "left"), ("MENU v", "left"), ("END TURN", "left"),
             ("MAP //", "left"), ("AP 4/4", "left")),
}
MUST_DRAW = {screen: tuple(needle for needle, _align in pins) for screen, pins in PINS.items()}
# GS-14 legibility floor: WCAG contrast between the label's ink and the
# background under it, measured on the canvas pixels (decile metric — robust
# for sparse 15px text and dense 4px text alike). The broken class this gate
# exists for measured 1.0-1.25 (text drawn in its own background, or clipped
# away); every real label at 6px+ measures 3.5+. 3.0 is the pinned floor for
# normal-size glyphs. At the 4px hard-minimum band (displaySize 200, GS-07's
# proportional design) crowded rows compress the pixel metric — real text
# measures 2.45-4.2 there — so the floor is 2.0, still well over the invisible
# class. Both bands are stated in gui-scaling-audit.md (Verification v165).
CONTRAST_FLOOR = 3.0
CONTRAST_FLOOR_TINY = 2.0
TINY_FONT_PX = 6.0


def free_port(preferred: int) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


def wait_http(url: str, timeout: float = 15.0) -> None:
    import urllib.request

    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                if r.status == 200:
                    return
        except Exception as exc:  # noqa: BLE001 — probe loop
            last = exc
        time.sleep(0.2)
    raise SystemExit(f"server did not come up at {url}: {last}")


def install_hooks(page) -> None:
    page.evaluate(
        """() => {
          if (!window.__sdFillText) {
            window.__sdFillText = [];
            window.__sdFillTextRec = [];
            const orig = CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText = function(t, x, y) {
              window.__sdFillText.push(String(t));
              const tr = this.getTransform ? this.getTransform() : null;
              let w = 0;
              try { w = this.measureText(String(t)).width; } catch (e) {}
              window.__sdFillTextRec.push({
                text: String(t), x: x, y: y, w: w,
                font: this.font || "", fillStyle: String(this.fillStyle),
                align: this.textAlign, baseline: this.textBaseline,
                a: tr ? tr.a : 1, d: tr ? tr.d : 1, e: tr ? tr.e : 0, f: tr ? tr.f : 0
              });
              return orig.apply(this, arguments);
            };
          }
          window.__sdFillText.length = 0;
          window.__sdFillTextRec.length = 0;
        }"""
    )


def collect_metrics(page) -> dict:
    return page.evaluate(
        """() => {
          const c = document.getElementById("battle-canvas");
          const cs = getComputedStyle(c);
          const m = SD.LayoutMetrics;
          return {
            displaySize: m.displaySize,
            renderScale: m.renderScale,
            devicePx: m.devicePx,
            canvasWidth: c.width,
            clientWidth: c.clientWidth,
            offsetWidth: c.offsetWidth,
            boxSizing: cs.boxSizing,
            borderTop: cs.borderTopWidth,
            dpr: window.devicePixelRatio,
            uiTextPx: m.ui && m.ui.textPx
          };
        }"""
    )


def set_metrics(cdp, width: int, height: int, dpr: float) -> None:
    cdp.send(
        "Emulation.setDeviceMetricsOverride",
        {
            "width": int(width),
            "height": int(height),
            "deviceScaleFactor": float(dpr),
            "mobile": False,
        },
    )


def pump_layout(page) -> None:
    page.evaluate(
        """() => {
          window.dispatchEvent(new Event("resize"));
          if (window.SD && SD.Renderer && typeof SD.Renderer.draw === "function") {
            SD.Renderer.draw(performance.now());
          }
        }"""
    )
    page.wait_for_timeout(80)


def wait_boot(page) -> None:
    page.wait_for_function("() => window.SD && window.SD.LayoutMetrics && window.SD.Hud", timeout=30000)
    page.wait_for_timeout(200)


def open_screen(page, name: str) -> None:
    page.evaluate(
        """(name) => {
          const H = SD.Hud;
          if (H.toggleMenu) H.toggleMenu(false);
          if (H.toggleHelpModal) H.toggleHelpModal(false);
          if (H.toggleBridgeModal) H.toggleBridgeModal(false);
          if (H.toggleCampaignModal) H.toggleCampaignModal(false);
          if (H.toggleDeployModal) H.toggleDeployModal(false);
          window.__sdFillText && (window.__sdFillText.length = 0);
          if (name === "campaign") H.toggleCampaignModal(true);
          else if (name === "endgame") H.showEndgameModal(false);
          else if (name === "help") H.toggleHelpModal(true);
          else if (name === "bridge") H.toggleBridgeModal(true);
          else if (name === "deploy") H.toggleDeployModal(true);
          else if (name === "menu") H.toggleMenu(true);
          if (SD.Renderer && typeof SD.Renderer.draw === "function") {
            SD.Renderer.draw(performance.now());
          }
        }""",
        name,
    )
    page.wait_for_timeout(120)


def shot_canvas(page, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    page.locator("#battle-canvas").screenshot(path=str(dest))


def check_row(name: str, m: dict, fails: list[str]) -> None:
    ds = m["displaySize"]
    dpr = m["dpr"]
    if m["boxSizing"] != "content-box":
        fails.append(f"{name} GS-01 box-sizing={m['boxSizing']}")
    if m["clientWidth"] != ds:
        fails.append(f"{name} GS-01 clientWidth={m['clientWidth']} displaySize={ds}")
    expected_backing = round(ds * dpr)
    if m["canvasWidth"] != expected_backing:
        fails.append(
            f"{name} GS-02 backing={m['canvasWidth']} expected={expected_backing} dpr={dpr}"
        )
    if abs(m["renderScale"] - dpr) > 1e-6:
        fails.append(f"{name} renderScale={m['renderScale']} dpr={dpr}")


def canvas_rgb(page) -> Image.Image:
    b64 = page.evaluate(
        """() => {
          const c = document.getElementById("battle-canvas");
          return c.toDataURL("image/png").split(",")[1];
        }"""
    )
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")


def mean_abs_rgb(a: Image.Image, b: Image.Image) -> float:
    if a.size != b.size:
        b = b.resize(a.size, Image.Resampling.BOX)
    diff = ImageChops.difference(a, b)
    return sum(ImageStat.Stat(diff).mean[:3]) / 3.0


def center_crop(im: Image.Image, frac: float = 0.5) -> Image.Image:
    w, h = im.size
    cw, ch = max(1, int(w * frac)), max(1, int(h * frac))
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    return im.crop((x0, y0, x0 + cw, y0 + ch))


def pump_span5(page) -> None:
    page.evaluate(
        """() => {
          const st = SD.State;
          if (typeof SD.setSeed === "function") SD.setSeed(1234);
          const level = st.levelId || 1;
          if (SD.SectorGenerator && typeof SD.SectorGenerator.generate === "function") {
            SD.SectorGenerator.generate(level);
          }
          let ax = 8, ay = 8, found = false;
          const terrain = st.terrain || [];
          for (let x = 0; x < terrain.length && !found; x++) {
            const col = terrain[x];
            if (!col) continue;
            for (let y = 0; y < col.length && !found; y++) {
              if (col[y] === "ASTEROID" || col[y] === "NEBULA") {
                ax = x; ay = y; found = true;
              }
            }
          }
          st.viewSpan = 5;
          st.viewX = Math.max(0, Math.min(27, ax - 2));
          st.viewY = Math.max(0, Math.min(27, ay - 2));
          const g = 32;
          const vis = Array.from({ length: g }, () => Array(g).fill(true));
          window.dispatchEvent(new Event("resize"));
          if (SD.Graphics && typeof SD.Graphics.render === "function") {
            SD.Graphics.render({
              state: st,
              metrics: SD.LayoutMetrics,
              GRID_SIZE: g,
              visCache: vis,
              now: performance.now(),
              battleOnly: true
            });
          } else if (SD.Renderer && typeof SD.Renderer.draw === "function") {
            SD.Renderer.draw(performance.now(), vis);
          }
        }"""
    )
    page.wait_for_timeout(250)
    page.evaluate(
        """() => {
          const st = SD.State;
          const g = 32;
          const vis = Array.from({ length: g }, () => Array(g).fill(true));
          if (SD.Graphics && typeof SD.Graphics.render === "function") {
            SD.Graphics.render({
              state: st,
              metrics: SD.LayoutMetrics,
              GRID_SIZE: g,
              visCache: vis,
              now: performance.now(),
              battleOnly: true
            });
          }
        }"""
    )
    page.wait_for_timeout(80)


def check_gs12(page, boot_at, out: Path, skip_shots: bool, fails: list[str], rows: list[dict]) -> None:
    """GS-12: dpr-2 terrain at viewSpan 5 must carry detail dpr-1 lacks."""
    boot_at(1024, 768, 1.0)
    pump_span5(page)
    im1 = canvas_rgb(page)
    m1 = collect_metrics(page)
    rows.append({"row": "gs12-dpr1", **m1, "viewSpan": 5})
    if not skip_shots:
        shot_canvas(page, out / "gs12-dpr1-span5.png")

    boot_at(1024, 768, 2.0)
    pump_span5(page)
    im2 = canvas_rgb(page)
    m2 = collect_metrics(page)
    rows.append({"row": "gs12-dpr2", **m2, "viewSpan": 5})

    # NOTE: a Playwright screenshot resets the page's devicePixelRatio to 1,
    # and the shell then re-bakes terrain at the new density. Every metric and
    # cache read below must happen BEFORE any shot_canvas call in this check.
    if abs(m2.get("renderScale", 0) - 2.0) > 1e-6:
        fails.append(f"GS-12 renderScale={m2.get('renderScale')} expected 2")
    cache = page.evaluate(
        """() => (SD.Graphics && typeof SD.Graphics.terrainCacheInfo === "function")
          ? SD.Graphics.terrainCacheInfo() : null"""
    )
    rows.append({"row": "gs12-cache", **(cache or {})})
    if not cache:
        fails.append("GS-12 terrainCacheInfo missing")
    else:
        if abs(float(cache.get("density") or 0) - 2.0) > 1e-6:
            fails.append(f"GS-12 terrain density={cache.get('density')} expected 2 at dpr 2")
        if int(cache.get("tilePx") or 0) > 2048:
            fails.append(f"GS-12 tilePx={cache.get('tilePx')} exceeds 2048")
        if int(cache.get("visible") or 0) < 1:
            fails.append("GS-12 no visible terrain tiles baked")
    if im2.size[0] < im1.size[0] * 2 - 2:
        fails.append(f"GS-12 dpr2 canvas {im2.size} not 2x dpr1 {im1.size}")

    crop1 = center_crop(im1, 0.5)
    crop2 = center_crop(im2, 0.5)
    down = crop2.resize(crop1.size, Image.Resampling.BOX)
    mean = mean_abs_rgb(crop1, down)
    rows.append({"row": "gs12-mean-abs", "meanAbsRgb": mean, "dpr1": crop1.size, "dpr2": crop2.size})
    # v105 baseline was 0.05 (no extra dpr-2 information). Terrain tiles at
    # full renderScale must land clearly above that.
    if mean <= 0.05:
        fails.append(f"GS-12 mean abs RGB {mean:.4f} <= 0.05 (no extra dpr-2 terrain detail)")
    if not skip_shots:
        shot_canvas(page, out / "gs12-dpr2-span5.png")


def check_drawn(name: str, screen: str, texts: list[str], fails: list[str]) -> None:
    blob = "\n".join(texts)
    for needle in MUST_DRAW.get(screen, ()):
        if needle not in blob:
            clipped = [t for t in texts if needle.split()[0] in t and ELLIPSIS in t]
            fails.append(
                f"{name}/{screen} missing drawn {needle!r} clipped={clipped[:4]}"
            )
        ell = [t for t in texts if _label_needle(screen, t) == needle and ELLIPSIS in t]
        if ell:
            fails.append(f"{name}/{screen} ellipsized draw of {needle!r}: {ell[:3]}")


FONT_RE = re.compile(r"(\d+(?:\.\d+)?)px")


def _label_needle(screen: str, text: str) -> str | None:
    """Attribution: a record goes to the LONGEST pinned needle it contains,
    so 'CONFIRM DEPLOYMENT' never counts as a draw of 'DEPLOYMENT'."""
    best = None
    for needle in MUST_DRAW.get(screen, ()):
        if needle in text and (best is None or len(needle) > len(best)):
            best = needle
    return best


def _glyph_box(rec: dict, w: float, h: float) -> tuple[float, float, float, float]:
    """Where the glyphs actually are, given the draw's textAlign/textBaseline."""
    a, d, e, f = rec.get("a", 1), rec.get("d", 1), rec.get("e", 0), rec.get("f", 0)
    x0 = rec["x"] * a + e
    y0 = rec["y"] * d + f
    w = w * a
    h = h * d
    align = rec.get("align", "left")
    if align == "center":
        gx0, gx1 = x0 - w / 2.0, x0 + w / 2.0
    elif align == "right":
        gx0, gx1 = x0 - w, x0
    else:
        gx0, gx1 = x0, x0 + w
    baseline = rec.get("baseline", "alphabetic")
    if baseline == "top":
        gy0, gy1 = y0, y0 + h
    elif baseline == "middle":
        gy0, gy1 = y0 - h / 2.0, y0 + h / 2.0
    else:  # alphabetic / hanging
        gy0, gy1 = y0 - 0.82 * h, y0 + 0.22 * h
    return gx0, gy0, gx1, gy1


def _srgb_to_lin(c: float) -> float:
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _rel_lum(px) -> float:
    r, g, b = px[:3]
    return 0.2126 * _srgb_to_lin(r) + 0.7152 * _srgb_to_lin(g) + 0.0722 * _srgb_to_lin(b)


def check_contrast(name: str, screen: str, page, fails: list[str], rows: list[dict]) -> None:
    """GS-14: each pinned label's ink must separate from its background.

    Metric (decile): ink = mean of the brightest 10% of the label's pixels,
    background = mean of the darkest 10%; WCAG contrast between them. A
    uniform box (text invisible, covered, or clipped away) collapses to 1.0.
    Best value over the label's draw records wins (rAF redraws are noisy at
    tiny font sizes).
    """
    im = canvas_rgb(page)
    recs = page.evaluate("() => (window.__sdFillTextRec ? window.__sdFillTextRec.slice() : [])")
    for needle in MUST_DRAW.get(screen, ()):
        best = None
        label_px = None
        for r in recs:
            if _label_needle(screen, r["text"]) != needle:
                continue
            m = FONT_RE.search(r.get("font", ""))
            size = float(m.group(1)) if m else 10.0
            label_px = size
            gx0, gy0, gx1, gy1 = _glyph_box(r, max(r["w"], 1.0), max(size, 1.0))
            W, H = im.size
            ix0 = max(0, int(gx0 - 2))
            iy0 = max(0, int(gy0 - 2))
            ix1 = min(W, int(gx1 + 2) + 1)
            iy1 = min(H, int(gy1 + 2) + 1)
            if ix1 <= ix0 or iy1 <= iy0:
                continue
            crop = im.crop((ix0, iy0, ix1, iy1))
            lums = sorted(_rel_lum(p) for p in crop.getdata())
            n = len(lums)
            if n < 8:
                continue
            k = max(2, n // 10)
            ink = sum(lums[-k:]) / k
            bg = sum(lums[:k]) / k
            hi, lo = max(ink, bg), min(ink, bg)
            cr = (hi + 0.05) / (lo + 0.05)
            if best is None or cr > best:
                best = cr
        floor = (
            CONTRAST_FLOOR_TINY
            if label_px is not None and label_px < TINY_FONT_PX
            else CONTRAST_FLOOR
        )
        rows.append(
            {
                "row": f"{name}/{screen}/contrast",
                "needle": needle,
                "contrast": best,
                "fontPx": label_px,
                "floor": floor,
            }
        )
        if best is None:
            fails.append(f"{name}/{screen} contrast: no measurable draw for {needle!r}")
        elif best < floor:
            fails.append(
                f"{name}/{screen} contrast {best:.2f} < {floor} for {needle!r}"
            )


def check_align(name: str, screen: str, page, fails: list[str], rows: list[dict]) -> None:
    """GS-14 instrument: a left-anchored label drawn with an inherited
    "center" state is half-shifted off its anchor and clips — the ellipsis
    hook cannot see it, and contrast can miss it when the shifted text still
    lands on readable pixels. Assert the recorded textAlign directly."""
    recs = page.evaluate("() => (window.__sdFillTextRec ? window.__sdFillTextRec.slice() : [])")
    for needle, want in PINS.get(screen, ()):
        seen = 0
        bad = 0
        for r in recs:
            if _label_needle(screen, r["text"]) != needle:
                continue
            seen += 1
            if r.get("align") != want:
                bad += 1
        rows.append(
            {"row": f"{name}/{screen}/align", "needle": needle, "want": want, "draws": seen, "bad": bad}
        )
        if seen == 0:
            fails.append(f"{name}/{screen} align: no draw for {needle!r}")
        elif bad:
            fails.append(
                f"{name}/{screen} align: {bad}/{seen} draws of {needle!r} not textAlign {want!r}"
            )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    ap.add_argument("--port", type=int, default=8147)
    ap.add_argument("--out", default=None)
    ap.add_argument("--skip-shots", action="store_true")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    out = Path(args.out).resolve() if args.out else (root / "dev/docs/gui-scaling-audit-screenshots/v111")
    out.mkdir(parents=True, exist_ok=True)
    port = free_port(args.port)
    url = f"http://127.0.0.1:{port}/?guiScaleCheck=1"
    srv = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=str(root),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    fails: list[str] = []
    rows: list[dict] = []
    try:
        wait_http(f"http://127.0.0.1:{port}/")
        sync_playwright = importlib.import_module("playwright.sync_api").sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/local/bin/chromium",
                args=["--no-sandbox", "--disable-gpu"],
            )
            context = browser.new_context(viewport={"width": 1920, "height": 1080})
            page = context.new_page()
            cdp = context.new_cdp_session(page)

            def boot_at(w: int, h: int, dpr: float) -> None:
                page.set_viewport_size({"width": w, "height": h})
                set_metrics(cdp, w, h, dpr)
                page.goto(url, wait_until="domcontentloaded")
                wait_boot(page)
                install_hooks(page)
                pump_layout(page)

            for name, w, h, dpr in SCALES:
                boot_at(w, h, dpr)
                m = collect_metrics(page)
                check_row(name, m, fails)
                rows.append({"row": name, **m})
                for screen in SCREENS:
                    open_screen(page, screen)
                    texts = page.evaluate("() => window.__sdFillText.slice()")
                    check_drawn(name, screen, texts, fails)
                    check_contrast(name, screen, page, fails, rows)
                    check_align(name, screen, page, fails, rows)
                    if not args.skip_shots:
                        shot_canvas(page, out / f"{name}-{screen}.png")

            # Minimum canvas (GS-07..GS-11)
            boot_at(208, 208, 1.0)
            m = collect_metrics(page)
            rows.append({"row": "win200", **m})
            if m["displaySize"] != 200:
                fails.append(f"win200 displaySize={m['displaySize']} expected 200")
            check_row("win200", m, fails)
            for screen in SCREENS:
                open_screen(page, screen)
                texts = page.evaluate("() => window.__sdFillText.slice()")
                check_drawn("win200", screen, texts, fails)
                check_contrast("win200", screen, page, fails, rows)
                check_align("win200", screen, page, fails, rows)
                if not args.skip_shots:
                    shot_canvas(page, out / f"win200-{screen}.png")

            # GS-03: dpr 1 -> 2, CSS held at 800x600, no resize event.
            boot_at(800, 600, 1.0)
            before = collect_metrics(page)
            set_metrics(cdp, 800, 600, 2.0)
            # Wait for the dpr change to land (matchMedia), polling rather than
            # sleeping a fixed 250ms which raced the layout recompute. Do not
            # dispatch resize.
            after = before
            for _ in range(30):
                after = collect_metrics(page)
                if after["canvasWidth"] != before["canvasWidth"]:
                    break
                page.wait_for_timeout(100)
            rows.append({"row": "dpr-before", **before})
            rows.append({"row": "dpr-after", **after})
            if after["dpr"] != 2:
                fails.append(f"GS-03 page dpr stayed {after['dpr']}")
            if after["canvasWidth"] == before["canvasWidth"]:
                fails.append(
                    f"GS-03 backing stayed {after['canvasWidth']} after dpr 1->2 "
                    f"(before {before['canvasWidth']})"
                )
            expected = round(after["displaySize"] * 2)
            if after["canvasWidth"] != expected:
                fails.append(
                    f"GS-03 backing={after['canvasWidth']} expected={expected}"
                )
            if not args.skip_shots:
                shot_canvas(page, out / "dpr-after-no-resize.png")

            check_gs12(page, boot_at, out, args.skip_shots, fails, rows)

            browser.close()
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except subprocess.TimeoutExpired:
            srv.kill()

    report = {"fails": fails, "rows": rows, "out": str(out), "port": port}
    (out / "measurements.json").write_text(json.dumps(report, indent=2) + "\n")
    if fails:
        print(f"FAILS {len(fails)}")
        for f in fails:
            print("FAIL", f)
        return 1
    print("ALL PASS")
    print(f"rows {len(rows)} shots {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
