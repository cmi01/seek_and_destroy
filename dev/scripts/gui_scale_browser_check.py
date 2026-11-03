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
SCREENS = ("base", "campaign", "help", "bridge", "endgame")
ELLIPSIS = "\u2026"
MUST_DRAW = {
    "campaign": ("CLOSE [ESC]",),
    "endgame": ("REDEPLOY SECTOR", "SECTOR MAP"),
    "help": ("CLOSE",),
    "bridge": ("RESUME [SPC]",),
    "base": ("REINFORCEMENTS", "END TURN"),
}


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
            const orig = CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText = function(t, x, y) {
              window.__sdFillText.push(String(t));
              return orig.apply(this, arguments);
            };
          }
          window.__sdFillText.length = 0;
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
