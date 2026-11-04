# GUI Scaling Strategy — Seek & Destroy

*Status: implemented on branch v107 (from tag v106). Design baseline was tag
`v99` (`deea190`); defect measurements were tag `v105`. Companion: `dev/docs/gui-scaling-audit.md` (defect
inventory, produced separately). Governing standards:
`dev/docs/ARCHITECTURE_COMPLIANCE.md` (structure),
`dev/docs/DESIGN.md` (behavior). All file paths below are relative to the repo
root; `hud/` abbreviates `main.js children/game.js children/hud.js children/`.*

---

## 1. What the UI is today (evidence)

The whole game is **one `<canvas id="battle-canvas">`** (`index.html`). There
is no DOM widget tree and no layout manager: every panel, button and label is
an absolutely positioned rect computed in code and painted with Canvas 2D.
Scaling already runs on three distinct coordinate spaces:

| Space | Unit | Owner today | Evidence |
|---|---|---|---|
| **Device px** (backing store) | physical pixels | `main.js` `computeLayoutMetrics()` | `renderScale = min(devicePixelRatio, 2)`; `canvas.width = round(size × renderScale)` (main.js ~L165–177); graphics core applies it once via `ctx.setTransform(RS,0,0,RS,0,0)` (`graphics.js` ~L746, L850, L876) |
| **Screen / UI px** (CSS px) | the 768×768 **design grid** × `uiScale` | `LayoutMetrics.uiScale = displaySize / 768` (main.js L28) | HUD children compute rects as `Math.round(d * US)` (≈73 sites across `hud/*.js`); `uiRenderer.js` draws with ≈114 more `* US` sites |
| **World px** | grid cells × `cellPx` | `LayoutMetrics.cellPx = displaySize / viewSpan`; `fontScale = cellPx/24`; `textScale = min(fontScale, 2)` | world transform in `graphics.js` ~L772; world fonts `_worldFont`/`_cFont` (`graphics.js` ~L278–289) |

Scale facts propagate as plain data: `LayoutMetrics` → `HostBridge.metrics`
(main.js L46) → `Game` frame input (`game.js` ~L801, `frameBoard.js` L22–27)
→ HUD children (`input.metrics.uiScale`) and → graphics core (`metrics`), which
hands `DS, US, fonts, colors` to `uiRenderer.drawHud`. Input is
resolution-independent: `inputs.js` L38–40 normalizes pointer positions to
`u,v ∈ [0,1]` from `getBoundingClientRect()`.

**The architecture is fundamentally right.** DPR is handled once in the shell;
UI is a uniformly scaled design grid (matching the standing UI requirement
"the UI's size relative to the game never changes, under window resize or
browser zoom", `main.js` L18–24 comment; DESIGN.md L57–59 for in-cell
objects). The defects are *leaks* from that model, not a missing model:

1. **Offscreen caches ignore `renderScale`.** `_ensureTerrainCanvas`
   (`graphics.js` ~L616–637) allocates `gridSize × cellPx` **CSS** px and
   `backgroundRenderer.js` L138 blits it 1:1 in world units under a transform
   that multiplies by `RS` → terrain is 2× upsampled (soft) on every
   DPR-2 display. `_terrainKey` (L571) omits `RS`, so a DPR change never
   re-bakes it. Separately it has no pixel budget: at `viewSpan 5` on a
   1000-px display the cache is 6400×6400 (≈164 MB RGBA) already at 1×.
2. **Raster sprite atlas is under-resolved for HiDPI.** Atlas PNG is
   848×2226 = 8×21 tiles of **106 px** (`themes_DATA.js` `spriteAtlas.tilePx`;
   IHDR decoded from `assets/graphics.pak`). Sprites are blitted at
   `2.2 × cellPx` CSS px (`graphics.js` `_blitSprite` ~L334–341), i.e.
   `2.2 × DS/viewSpan × RS` device px:

   | display | RS | viewSpan 32 | viewSpan 16 | viewSpan 5 |
   |---|---|---|---|---|
   | 768 | 1 | 53 px (0.5×) | 106 (1.0×) | 338 (3.2×) |
   | 768 | 2 | 106 (1.0×) | 211 (2.0×) | 676 (6.4×) |
   | 1000 | 2 | 138 (1.3×) | 275 (2.6×) | 880 (8.3×) |

   (ratio = upscale factor of the 106-px tile). There is no atlas generator in
   the repo (`dev/scripts/` holds only the two audits), so the art source is
   external.
