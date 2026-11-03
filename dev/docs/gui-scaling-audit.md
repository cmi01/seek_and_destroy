# GUI Scaling Audit — Seek & Destroy

*Status: evidence inventory only. No application code was changed.
Baseline: tag `v105` (`182a75f`), detached worktree. Date: 2026-11-03.
Companion: `dev/docs/gui-scaling-strategy.md`. Screenshots:
`dev/docs/gui-scaling-audit-screenshots/v105/`.*

The game is one canvas. UI size is `uiScale = displaySize / 768`
(`main.js` L28). Device pixels are `renderScale = min(devicePixelRatio, 2)`
(`main.js` L165). This audit is the leak list against that model, measured
on a running build, not inferred from the strategy doc.

## How this was run

Platform: Linux x86_64, HeadlessChrome/145.0.0.0. No Windows or macOS host
was available. OS scaling was forced with Chrome's device-metrics override,
which is the same pair a maximized window gets from Windows/Linux display
scaling: `devicePixelRatio = scale`, CSS viewport = physical panel / scale.

Physical panel modeled for the 100/125/150/200/250% rows: **1920×1080**.

| OS scale | CSS viewport | dpr | displaySize | uiScale | renderScale | backing | content box |
|---|---|---|---|---|---|---|---|
| 100% | 1920×1080 | 1.00 | 1072 | 1.3958 | 1.00 | 1072 | 1070 |
| 125% | 1536×864 | 1.25 | 856 | 1.1146 | 1.25 | 1070 | 854 |
| 150% | 1280×720 | 1.50 | 712 | 0.9271 | 1.50 | 1068 | 710 |
| 200% | 960×540 | 2.00 | 532 | 0.6927 | 2.00 | 1064 | 530 |
| 250% | 768×432 | 2.50 | 424 | 0.5521 | **2.00** | **848** | 422 |

Extra cases, same build:

- Engine minimum canvas: window 208×208, dpr 1 → displaySize **200** (the
  `Math.max(200, …)` floor in `main.js` L160), uiScale 0.2604, font 8px vs
  proportional 4px.
- Window 408×408, dpr 1 → displaySize 400, uiScale 0.5208.
- Fixed CSS 1024×768 at dpr 1 and dpr 2 (displaySize 760), viewSpan 16 and 5.
- DPR change with the CSS viewport held at 800×600.
- Portrait 1080×1920 at dpr 1. Canvas is still 1072 (the short side). Not a
  separate scale. Shot: `v105/portrait100-base.png`.

Screens opened at every OS scale: in-game HUD, menu, help, bridge shop,
campaign starmap, intel overlay, endgame (defeat). Open them from the debug
handle after boot:

```
SD.Hud.toggleMenu(true)
SD.Hud.toggleHelpModal(true)
SD.Hud.toggleBridgeModal(true)
SD.Hud.toggleCampaignModal(true)
SD.Hud.showEndgameModal(false)
SD.Hud.showIntelOverlay("TURN 01 // OPERATIONAL REPORT", ["Sensors confirm a calibration range."])
SD.State.viewSpan = 5
```

Human repro of one OS row: serve the repo (`dev/serve.sh`), maximize Chrome
on a 1920×1080 panel at that display scale, or launch
`google-chrome --force-device-scale-factor=1.5 --window-size=1280,720`.
The harness rAF loop was stalled, so each override was followed by
`HostBridge.handleResize()` (the same function the resize listener calls).
That call is a harness detail, not part of the defect.

The dirty v105 checkout does not boot: uncommitted graphics WIP removed
`Graphics._registerLayer` while `assets/graphics.pak` still calls it
(`TypeError` at `graphics.pak:4`, then BOOT FAILED). That WIP was left
untouched. Scaling logic in the WIP diff is registrar-only; line numbers
below are the committed v105 tree that actually ran.

