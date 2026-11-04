# GS-12 sprite comparison — dpr 1 vs dpr 2 with the regenerated atlas

Verdict: **the dpr-2 render carries genuine added sprite detail.** The
sprite layer of the dpr-2 render is measurably sharper than a bilinear
upscale of the old 106px atlas at the same on-screen size, and sharper than
a bilinear 2× upscale of its own dpr-1 render, at both viewSpan 5 (the GS-12
close-zoom case) and viewSpan 16 (the atlas design point).

## Scene and method

The same scene is rendered four ways per tree: seeded sector (seed 1234),
camera left-top cell (2,13) over the player formation, CSS 1024×768 window,
758×758 canvas, `viewSpan` 5 and 16, `dpr` 1 and 2. Trees: the regenerated
256px atlas (v132) and the pre-change 106px atlas baseline (v131) — the two
differ only in the atlas and `SPRITE_ATLAS_TILE_PX`, so the renders isolate
the atlas. Canvas pixels are read via `toDataURL` (a Playwright screenshot
resets the page dpr). All numbers are in `gs12-sprite-measurements.json`.

Sprite-draw size follows the game's own contract
(`ceil(displaySize / viewSpan × 2.2)` CSS px, × dpr for device px), so at
viewSpan 5 / dpr 2 the sprite is 668 device px: the old 106px tile is
magnified 6.30×, the new 256px tile 2.61×. At viewSpan 16 / dpr 2 (210
device px) the old tile is magnified 1.98× and the new tile is drawn at
0.82× (below source resolution).

Sharpness metrics (per luminance crop): **edge_px** = mean sub-pixel 10→90%
edge transition width over the strongest 60 edges (relative gradient
threshold, so soft edges are not filtered out); **sharp ≤2px** = share of
those edges at most 2 device px wide; **min** = the single sharpest edge
(the magnification floor). Scene numbers are measured on sprite-layer pixels
only — isolated by re-rendering each scene with the atlas blits suppressed
and masking the difference — so the vector overlays (grid, HUD text,
selection marks) that are identical in every render do not dilute or inflate
the result. `downsample match` is the harness's own GS-12 statistic (mean
abs RGB of the dpr-2 capture BOX-downsampled 2× vs the dpr-1 capture).

## Numbers

Scene, sprite-layer masked (the dpr-2 render vs the controls):

| crop | new atlas dpr 2 | old atlas dpr 2 (= bilinear upscale of the old tiles) | new atlas dpr 1 ×2 bilinear | downsample match |
|---|---|---|---|---|
| span 5 | edge **1.72px**, sharp ≤2px **80%**, min 0.86 | edge 3.39px, sharp 7%, min 1.31 | edge 3.12px, sharp 5%, min 1.63 | **4.35** (v105 baseline 0.05) |
| span 16 | edge **1.68px**, sharp ≤2px **85%**, min 1.08 | edge 2.49px, sharp 0%, min 2.09 | edge 3.26px, sharp 5.9%, min 1.03 | **0.75** |

Sprite layer exactly as `_blitSprite` draws it (tile bilinear-scaled to the
on-screen device size), 5 slots × both spans × both dprs — the new atlas is
sharper in **every** combination. Representative rows:

| on-screen blit | magnification old / new | mean edge old / new | sharpest edge old / new |
|---|---|---|---|
| span 5, dpr 2 (668px) | 6.30× / 2.61× | 3.72–4.26px / 2.28–3.00px | ≥3.20px / ≤2.34px |
| span 16, dpr 2 (210px) | 1.98× / 0.82× | 2.82–3.48px / 1.20–2.09px | ≥1.62px / ≤1.54px |

Source tiles (not just an upscale of the old art): bilinearly upscaling the
old 106px tile to 256px yields mean edge widths of 2.92–3.63px (the 2.4×
interpolation blur) where the new 256px tiles measure 0.81–1.62px native;
the two art sets differ entirely (see `gs12-tile-sidebyside.png`), so the
new atlas is new content at 2.4× the source resolution, not a resample.

## What the panels show

- `gs12-scene-sidebyside-span5.png`, `gs12-scene-sidebyside-span16.png` —
  same scene: old atlas dpr 2 | new atlas dpr 1 ×2 bilinear | new atlas
  dpr 2. The right panel resolves hull panel lines, engine blocks, nose
  decals and sensor details that are smears in both left panels.
- `gs12-detail-zoom-span5.png` — hull detail zoom at span 5 / dpr 2: the old
  render's features bleed into the background; the new render's edges are
  crisp (red panel block inside a grey circle outline, orange engine blocks).
- `gs12-tile-sidebyside.png` — source tiles: old 106px bilinear→256 vs new
  256px native, per slot.
- `gs12-new-dpr{1,2}-span{5,16}.png` — the required same-scene dpr 1 / dpr 2
  renders with the new atlas; `gs12-old-*` are the pre-change baseline.

## Reproduction

Renders: boot the game headless at 1024×768, `SD.setSeed(1234)`,
`SD.SectorGenerator.generate(levelId)`, `viewX=2, viewY=13`, `viewSpan` 5/16,
`SD.Graphics.render({..., battleOnly: true})`, read `canvas.toDataURL()` at
dpr 1 and 2 (v132 tree and v131 tree). Numbers: edge-width/mask analysis of
those captures and of the atlas tiles (atlas PNGs extracted from
`assets/graphics.pak` in each tree). Full per-slot values in
`gs12-sprite-measurements.json`.