3. **Absolute size floors in widgets.** 28 `Math.max(<const>, Math.round(d*US))`
   floors (15 in `uiRenderer.js`, 13 across `hud/buildBridgeShopButtons.js`,
   `buildCampaignLayout.js`, `buildEndgameButtons.js`, `buildHelpPanel.js`,
   `buildIntelRect.js`, `buildTelemetryCardRects.js`), plus the font floor in
   `_uiFonts` (`Math.max(8, …)`, `graphics.js` L196). Each silently breaks
   proportional scaling below its own threshold (e.g. close button
   `Math.max(88, round(106*US))` stops scaling below a 637-px display), and
   the thresholds differ per widget → overlap/misalignment on small windows.
4. **Geometry derived twice.** The renderer re-computes rects the HUD already
   produced: endgame panel + buttons (`uiRenderer.js` ~L763–803 duplicates
   `hud/buildEndgameButtons.js` L12–27), bridge-shop close button
   (`uiRenderer.js` L380–385 duplicates `hud/buildBridgeShopButtons.js`
   L19–25), help close-button fallback (`uiRenderer.js` L623). Hit rects and
   drawn rects stay equal only by copy-paste discipline.
5. **Shared sizing constants are scattered literals.** UI text size `15` lives
   in `graphics.js` `UI_TEXT_PX` *and* as bare `15 * US` in
   `uiRenderer.js` (L287, L380, L407), `hud/buildBridgeShopButtons.js` L19,
   `hud/buildHelpPanel.js` L44; the monospace advance estimate `0.64em` in
   `hud/buildHelpPanel.js` L20 and twice in close-button formulas; minimap
   `120` in `main.js` L29 and L180 and as a fallback in `uiRenderer.js` L164.
   `UI_FONT_SPECS` (`graphics.js` L160–176) has 15 keys like `"bold:8.5"`
   that all resolve to the *same* size — the key names lie about the size.
6. **Strokes do not scale.** ~30 `ctx.lineWidth = 1 | 1.2 | 1.5 | 2` literals
   in `uiRenderer.js` are CSS px (scaled by DPR via the transform but not by
   `uiScale`), so borders get relatively thinner as the display grows.
7. **DPR changes without a window resize are missed.** The only trigger is
   `window.resize` (`inputs.js` L119–126). Moving the window to a monitor
   with a different DPR is not guaranteed to fire it, leaving `renderScale`
   stale. *(Code-derived; not reproduced in this task.)*
8. **Canvas font family is the generic `monospace`** (`_uiFonts`,
   `_cFont`, `_worldFont`), while the page declares a `--font-mono` stack
   (`graphics.js` L241). Glyph advance therefore varies by OS (≈0.55em
   Consolas, ≈0.60em DejaVu/Menlo), which is why the pure HUD's 0.64em
   estimate must stay conservative.

## 2. Recommended strategy (one)

**Shell-owned scale facts + design-unit tokens resolved once into plain
data.** Keep the existing three-space model and make it airtight:

1. **Device px belong to the shell and the graphics core only.** `main.js`
   is the sole reader of `window.devicePixelRatio` and the sole place that
   sizes backing stores. The graphics core applies `setTransform(RS)` and
   allocates every offscreen cache at `css × RS` device px (with a pixel
   budget). No HUD child, renderer layer or widget ever sees `RS`.
2. **UI geometry is expressed in 768-grid design units** and converted with
   exactly one factor, `uiScale = displaySize / 768`, rounded to integer CSS
   px — no floors, no clamps, no window reads in widgets.
3. **Shared sizes are tokens, not literals.** A frozen data table of design
   units (`uiTokens_DATA.js`) is resolved by one pure function
   (`resolveUiMetrics(tokens, scaleFacts) → ui`) into ready-to-use CSS-px
   integers (text px, button height, pads, line heights, char-advance,
   minimap size, stroke widths). This resolver is the **only** place a floor
   may exist (stroke hairline `max(1/RS, w × US)` — the sub-pixel case). It
   runs in the shell on boot and on every RESIZE, and its result rides on
   `metrics.ui` to both the HUD and the renderer, so both read the same
   numbers.
4. **One geometry source.** HUD children compute every rect, button and
   wrapped text line into the frame DTO; `uiRenderer` draws only what the DTO
   carries and never re-derives a rect (measureText remains allowed for
   ellipsis/fit safety only).
5. **World-space sizing stays camera-driven** (`cellPx`, `fontScale`,
   `textScale`) — by design (DESIGN.md L57–59) and out of scope for `uiScale`.