Nov 2 captures in `dev/docs/gui-scaling-audit-screenshots/` (no `v105/`
prefix) predate v100–v105 and have no metrics. They were not used.

## Defects

Every row was reproduced on v105. "Expected" is proportional scaling with
`uiScale` and a backing store of `round(displaySize × dpr)`, text fully
drawn, nothing off the canvas.

| ID | Screen | DPI / size | Platform | Expected | Actual | Screenshot | Source |
|---|---|---|---|---|---|---|---|
| GS-01 | every screen | all, incl. 100/150/200% | Linux Chrome | content box equals `displaySize`; backing store matches it | 1px border + `box-sizing: border-box` makes the content box `displaySize − 2` on every measured size (1072/1070, 712/710, 532/530, 424/422, 200/198). Backing store is sized to the border box. Hit-testing uses `getBoundingClientRect` (border box). | `v105/os100-base.png` | `graphics.js` L244–246; `main.js` L162–177; `inputs.js` L38–41 |
| GS-02 | in-game HUD | 250% (dpr 2.5) | Linux Chrome | backing store `round(424 × 2.5) = 1060` | `renderScale` caps at 2. Backing store is 848. The browser then upscales that bitmap to the 2.5× panel. 250% is no sharper than 200%. | `v105/os250-base.png` | `main.js` L165 |
| GS-03 | in-game HUD | dpr 1 → 2, CSS held at 800×600 | Linux Chrome | backing store doubles when dpr changes | After the dpr change and one pumped frame, `renderScale` stayed 1 and `canvas.width` stayed 592. A `resize` event then moved it to 2 / 1184. Center-crop Laplacian variance 172 (stale) vs 300 (fresh) on the same 1600×1200 device-pixel capture. | `v105/dpr-stale-no-resize.png`, `v105/dpr-fresh-after-resize.png` | `inputs.js` L119–126 (only `window` `resize`) |
| GS-04 | campaign starmap | 100, 125, 150, 200, 250% | Linux Chrome | subtitle fully readable | Subtitle is ellipsized at every scale, including 100% on a 1072px canvas. Drawn string: "Select a sector node to deploy. Eliminate all Syndicate !flagship vessels to secure it." At 100% the visible text ends in an ellipsis. At 250% measured width 419px vs header budget 301px. | `v105/os100-campaign.png`, `v105/os250-campaign.png` | `uiRenderer.js` L634 (`_fitTextToWidth`) |
| GS-05 | campaign close button | 100, 125, 150% | Linux Chrome | label "CLOSE [ESC]" | Ellipsized. At 100%: text 139px, text budget 111px, button 137×36. Visible label reads `CLOSE [...]`. At 125%: 113 vs 88. At 150%: 93 vs 73. At 200/250% the 82px width floor happens to fit the smaller font, so the bug hides as the window shrinks. | `v105/os100-campaign.png`, `v105/os150-campaign.png` | `buildCampaignLayout.js` L25–29; drawn in `uiRenderer.js` L111–112, L623 |
| GS-06 | endgame buttons | 125%; also DS 400 and DS 200 | Linux Chrome | "REDEPLOY SECTOR" and "SECTOR MAP" | At 125% (DS 856) "REDEPLOY SECTOR" is 153.5px in a 153px text budget. Visible label: `REDEPLOY SECT...`. At DS 400 the same label is 72px vs budget 71px. At DS 200 both buttons ellipsize (`REDEPL...`, `SECTOR...`). | `v105/os125-endgame.png`, `v105/win400-endgame.png`, `v105/win200-endgame.png` | `buildEndgameButtons.js` L18–26; duplicate formula `uiRenderer.js` L794–805 |
| GS-07 | in-game HUD | DS 200 (minimum canvas) | Linux Chrome | labels shrink with `uiScale` and stay whole | Font floor `Math.max(8, round(15 × uiScale))` holds text at 8px while buttons keep shrinking (proportional font would be 4px). Visible: `REINFO...`, `ME...`, `END...`. Top-left status reads `TUTORIAL 01 / C`. Measured text vs budget: REINFORCEMENTS 67>36 (button 41px), MENU v 29>16 (button 21px), END TURN 39>24 (button 29px). | `v105/win200-base.png` | `graphics.js` L196 (`_uiFonts`); button widths `buildTopBarChrome.js` L28–33 |
| GS-08 | help | DS 200 | Linux Chrome | panel and CLOSE stay on the canvas | Panel rect `{x:20, y:-34, w:161, h:269}` on a 200px canvas. CLOSE is at y=223, h=8, off the bottom (`off` hit-test). Body text is cut on the left and runs off the bottom ("bubbles and deals full" is the last visible line). At 100–250% on the 1080p panel the same panel fits (at 250%, rect h=335 on DS 424). | `v105/win200-help.png` (fits at `v105/os250-help.png`) | `buildHelpPanel.js` L42–54 (height tracks row count, `hy = (DS − hh) / 2`, no clamp) |
| GS-09 | endgame | DS 200 | Linux Chrome | title, body, and both buttons readable inside the panel | Panel height is `round(172 × uiScale)` = 45px. Body is clipped to 3 lines and then covered by the buttons. Visible body is only "All friendly". Buttons ellipsize (GS-06). Title "CRITICAL DEFEAT // !FLAGSHIP LOST" still fits. | `v105/win200-endgame.png` | `uiRenderer.js` L763–805 (height L764, 3-line cap L789) |
| GS-10 | bridge shop | 250% and DS 200 | Linux Chrome | close button scales with the header; cards do not sit under it | Close width floors at 88px. At 250% that is 88 vs proportional 59. At DS 200 it is 88 vs proportional 28, on a modal only 176px wide, and the hit rect overlaps `SHOP_BUY:Fighter` by 30×3px and `SHOP_BUY:Probe` by 55×3px. Header reads `REINFORCE...`. Card titles ellipsize (measured: "Missile Frigate" 72>50, "Attack Destroyer" 77>50, "Railgun Destroyer" 82>50, and the longer cruiser/battleship names). | `v105/os250-bridge.png`, `v105/win200-bridge.png` | `buildBridgeShopButtons.js` L15–21; same formula copied in `uiRenderer.js` L380–385 |
| GS-11 | campaign starmap | DS 200 | Linux Chrome | nodes and labels inside the dialog | Header ellipsized (measured 178px vs budget 86px). Visible title `CAMPAIGN STARMAP...`. Node radius floors at 22px (`round(34 × 0.26)` would be 9). Labels under nodes 2–4 are cut by the bottom edge; "NEXT OBJECTIVE" is cut on the left. Hit rects were recomputed inside the 200px canvas; the drawn labels are not. | `v105/win200-campaign.png` | `buildCampaignLayout.js` L40–42; header `uiRenderer.js` L631 |
| GS-12 | board, close zoom | dpr 1 vs 2, CSS 1024×768, viewSpan 5 | Linux Chrome | dpr 2 shows more terrain and sprite detail | Downsampling the dpr-2 capture by 2× matches the dpr-1 capture (mean abs RGB diff 0.05). DPR 2 added no information. Terrain cache is allocated at `ceil(gridSize × cellPx)` CSS px and the cache key omits `renderScale`; the blit is 1:1 in world units under a transform that multiplies by `renderScale`. Sprites are 106px atlas tiles drawn at `ceil(cellPx × 2.2)`. At this size that is ~669 device px, a 6.3× upscale. At viewSpan 16 the dpr-2 frame is not a pure upscale (vector grid/HUD were redrawn; downsample diff ~11/30/42), so the loss is the bitmap layers, not the whole frame. | `v105/dpr1-span5.png`, `v105/dpr2-span5.png` | `graphics.js` L571–572, L616–624, L334–339; blit `backgroundRenderer.js` L138; `themes_DATA.js` L187 `tilePx: 106` |
| GS-13 | HUD chrome | DS 200 vs DS 1072 | Linux Chrome | strokes scale with `uiScale` | 31 `lineWidth` assignments in `uiRenderer.js` are CSS-px literals (1, 1.2, 1.4, 1.5, 2, 2.2). DPR scales them; `uiScale` does not. At DS 200 a 1px stroke is ~5× thicker relative to the 768 design than at DS 1072. | `v105/win200-base.png`, `v105/os100-base.png` | `uiRenderer.js` (31 sites; examples L77, L95, L365, L776) |

Intel and the menu dropdown had no off-canvas buttons and no measured
overlaps at 100–250%. Shots: `v105/os{100,125,150,200,250}-{intel,menu}.png`.
Not listed.

## Reproduction (one path per defect)

Serve committed v105 (the dirty checkout does not boot — see above):

```
git worktree add --detach /tmp/snd-v105-scale refs/tags/v105
python3 -m http.server 8092 --directory /tmp/snd-v105-scale
```

Open `http://127.0.0.1:8092/`. For an OS-scale row, set the viewport as in
the table (display settings, or Chrome device-metrics / `--force-device-scale-factor`
plus the CSS window size). Then the console calls in "How this was run".

- **GS-01.** Any row. In the console, `document.getElementById("battle-canvas").clientWidth`
  is `SD.LayoutMetrics.displaySize - 2`. `getComputedStyle` reports
  `border-top-width: 1px` and `box-sizing: border-box`.
- **GS-02.** 250% row. `devicePixelRatio` is 2.5, `SD.LayoutMetrics.renderScale`
  is 2, `canvas.width` is 848 not 1060.
- **GS-03.** Load at dpr 1, 800×600. Switch the monitor (or
  `Emulation.setDeviceMetricsOverride` with the same width/height and
  `deviceScaleFactor: 2`) without resizing. `canvas.width` stays 592 until
  the window is resized. Compare `v105/dpr-stale-no-resize.png` with
  `v105/dpr-fresh-after-resize.png`.