6. **Raster assets are resolution-matched**: pick the atlas level whose tile
   is ≥ the target device px; ship a higher-resolution atlas level when the
   art source is available (§5, R8).

### Why this and not the alternatives

| Option | Verdict | Reason |
|---|---|---|
| **Rely on toolkit/browser-native HiDPI** (size canvas in CSS only, let the browser upscale; or let browser zoom scale the UI) | Rejected | Canvas 2D has no native HiDPI: a CSS-sized canvas is bitmap-upscaled (blurry) — exactly the terrain defect. Letting browser zoom scale UI independently of the board violates the standing "UI never changes scale relative to the game" requirement. The shell's explicit DPR handling is already the correct native-equivalent; we keep it. |
| **Move HUD to DOM/CSS layout managers** (flexbox overlays, `rem` units) | Rejected | Would give real text layout and free HiDPI text, but: splits rendering across two systems (z-order and screen-flash risk — the no-flash policy), breaks the single hit-test path (normalized canvas `u,v`), forces DOM effects outside `main.js` (ARCHITECTURE_COMPLIANCE §8.2), and is a near-rewrite of 17 HUD children + `uiRenderer.js` (1037 lines). Cost far exceeds the defect list. |
| **Central `scale()` / `dp()` helper module** called by widgets | Rejected as stated; kept in spirit | A shared helper file is a library (§2 bans helpers/utils) and every widget calling it would be a sibling/non-child reference (§4: references flow parent→child only). It also invites DPR leaking into widgets. The resolver in §2.3 delivers the same "one place decides" property as **data passed down**, which the architecture allows. |
| **Vector assets (SVG/procedural ships)** | Rejected for now | Would remove the resolution ceiling, but the ship art is a baked atlas with no in-repo source, state is bit-packed into atlas columns (`sprite_design.md`), and per-zoom SVG rasterization costs more than a mip level. Revisit only if the art pipeline is rebuilt. |
| **Per-widget ad-hoc fixes** (raise a floor here, add a multiplier there) | Rejected | This is how defects 3–5 arose; every one-off floor creates a new threshold where widgets disagree. |

**What would change my mind:** if the product owner wants a minimum legible
UI size on very small windows (< ~640 px), that is a *policy* — implement it
once as a clamp on `uiScale` in `computeLayoutMetrics` (all UI shrinks
together and stays consistent), never as widget floors. If the art source for
the atlas cannot be recovered, R8 degrades to "accept upscaling + document
it" and procedural/vector ships become the longer-term route.

## 3. Module boundaries (who owns which scaling decision)

| Decision | Owner (single) | Consumers receive |
|---|---|---|
| Read `devicePixelRatio`, viewport size; compute `displaySize`, `renderScale`, `uiScale`, `cellPx`, `fontScale`, `textScale`; detect DPR change | `main.js` (`computeLayoutMetrics`, `LayoutMetrics`) + listener wiring in `inputs.js` | `metrics` plain data |
| Design-unit size table | `main.js children/uiTokens_DATA.js` (new; one function returning the frozen table; loaded and held by `main.js`) | — |
| Resolve tokens → CSS-px integers (+ stroke hairline floor) | `main.js children/resolveUiMetrics.js` (new; one pure function), called by `main.js` on boot/RESIZE | `metrics.ui` (frozen) |
| Backing-store sizes, `setTransform(RS)`, offscreen cache resolution and budget | `main.js` (main + minimap canvases) and graphics core `graphics.js` (terrain/sprite caches) | layers draw in CSS/world units only |
| Widget rects, button DTOs, wrapped text lines | the HUD child that owns the widget (`hud/*.js`) | frame DTO |
| Pixels on screen | `uiRenderer.js` / other layers — draw-only from DTO + `metrics.ui` + `fonts` | — |
| World-space sizes (ships, glyphs, warp text) | graphics core via `cellPx`/`fontScale`/`textScale` | — |

Theme/style layer: colors stay in `themes*` / `_uiColors`; **sizes do not live
in the theme** (themes must not change geometry, or hit rects would vary by
theme). Fonts: `graphics.js` resolves font strings from `metrics.ui.textPx`
and one pinned family stack (see R7).

## 4. Rules for contributors

**Adding or changing a UI widget (HUD panel, button, modal, label):**

1. Put the geometry in the widget's **HUD child** (a pure function of
   `input.metrics` + model). Return rects/buttons/lines in the frame DTO. The
   renderer only draws what the DTO carries — never recompute a rect there.