- **GS-04 / GS-05.** 100% row, `SD.Hud.toggleCampaignModal(true)`. Read the
  subtitle and the close button.
- **GS-06.** 125% row, `SD.Hud.showEndgameModal(false)`. Read the left button.
  Repeat at a 408×408 window and at the minimum window.
- **GS-07 / GS-08 / GS-09 / GS-11.** Shrink until the canvas stops shrinking
  (200px, `main.js` L160). HUD labels ellipsize. Open help: the panel and
  CLOSE leave the canvas. Open endgame: body sits under the buttons. Open
  the starmap: header ellipsizes and node labels clip.
- **GS-10.** Same 200px window, `SD.Hud.toggleBridgeModal(true)`. Also open
  the shop on the 250% row and compare the close button to the header.
- **GS-12.** Fixed CSS size, dpr 1 then dpr 2, `SD.State.viewSpan = 5`.
  The dpr-2 screenshot, halved, matches the dpr-1 screenshot. Terrain edges
  and ship sprites stay soft.
- **GS-13.** Compare a 1px HUD stroke on `v105/os100-base.png` with the same
  stroke on `v105/win200-base.png`.

## Root-cause suspects

Ordered by how many rows they explain. These match the strategy's R1–R7,
plus two defects the strategy did not call out (GS-01, GS-02).

1. **Font floor and lying font keys** — `graphics.js` `_uiFonts` L191–203.
   Every `UI_FONT_SPECS` key (L160–176) resolves to one size,
   `Math.max(8, round(15 × uiScale))`. Below displaySize ≈ 410 the floor
   wins and buttons that still scale (`buildTopBarChrome.js` L28–33) cannot
   hold their labels. Explains GS-07 and makes GS-06/GS-10 worse.
2. **Per-widget `Math.max` floors** — `buildBridgeShopButtons.js` L15–21
   (close 88), `buildCampaignLayout.js` L25–26 and L40–42 (close 82, node
   radius 22), `buildEndgameButtons.js` L19, and the copies in
   `uiRenderer.js` L351, L380–382, L575, L623, L795, L961, L967. Floors
   disagree with each other, so at DS 200 the bridge close button overlaps
   cards while the campaign close button only looks fine because its floor
   is wider than its label. Explains GS-05 (the floor hides it at small
   sizes and not at large ones), GS-10, GS-11.
3. **Panels sized with no canvas clamp** — `buildHelpPanel.js` L42–54 and
   the endgame panel height `uiRenderer.js` L764 plus the 3-line body cap
   L789. Explains GS-08 and GS-09.
4. **Offscreen caches and the atlas ignore device pixels** —
   `graphics.js` `_terrainKey` L571–572 omits `renderScale`;
   `_ensureTerrainCanvas` L616–624 allocates CSS px;
   `backgroundRenderer.js` L138 blits that cache 1:1 under the `renderScale`
   transform. `_blitSprite` L334–339 draws 106px tiles (`themes_DATA.js`
   L187) at `2.2 × cellPx`. Explains GS-12. There is no atlas generator in
   the repo.
5. **DPR is sampled only on `resize`** — `inputs.js` L119–126. Explains
   GS-03. Moving the window to a different-DPI monitor does not have to
   fire `resize`.
6. **Backing-store math in the shell** — `main.js` `computeLayoutMetrics`
   L154–177. It sets `style.width` to `displaySize` and the bitmap to
   `displaySize × renderScale`, but the injected stylesheet
   (`graphics.js` L244–246) makes that width a border box. It also caps
   `renderScale` at 2. Explains GS-01 and GS-02. The cap looks deliberate
   (memory); it is still user-visible at 250%.
7. **Renderer re-derives HUD geometry, and strokes are literals** —
   endgame buttons `uiRenderer.js` L763–805 duplicate
   `buildEndgameButtons.js`; bridge close L380–385 duplicates
   `buildBridgeShopButtons.js`; campaign close fallback L623 duplicates
   `buildCampaignLayout.js`. No hit/draw mismatch was measured in this pass
   (the copies still match). 31 unscaled `lineWidth` literals explain
   GS-13. `leftAvailW = Math.max(160, …)` at L961 is a latent overlap below
   displaySize ≈ 265; the drawn bar at DS 200 stayed clear of the buttons
   because a smaller cap won, so it is not its own row.

## What is not a defect

- UI tracking the board under resize is working. `uiScale = displaySize / 768`
  held from DS 424 to DS 1072: no HUD button left the canvas and no two HUD
  buttons overlapped on the 100–250% rows.
- Portrait vs landscape on a 16:9 panel does not change the square canvas.
  `isWidescreen` is computed (`main.js` L171) and copied into the frame
  (`frameBoard.js` L21) and never read. Dead field, not a visual bug.
- The empty third cell on the last bridge-shop row is 17 cards in a 3-column
  grid, not a clip.
- Fractional-DPR half-pixel edges (strategy §5) were not separated from
  GS-12. 125% and 150% backing stores landed on integers for these viewport
  sizes (1070, 1068).

## Files most likely responsible

- `main.js` — `computeLayoutMetrics`, `LayoutMetrics.uiScale`, the 200px minimum
- `main.js children/inputs.js` — resize listener
- `main.js children/graphics.js` — font floor, terrain cache, sprite blit, border CSS
- `main.js children/graphics.js children/uiRenderer.js` — ellipsis, duplicate geometry, stroke literals
- `main.js children/graphics.js children/backgroundRenderer.js` — terrain blit
- `main.js children/game.js children/hud.js children/buildHelpPanel.js`
- `main.js children/game.js children/hud.js children/buildBridgeShopButtons.js`
- `main.js children/game.js children/hud.js children/buildCampaignLayout.js`
- `main.js children/game.js children/hud.js children/buildEndgameButtons.js`
- `main.js children/game.js children/hud.js children/buildTopBarChrome.js`
- `main.js children/game.js children/themes_DATA.js` (`tilePx: 106`) and `assets/graphics.pak` (atlas; no generator in-repo)