2. Write every size in **768-grid design units**: use a token from
   `metrics.ui` if the size is shared (text, button height, pad, line
   height, close-button size, stroke); otherwise `Math.round(<design units> *
   metrics.uiScale)`. If you need a value twice, it becomes a token.
3. **Never** use `Math.max(<constant>, …)`/`Math.min(<constant>, …)` on UI
   geometry, never read `devicePixelRatio`, `window.*`, `renderScale` or
   `canvas.width` in a widget, and never add a per-widget multiplier.
4. Text width in pure code uses `metrics.ui.charW` (the conservative
   monospace advance); wrap text in the HUD child and carry the lines in the
   DTO. `measureText` in the renderer is for ellipsis/fit safety only.
5. Strokes use `metrics.ui.stroke.{hairline,regular,heavy}`, not literals.
6. Any new offscreen canvas/cache is allocated by the graphics core at
   `cssSize × renderScale` device px, includes `renderScale` in its cache key,
   and respects the pixel budget.
7. World-space objects (anything in a board cell) scale with `cellPx` /
   `fontScale`, never with `uiScale`.

**Review gate (add to ARCHITECTURE_COMPLIANCE §7.2 at the docs sync):** "Does
the diff add a numeric size literal to a renderer, a `Math.max(<const>` on UI
geometry, a `devicePixelRatio` read outside `main.js`, or a rect computed in
both a HUD child and the renderer?" Any yes blocks the change.

**Proof every scaling change must carry:** the **invariant check** — for
display sizes {400, 768, 1440} and DPR {1, 1.5, 2} (CDP
`Emulation.setDeviceMetricsOverride`), every HUD rect divided by
`displaySize` is identical within ±1 CSS px rounding, every drawn button
equals its DTO hit rect, and `canvas.width === round(displaySize × RS)`.

## 5. Prioritized refactors (not implemented here)

Ordered by user-visible impact × risk. Each is one reviewable commit/release;
defect IDs from `gui-scaling-audit.md` should be cited in commit messages.

| # | Pri | Refactor | Files | Depends on | Verification |
|---|---|---|---|---|---|
| R1 | P1 | Terrain cache at device resolution with a pixel budget: size `ceil(gridSize × CP × d)` where `d = min(RS, budgetSide / (gridSize × CP))`, default budget side 4096; add `RS`/`d` to `_terrainKey`; blit with source rect scaled by `d` | `graphics.js` `_ensureTerrainCanvas`, `_terrainKey`; `backgroundRenderer.js` L123–139 | — | DPR-2 emulation: `cache.width === ceil(32×CP×RS)` below budget, ≤4096 at viewSpan 5; screenshot crop of an asteroid edge before/after (sharpness); fresh-port browser suites 16/16 + 5/5. **Superseded in v111:** the single cache canvas is now a tile grid (max 2048 device px/side at full `renderScale`, LRU ~64M device px) — see `gui-scaling-audit.md` GS-12 |
| R2 | P1 | Single geometry source: renderer draws endgame buttons, bridge close button and help close button from the HUD DTO; delete the duplicate formulas | `uiRenderer.js` ~L380–385, ~L623, ~L763–803; `hud/buildEndgameButtons.js`, `hud/buildBridgeShopButtons.js`, `hud/buildHelpPanel.js` (DTO fields only if missing) | — | Probe: wrap `_drawButtonWidget` and assert each drawn rect `===` a frame button DTO at DS {400, 768, 1440}; whole-frame DTO parity vs v99 at 768 |
| R3 | P2 | Introduce `uiTokens_DATA.js` + `resolveUiMetrics.js` (main.js children); expose `metrics.ui`; migrate the shared literals (text 15, button heights 26/28/30, pads 10/18/20, line heights 12/17/24, close button 98/106, charW 0.64, minimap 120) with token values equal to today's literals | `main.js` (`LayoutMetrics`, `computeLayoutMetrics`, loader), new 2 files, `graphics.js` `_uiFonts`, `hud/*.js`, `uiRenderer.js` | R2 | Zero-behavior-change: token values = current literals ⇒ frame DTOs byte-identical to v99 at DS {400, 768, 1440} (vm-boot harness); `structure_audit.py` 0 violations, `reference_audit.py` not above baseline |
| R4 | P2 | Remove the 28 widget floors and the `_uiFonts`/`uiTextPx` font floor (`Math.max(8,…)`) | `uiRenderer.js` (15), `hud/*` (13), `graphics.js` L196 | R3 | Invariant check (§4) at DS 400 now passes where it failed; visual pass at 400/768/1440; behavior change confined to displays < ~640 px (state it in the release note) |
| R5 | P2 | DPR-change detection: `matchMedia('(resolution: <dpr>dppx)')` listener re-armed on each change, pushing the existing `RESIZE` event | `inputs.js` `bindAll` | — | CDP: change `deviceScaleFactor` 1→2 with fixed window size ⇒ `canvas.width` doubles and terrain re-bakes (R1 key) within one RESIZE |
| R6 | P3 | Stroke tokens: replace ~30 `lineWidth` literals with `ui.stroke.*` = `max(1/RS, w × US)` | `uiRenderer.js`, `resolveUiMetrics.js` | R3 | Equal to today at DS 768/RS 1 (US=1); screenshots at 1440 show proportional borders |
| R7 | P3 | Fonts: collapse `UI_FONT_SPECS` aliases to weight-only keys (`bold`, `regular`) with a one-release alias map; pin canvas font family to the `--font-mono` stack; move endgame-body wrapping (`uiRenderer.js` ~L788) into the HUD DTO | `graphics.js` L155–203, `uiRenderer.js`, `hud/buildEndgameModel.js` | R3 | Grep: no `F["…:N"]` key left; wrapped-line counts equal between HUD estimate and renderer at 3 sizes |
| R8 | P4 | Atlas resolution: add a ≥212-px (preferably 256-px) tile atlas level, select level by target device px (`2.2 × CP × RS`), decode only the active theme | `assets/graphics.pak`, `graphics.js` `_initBakedAtlases`/`_blitSprite`, `themes_DATA.js` `spriteAtlas` | **needs the art source** (not in repo) | Table in §1.2 recomputed: upscale ≤1.25× for viewSpan ≥ 16 at RS 2; memory probe of decoded atlases |
| R9 | P4 | Docs sync: add §4 rules + review-gate question to ARCHITECTURE_COMPLIANCE §7.2 and a pointer from DESIGN.md UI section; optional checker rule in `structure_audit.py` flagging `Math.max(\d` with `US` and `devicePixelRatio` outside `main.js` | `dev/docs/*`, `dev/scripts/structure_audit.py` | R4 | Positive-control fixture trips the new check; legacy outputs byte-identical |