## Disposition (v107)

Implemented on branch `v107` from tag `v106`. The shell owns scale facts. Shared sizes resolve once through `resolveUiMetrics` into `metrics.ui`, and that object is copied onto the HUD input and the frame metrics. Widget floors are gone. Layout checks: `/tmp/hermes-verify-gui-scale-fix.js` ALL PASS at the 100/150/200% display sizes (1072/712/532) plus DS 200/400/768/1440. Live page on a fresh port: content box equals `displaySize` at 100/150/200% (1070/710/530 after the 2px border sits outside), close and redeploy widths match `metrics.ui`, dpr 2.5 backing store is 1055 not a cap of 2, campaign subtitle and `CLOSE [ESC]` are fully drawn, browser suites 16/16 and 5/5. Before-shots remain in `dev/docs/gui-scaling-audit-screenshots/v105/` on the measurement tree; they are not copied into this release (19 MB).

| ID | Status | Reason |
|---|---|---|
| GS-01 | fixed | Canvas is `content-box`; backing store matches the content box. Hits use `clientLeft`/`clientWidth`, not the border box. |
| GS-02 | fixed | `renderScale` is `devicePixelRatio` with no cap of 2. Terrain memory is bounded separately (4096 side). |
| GS-03 | fixed | `main.js` `armDprWatch` listens for `resolution` media-query changes and calls the same resize path. |
| GS-04 | fixed | Campaign subtitle is wrapped in the HUD layout and drawn from those lines. Harness: 2 lines, each inside the header budget at 100/150/200%. |
| GS-05 | fixed | Close button width comes from the label advance plus the button inset, not a floor. Budget covers `CLOSE [ESC]` at 100/150/200%. |
| GS-06 | fixed | Endgame buttons use the same label-fit width. `REDEPLOY SECTOR` budget exceeds the advance estimate at 100/150/200% and at DS 200/400. |
| GS-07 | fixed | Font floor removed. At DS 200, `textPx` is 4 (proportional), and the reinforcements button is sized to that advance. |
| GS-08 | fixed | Help panel and CLOSE are clamped inside the canvas. At DS 200 the rect is `{x:20,y:59,w:161,h:83}` and CLOSE is on-canvas. Extra rows clip inside the panel instead of leaving it. |
| GS-09 | fixed | Endgame panel, wrapped body lines, and buttons come from the HUD DTO. Body bottom stays above the button row at every harness size, including DS 200. |
| GS-10 | fixed | Bridge close no longer floors at 88px. At DS 200 it is 36×7 and does not intersect the first card. The renderer draws the HUD close rect. |
| GS-11 | fixed | Node radius follows `uiScale` (9px at DS 200, not a 22px floor). Node centers are clamped so the label band stays in the canvas. |
| GS-12 | partial | Terrain cache is allocated at `css × density`, density `min(renderScale, 4096 / cssSide)`, and the blit uses that source scale. Full device detail when the cache is under the budget (viewSpan 16 at dpr 2). At viewSpan 5 the 4096 budget still caps the cache, so that extreme zoom does not gain a full dpr-2 bake. Sprite atlas stays 106px tiles — deferred, no art source in the repo. |
| GS-13 | fixed | HUD `lineWidth` literals read `metrics.ui.stroke` (hairline floor is `max(1/renderScale, width × uiScale)`, only in the resolver). World reticles scale with `fontScale`, not `uiScale`. |

Deferred, not a defect row: a higher-resolution atlas (strategy R8) until the art source exists. The optional structure-audit checker for `Math.max` floors was not added; the review-gate question is in `ARCHITECTURE_COMPLIANCE.md` §7.2 item 10.