Known, accepted limitation: at fractional DPR (1.25/1.5) integer-CSS-px rects
land on half device pixels, so 1-px edges can look slightly soft. Fixing it
would require widgets to know `RS` (violates rule 3); accept unless the audit
shows it as user-visible.

**Decision (DS-200 4px-glyph legibility, 2026-11-04, card `t_8c5a6325`):** the
canvas minimum is raised 200 → 300 (`main.js` `computeLayoutMetrics`, one
constant) so `textPx` ≥ 6 at the smallest reachable canvas — a central shell
policy exactly as §2 "What would change my mind" prescribes, never widget
floors. The v165 "no ellipsis at any matrix cell" bar stands; the matrix
minimum cell moves to window 308×308 → DS 300. Full decision record with the
measured evidence (GS battery ALL PASS at ds282/ds300) and the follow-up
implementation spec: `gui-scaling-audit.md` → "Decision record — DS 200
4px-glyph legibility". Option 4 (zoom-independent HUD text) was evaluated and
rejected there; if that requirement ever changes, the sketch belongs in §5.

## 6. Architecture-compliance risks

1. **Renderer re-derives HUD geometry** (R2) — breaks the pure view-model /
   draw-only renderer split and the "hit rect = drawn rect" invariant.
2. **Duplicated sizing logic** (R3) — same constants in 3–5 files; any fix
   applied to one copy creates drift.
3. **Widget floors** (R4) — per-widget scaling policy hidden in arithmetic.
4. **A future `dp()`/`scale()` helper file** would be a §2 library and a §4
   sibling reference — explicitly disallowed; use `metrics.ui`.
5. **Caches are state.** The terrain/sprite caches live in the graphics core;
   §8.7 moves memo caches to `main.js` in the re-architecture program. R1/R8
   must change cache *resolution* only and not add new cache surfaces, so the
   A07 state-convergence work is not made harder.
6. **Hotspot: `main.js`.** At the time of writing `main.js` carries
   uncommitted A06 AI-tree WIP from a parallel task (`AI_TREE_SCRIPTS`). R3
   and R5 touch `main.js`/`inputs.js`; land them after that WIP is released
   to avoid folding it into a scaling release.
