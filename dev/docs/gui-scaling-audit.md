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
| GS-14 | HUD/top bar, help, endgame, deploy — every frame after the campaign map has drawn once (battle frames included: canvas 2D state persists across frames) | all sizes and DPRs | Linux Chrome | every text draw owns its alignment; left-anchored labels land on their anchor inside their panel/button | The map-object layer sets `textAlign = "center"` for its node labels and never restores it, so every later left-anchored draw that does not pin its own alignment inherits "center": the label is centered on its left anchor and half of it shifts off the panel/canvas and clips. Help body reads `LOSE`, `NTROLS`, title `1 // CALIBRATION RANGE`; `REINFORCEMENTS` (w 126) centered at x=545 hangs 63px out of its button; `MAP // SOL GATE STATION` (w 207) drawn at x=19 spans −84..122 — half off-canvas. Drawn strings carry no ellipsis and often keep high pixel contrast where the shifted text lands, so the GS-04..GS-11 ellipsis hook could never see this class (the card's gap (b)). | `v163/win1280x800-dpr1-span16-help.png`, `v163/win1280x800-dpr1-span16-base.png`, `v163/win1280x800-dpr1-battle-base.png` | `objectRenderer.js` `drawMapObjects` (`textAlign = "center"`, no restore); consumed by the five `uiRenderer.js` draws that never pinned alignment: `_drawButtonWidget`, `_drawTopLeftHudBar`, `_drawTelemetryCard`, `_drawIntelOverlay`, `_drawHelpModal` (plus `drawBattleWorldReticles`' SEL badge) |
| GS-15 | deploy modal (M2, added v112 — after the GS label sweep) | all sizes and DPRs | Linux Chrome | `DEPLOY n / m CORNER SLOTS — FLAGSHIP IS ALWAYS ON` and `CONFIRM DEPLOYMENT` fully drawn | The capacity line was one unwrapped string, ellipsized to the panel width (`…FLAGSHIP IS ALWAY…`) with a draw span overflowing the canvas (x+w 809 on DS 790); the CONFIRM label ellipsized (`CONFIRM DEPLOYM…`) because the button width came from the `endgameBtnW` floor instead of a label-fit token (the GS-05/GS-06 defect class). | `v163/win1280x800-dpr1-span16-deploy.png` | `buildDeploymentModel.js` (unwrapped capText), `buildDeploymentButtons.js` (confirmW floor), `uiRenderer.js` `_drawDeployModal` (single-line cap draw) |

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
| GS-12 | terrain fixed; atlas deferred | Terrain is a grid of tile canvases (max 2048 device px/side) baked at full `renderScale`, LRU ~64M device px, blit of visible tiles only. viewSpan 5 at dpr 2 is no longer capped by a 4096-side budget. Sprite atlas stays 106px tiles — deferred, no art source in the repo (#3). |
| GS-13 | fixed | HUD `lineWidth` literals read `metrics.ui.stroke` (hairline floor is `max(1/renderScale, width × uiScale)`, only in the resolver). World reticles scale with `fontScale`, not `uiScale`. |

Deferred, not a defect row: a higher-resolution atlas (strategy R8) until the art source exists. The optional structure-audit checker for `Math.max` floors was not added; the review-gate question is in `ARCHITECTURE_COMPLIANCE.md` §7.2 item 10.

## Verification (v108)

Re-measured on tag `v107` (`d6b1174`) from a clean `v108` worktree. Dirty checkout at `/home/ubuntu/seek-and-destroy` (v105 WIP) was not used. Platform: Linux x86_64, HeadlessChrome/145, same 1920×1080 OS-scale rows as the original audit.

Checked-in instruments (repeatable; no application code):

```
node dev/scripts/gui_scale_layout_check.js
python3 dev/scripts/gui_scale_browser_check.py
```

The layout check is the no-browser CI command (HUD rects and label budgets at 100/125/150/200/250% plus DS 200/400/768/1440). The browser check forces Chrome device-metrics, asserts GS-01/02/03 numerically, hooks `fillText` so GS-04..GS-11 labels are drawn without `…`, and writes after-shots under `dev/docs/gui-scaling-audit-screenshots/v108/`. Cited v105 before-shots are in `…/v105/` (subset of the original 19 MB capture).

### Manual checklist (one OS row)

1. `dev/serve.sh` from the repo root. Maximize Chrome on a 1920×1080 panel at that display scale, or `--force-device-scale-factor=N --window-size=W,H` using the table in "How this was run".
2. Console: `document.getElementById("battle-canvas").clientWidth === SD.LayoutMetrics.displaySize` and `getComputedStyle(c).boxSizing === "content-box"` (GS-01). `c.width === Math.round(displaySize * devicePixelRatio)` (GS-02).
3. `SD.Hud.toggleCampaignModal(true)` — subtitle fully wrapped, `CLOSE [ESC]` complete (GS-04, GS-05).
4. `SD.Hud.showEndgameModal(false)` — `REDEPLOY SECTOR` / `SECTOR MAP` complete; body above the buttons (GS-06, GS-09). Reload before the next modal; endgame pins `gameOver`.
5. Shrink until the canvas stops at 200px. HUD `REINFORCEMENTS` complete (GS-07). Help panel and CLOSE on-canvas (GS-08). Starmap nodes/labels inside the dialog (GS-11). Bridge close does not sit on the first card (GS-10).
6. Load at dpr 1, CSS 800×600. Change dpr to 2 without resizing. `canvas.width` should double (GS-03).

### Live metrics (browser check, port 8148)

| Row | displaySize | dpr | clientWidth | backing | box-sizing | GS-01/02 |
|---|---|---|---|---|---|---|
| os100 | 1070 | 1.00 | 1070 | 1070 | content-box | pass |
| os125 | 854 | 1.25 | 854 | 1068 | content-box | pass |
| os150 | 710 | 1.50 | 710 | 1065 | content-box | pass |
| os200 | 530 | 2.00 | 530 | 1060 | content-box | pass |
| os250 | 422 | 2.50 | 422 | **1055** | content-box | pass (was capped 848) |
| win200 | 200 | 1.00 | 200 | 200 | content-box | pass |
| dpr 1→2 no resize | 590 | 2.00 | 590 | **1180** (was 590) | content-box | GS-03 pass |

offsetWidth is displaySize+2 (1px border outside the content box).

### Defect pass/fail

| ID | 100% | 125% | 150% | 200% | 250% / extra | After shot | Before shot | Verdict |
|---|---|---|---|---|---|---|---|---|
| GS-01 | pass | pass | pass | pass | pass at 250% and DS 200 | `v108/os100-base.png` | `v105/os100-base.png` | verified |
| GS-02 | — | — | — | — | pass: backing 1055 at dpr 2.5 | `v108/os250-base.png` | `v105/os250-base.png` | verified |
| GS-03 | — | — | — | — | pass: 590 → 1180 without resize | `v108/dpr-after-no-resize.png` | `v105/dpr-stale-no-resize.png` | verified |
| GS-04 | pass | pass | pass | pass | pass at 250% and DS 200 | `v108/os100-campaign.png` | `v105/os100-campaign.png` | verified |
| GS-05 | pass | pass | pass | pass | pass at 250% and DS 200 | `v108/os100-campaign.png` | `v105/os100-campaign.png` | verified |
| GS-06 | pass | pass | pass | pass | pass at DS 200 | `v108/os125-endgame.png` | `v105/os125-endgame.png` | verified |
| GS-07 | — | — | — | — | pass at DS 200 (`textPx` 4, full `REINFORCEMENTS`) | `v108/win200-base.png` | `v105/win200-base.png` | verified |
| GS-08 | pass | pass | pass | pass | pass at DS 200 (CLOSE on-canvas) | `v108/win200-help.png` | `v105/win200-help.png` | verified |
| GS-09 | pass | pass | pass | pass | pass at DS 200 | `v108/win200-endgame.png` | `v105/win200-endgame.png` | verified |
| GS-10 | pass | pass | pass | pass | pass at 250% and DS 200 | `v108/win200-bridge.png` | `v105/win200-bridge.png` | verified |
| GS-11 | pass | pass | pass | pass | pass at DS 200 | `v108/win200-campaign.png` | `v105/win200-campaign.png` | verified |
| GS-12 | — | — | — | — | terrain fixed in v111; sprite atlas 256px since v132, dpr-2 detail comparison verified | `v133/gs12-sprite-comparison/gs12-scene-sidebyside-span5.png` | `v105/dpr1-span5.png`, `v105/dpr2-span5.png` | verified — terrain see Verification (v111), sprites see Verification (v133) |
| GS-13 | pass | pass | pass | pass | hairline follows `max(1/rs, 1×uiScale)` in the layout check | `v108/win200-base.png` | `v105/win200-base.png` | verified |

Visual read of `v108/os100-campaign.png`: subtitle ends with a period (`…secure it.`), button is `CLOSE [ESC]`. `v105/os100-campaign.png` still shows `CLOSE [...]` and an ellipsized subtitle. `v108/os125-endgame.png`: `REDEPLOY SECTOR` and `SECTOR MAP` complete, body above the buttons. `v108/win200-help.png`: panel and `CLOSE` on the canvas.

### Other suites

Ad-hoc, not "the suite is green": `node --check` on the new script; `structure_audit.py` 0 violations / one-function 0; `reference_audit.py` legacy 6, child-names 0, doc-window 27, import-direction 2 (v107 baseline); `reference_policy_gate.py` PASS. In-browser on fresh port 49945: `SD.runTests` 16/16 and `SD.runAudioTests` 5/5.

### Follow-ups

GS-12 terrain is fixed in v111 (tile cache); the sprite atlas was
regenerated at 256px tiles in v132 and the dpr-1 vs dpr-2 detail comparison
is verified in v133 (see its Verification section). Remaining:

- https://github.com/cmi01/seek_and_destroy/issues/3 — higher-resolution
  sprite atlas: content landed (v132), verified (v133) and wrapped up in
  v136 (full suites green + the two sprite-art contracts restored);
  issue #3 closed by the v136 wrap-up.

The optional `Math.max` floor checker is still not in `structure_audit.py`.

## Verification (v111)

Terrain cache replaced the single 4096-side canvas with a grid of tile canvases (max 2048 device px per side, full `renderScale`, LRU budget 64M device px). Repeatable check:

```
python3 dev/scripts/gui_scale_browser_check.py
```

GS-12 method: CSS 1024×768, `SD.State.viewSpan = 5`, dpr 1 vs dpr 2. Mean abs RGB of the dpr-2 capture downsampled 2× vs the dpr-1 capture (center 50% crop) must be clearly above the v105 baseline of 0.05. Measured (v111, `dev/docs/gui-scaling-audit-screenshots/v111/measurements.json`): **0.9062** vs the 0.05 baseline. Cache at dpr 2 / viewSpan 5: density 2 (was capped below 2 in v105–v108), tilePx 1820 ≤ 2048, visible tiles 1. Layout check ALL PASS at 100/125/150/200/250% plus DS 200; browser check ALL PASS (incl. the GS-12 terrain-density assertion); `?test` suites 25/25 game + 5/5 audio. Structure audit 0 violations / 18 warnings and reference audit 6+27+2 identical to the v110 baseline (which contains v108).

Harness note: a Playwright screenshot resets the page's `devicePixelRatio` to 1 and the shell then re-bakes terrain at the new density, so `gui_scale_browser_check.py` reads metrics and cache state before any screenshot.

## Verification (v118)

GS-12a prep only — no atlas regenerated (issue #3 stays open). The baked
sprite tile edge is now one named value: `SPRITE_ATLAS_TILE_PX` in
`themes_DATA.js` (was `tilePx: 106`), and the object layer's two hidden
copies of it (`DEFAULT_SPRITE_CONFIG.tilePx`, the `cfg.tilePx || 106`
fallback in the slice math) are gone — slice rects derive solely from the
`spriteAtlas` manifest. `_blitSprite` names its draw constant
(`SPRITE_OVERDRAW_CELLS = 2.2`) and writes the source-tile-to-draw-size
ratio down: `(2.2 × cellPx × renderScale) / tilePx`. With the shipped atlas
the ratio reaches ~8.3× at dpr 2 (viewSpan 5, ~1000px display); for ≤ ~1×
at dpr 2 the regenerated tile must be ≥ the sprite's on-screen device size
— 212px tiles give exactly 1.0× at the 768px design at viewSpan 16, 256px
~1.07× at viewSpan 16 on a 1000px display, and viewSpan 5 would need
~880px tiles which the 8×21 embedded atlas cannot hold (accepted residual,
as in R8). The draw is deliberately not clamped to the tile: that would
shrink the 2.2-cell footprint on a low-resolution atlas and tie the
footprint to `renderScale`.

Harness fix: `gui_scale_browser_check.py` `open_screen` now also closes the
deploy modal. Since v112 the boot opens the pre-battle deployment modal —
an opaque full-modal — so the "base" probe measured that modal instead of
the top bar and the check was red at v114 for this alone (flaky 6–14 label
fails per run). With the fix the pre-change (v114) tree also reports ALL
PASS through the same harness, isolating the red to the harness gap.

Measured (v118, `dev/docs/gui-scaling-audit-screenshots/v118/`): layout
check ALL PASS at 100/125/150/200/250% plus DS 200/400/768/1440; browser
check ALL PASS (12 rows). `?test` suites 29/29 game + 5/5 audio, zero page
errors — identical on the clean pre-change tree. Sprite blit parity vs the
pre-change tree is byte-identical (fnv over unit pixels for Fighter /
Battleship / marines-sent Boarding APC at cellPx 24/48/153/205), so
behaviour is unchanged until the new atlas lands. `structure_audit` 0
violations / 17 warnings (18 before — objectRenderer.js is now under 300
lines); `reference_policy_check` 0; `reference_audit` 0 child-names / 27
doc-window / 2 import-direction = baseline.

## Verification (v133)

GS-12 sprite half: the dpr-1 vs dpr-2 comparison of the atlas regenerated at
256px tiles in v132. Artefacts (renders, side-by-side panels, measurements):
`dev/docs/gui-scaling-audit-screenshots/v133/gs12-sprite-comparison/` — the
report in that directory's `README.md` carries the full tables; summary
below.

Method: the same scene (seeded sector 1234, camera over the player
formation, CSS 1024x768, 758x758 canvas) rendered at dpr 1 and dpr 2 at
viewSpan 5 (the GS-12 close zoom) and viewSpan 16 (the atlas design point),
on the v132 tree (256px atlas) and the v131 tree (106px atlas — the
pre-change baseline; the trees differ only in the atlas and
`SPRITE_ATLAS_TILE_PX`). Sharpness is measured on sprite-layer pixels only
(masked by a sprite-off re-render) as mean sub-pixel 10-90% edge transition
width over the strongest 60 edges, plus the share of edges <= 2 device px.

Result — the dpr-2 render carries genuine added detail, not a smoother
upscale of the old tiles:

- At viewSpan 5 / dpr 2 the sprite draws 668 device px (the old 106px tile
  is magnified 6.30x, the new 256px tile 2.61x). Masked sprite edges in the
  dpr-2 render measure **1.72px mean, 80% <= 2px** vs **3.39px / 7%** for the
  old-atlas dpr-2 render (which is the old tiles bilinear-upscaled at the
  same on-screen size) and **3.12px / 5%** for a bilinear 2x upscale of the
  new atlas's own dpr-1 capture (the "smoother upscale" control).
- At viewSpan 16 / dpr 2 (210 device px) the same ordering holds:
  **1.68px / 85%** vs 2.49px / 0% (old atlas) and 3.26px / 5.9% (dpr-1 x2
  control).
- Blit-level (tile bilinear-scaled to the exact on-screen device size,
  5 sprite slots x 2 spans x 2 dprs): the new atlas is sharper in every
  combination — e.g. span 5 / dpr 2 mean edge 2.28-3.00px vs 3.72-4.26px,
  sharpest edge <= 2.34px vs >= 3.20px.
- The new atlas is not a resample of the old one: bilinearly upscaling the
  old 106px tiles to 256px gives 2.92-3.63px mean edges (interpolation blur)
  where the new tiles measure 0.81-1.62px native, and the art differs
  entirely (`gs12-tile-sidebyside.png`).
- The harness GS-12 statistic (dpr-2 capture BOX-downsampled 2x vs the dpr-1
  capture, centre crop) measures **4.35** at viewSpan 5 and **0.75** at
  viewSpan 16 — both far above the v105 no-information baseline of 0.05.

Visuals: `gs12-scene-sidebyside-span5.png` /
`gs12-scene-sidebyside-span16.png` (old atlas dpr 2 | new atlas dpr 1 x2 |
new atlas dpr 2) and `gs12-detail-zoom-span5.png` (hull detail: panel
lines, engine blocks and sensor shapes resolve in the new dpr-2 render and
smear in the old).

Checks with this change: `gui_scale_layout_check.js` ALL PASS (100-250% +
DS 200/400/768/1440), `gui_scale_browser_check.py` ALL PASS (12 rows, shots
in `v133/`), `structure_audit.py` 0 violations, `reference_policy_check.py`
0 violations, `node --check` clean (no game code changed in v133; the atlas
and `SPRITE_ATLAS_TILE_PX` change itself is v132's).

## Verification (v136)

GS-12a wrap-up (issue #3): the complete test battery is green on the 256px
atlas. The wrap-up's first full-suite run found that the v132 atlas
regeneration had broken two pre-existing sprite-art contracts in
`graphicsTests.js` (unchanged since v106) — 43/45 in-page at v133 vs 45/45 at
v131 on the same probe — both fixed here:

- **B-7 weapon faction neutral.** The derivation team-tinted every non-accent
  pixel, so weapon hardware was warm/cool per team (ΔRGB 132 vs the ≤ 18
  contract). The near-black pass-through band now covers the recipe palette's
  hardware colours (`#14171c`; `#2b313a` outlines within tolerance), and the
  Railgun Cruiser top rail housing spans tile y 112–133 so the B-7 hardware
  probe lands on it.
- **B-8 exhausted state distinct.** The `-moved` frames had lost the classic
  `#aab4bd` spent outline (the pre-regeneration atlas baked it on cols
  2/3/6/7). The derivation now paints a `#aab4bd` silhouette rim on every
  `-moved` frame, both teams, all three themes.

All three atlases were regenerated and re-embedded in `assets/graphics.pak`
(byte round-trip verified). Two comment mentions of `campaign_DATA.js` left
by the v134/v135 economy work were reworded per the reference-policy
checker's approved remedy (the gate was red at the merged tip; 0 now).

Checks at the merged tip: `npm test` (Playwright) 28/28; in-page suites
52/52 game + 5/5 audio, zero page errors; `gui_scale_layout_check.js` ALL
PASS (100–250% + DS 200/400/768/1440); `gui_scale_browser_check.py` ALL PASS
(12 rows, shots in `v136/`); atlas verification ALL PASS (manifest = 168
cells × 3 themes, body dim + rim on every `-moved` row, B-7 probe neutral in
all themes); `structure_audit.py` 0 violations (19 warnings), one-function 0;
`reference_policy_check.py` 0.

The GS-12 / issue #3 verdict itself is unchanged from Verification (v133):
the dpr-2 render carries genuine added detail. This release's art delta is
one ship's rail band plus the `-moved` rim — tile size and content scale are
unchanged, so the v133 measurements still characterize the atlas.

## Verification (v165)

Text-visibility card (GS-14 + GS-15): reproduce, root-cause and fix the
user-reported unreadable text on the four surfaces (HUD/top bar, help,
endgame, deploy). Baseline tree: `v163` (`934d072`), detached worktree — the
defect was present unchanged through `v164` (`a83160b`, a concurrent
game.js-decomposition release that touched none of these files; the release
number moved v164 → v165 mid-run when that tag landed first, and the whole
audit battery was re-run against the merged tip).
Reproduction matrix: window 1280x800 @ dpr 1 and 2, 1600x1000 @ dpr 1 and 2,
500x700 @ dpr 1, and the minimum canvas (window 208x208 → DS 200), each at
viewSpan 16 and 5, on the four surfaces — plus the true in-battle scene
(started through the same `SD.SectorGenerator.generate` call
`DEPLOY_CONFIRM` makes). Probes: `/tmp/hermes-verify-text-visibility/`
(`repro_probe.py`, `battle_probe.py`, `matrix_summary.py`, outputs in
`before-v163/`, `after-v165/`, `battle-before/`, `battle-after/`).

### Root causes and fixes

- **GS-14 — leaked draw state (the systemic class).** `objectRenderer.js`
  `drawMapObjects` set `textAlign = "center"` for its map node labels and
  never restored it. Canvas 2D state persists **across frames**, so from the
  first campaign-map frame on, every later left-anchored draw that did not
  pin its own alignment was rendered centered on its left anchor — shifted
  left by half its width and clipped at the panel or canvas edge. The five
  un-pinned draws were exactly the reported surfaces: `_drawButtonWidget`
  (REINFORCEMENTS / MENU v / END TURN / CLOSE / CONFIRM labels),
  `_drawTopLeftHudBar` (status lines), `_drawTelemetryCard`,
  `_drawIntelOverlay`, `_drawHelpModal` (title + every body row), plus
  `drawBattleWorldReticles`' SEL badge. Fix: the leak source is wrapped in
  `ctx.save()/restore()`, and every one of those draws now pins
  `ctx.textAlign` explicitly (defense in depth). The M4-M6 modals
  (station/campaign/bridge/hail) pinned alignment at birth and were never
  affected — matching why parts of the UI looked fine.
- **GS-15 — deploy modal never measured (added v112, after the sweep).**
  The capacity line was one unwrapped string, ellipsized
  (`…FLAGSHIP IS ALWAY…`) and drawn past the canvas edge; `CONFIRM` drew
  `CONFIRM DEPLOYM…` because its button width came from the `endgameBtnW`
  floor. Fix: `buildDeploymentModel.js` wraps the line into `capLines`
  (word wrap on the shared char-advance estimate, never ellipsized),
  `uiRenderer.js` draws the block, `buildDeploymentButtons.js` offsets rows
  past it and sizes CONFIRM from the new label-fit token
  (`ui.confirmDeployW`, `uiTokens_DATA.js` + `resolveUiMetrics.js`).
- **GS-03 instrument gap (hardened, in support of the standing gate).**
  This Chromium no longer fires `matchMedia("(resolution: …)")` `change` on
  a CDP device-metrics override (proven with a bare page: zero events while
  `devicePixelRatio` updates), so the v107 dpr watch cannot re-bake the
  backing store there. The resize path itself is healthy (manual
  `HostBridge.handleResize()` re-bakes 590 → 1180 exactly). `main.js`'s
  frame loop now polls `devicePixelRatio` once per frame as a fallback, so
  a mid-session DPI change never leaves a stale, blurry backing store —
  that staleness is itself a text-visibility defect.

### Instruments (extended)

`dev/scripts/gui_scale_browser_check.py` — the pinned label list now covers
every label on the four surfaces (deploy `DEPLOYMENT` / `CONFIRM DEPLOYMENT`
/ `CORNER SLOTS` / `ALWAYS ON`; endgame `CRITICAL DEFEAT` / `All friendly` /
`REDEPLOY SECTOR` / `SECTOR MAP`; help `CLOSE` / `CONTROLS` / `[LMB]`; base
`REINFORCEMENTS` / `MENU v` / `END TURN` / `MAP //` / `AP 4/4`; plus
campaign/bridge close labels), each with the alignment its owner documents,
and two new assertions beside the ellipsis hook: a **contrast floor** and a
**textAlign assertion** (the direct instrument for the GS-14 class). The
contrast metric is the decile ratio (mean of the brightest 10% of the
label's glyph box vs the darkest 10%); the glyph box is derived from the
recorded `textAlign`/`textBaseline`, and each draw is attributed to the
longest pinned needle it contains (`CONFIRM DEPLOYMENT` never counts as a
draw of `DEPLOYMENT`). **Pinned contrast floor: 3.0 for glyphs ≥ 6px, 2.0
in the 4px hard-minimum band** — chosen from the measurements: the
invisible/covered class measures 1.0–1.25, real 6px+ text 4.46–16.3, and
real 4px text 2.77–5.0 (crowded rows and antialiasing compress the pixel
metric at that size). `dev/scripts/gui_scale_layout_check.js` gained the
GS-15 deploy budgets (CONFIRM label fit, cap block wraps whole, rows in
canvas, rows clear the wrapped block).
Measured (v165, `harness-final/measurements.json`, 228 rows): **ALL PASS** —
108/108 align rows 0 bad, 0 ellipsized draws, contrast worst 2.77
(`CRITICAL DEFEAT`, 4px red accent) and 3.49 next; every ≥ 6px label ≥ 4.46.
Layout check ALL PASS (100–250% + DS 200/400/768/1440).

**Positive control (instrument sensitivity):** the same extended checker
against the pre-fix v164 parent tree reports **104 fails** — every
left-anchored
pinned label 100% wrong-align (e.g. `os100/base align: 38/38 draws of
'REINFORCEMENTS' not textAlign 'left'`), `missing drawn 'CONFIRM DEPLOYMENT'
clipped=['CONFIRM DEPLOYM…']`, and `ALWAYS ON` never drawn whole. The gate
therefore demonstrably catches the defect class it was built for.

### Reproduction matrix (before v163 → after v165)

Per cell, unique non-board labels (rAF duplicates collapsed):

| Cell | help wrong-align | base wrong-align | deploy ellipsis | deploy off-canvas | battle top-bar wrong-align |
|---|---|---|---|---|---|
| 1280x800 dpr1 | 24/24 → 0 | 5/5 → 0 | 2 → 0 | 1 → 0 | 5/5 → 0 |
| 1280x800 dpr2 | 24/24 → 0 | 5/5 → 0 | 2 → 0 | 1 → 0 | 5/5 → 0 |
| 1600x1000 dpr1 | 24/24 → 0 | 5/5 → 0 | 2 → 0 | 1 → 0 | 5/5 → 0 |
| 1600x1000 dpr2 | 24/24 → 0 | 5/5 → 0 | 2 → 0 | 1 → 0 | 5/5 → 0 |
| 500x700 dpr1 | 25/25 → 0 | 5/5 → 0 | 2 → 0 | 1 → 0 | 5/5 → 0 |
| 208x208 (DS 200) | 24/24 → 0 | 5/5 → 0 | 2 → 0 | 1 → 0 | 5/5 → 0 |

Both spans (16 and 5) show identical counts per cell. The endgame modal's
own text draws centered (its documented design) and was correctly aligned in
both trees — its pre-fix readability exposure was the GS-14-shifted chrome
around it and the DS-200 size band below. Before/after shots (v105/v108
convention, before under `v163/`, after under `v165/`):
`win1280x800-dpr1-{base,help,deploy,endgame,battle}.png`,
`win1600x1000-dpr1-{base,help,deploy,endgame,battle}.png`, plus
`win200-{help,endgame,deploy}.png` (before) for the size finding. Full
matrix captures stay in `/tmp/hermes-verify-text-visibility/`.

### Defect pass/fail (re-marked at v165)

| ID | Verdict | Evidence |
|---|---|---|
| GS-03 | verified (hardened) | dpr 1→2 without resize re-bakes 1180 backing (harness `dpr-after` rows); frame-loop fallback added — see root causes |
| GS-04 | re-verified | campaign subtitle + `CLOSE [ESC]` full, align left, contrast ≥ 4.46 at 6px+ (os100–os250 + win200 rows) |
| GS-05 | re-verified | same rows; ellipsis hook + `ellipsized draw` assertion clean |
| GS-06 | re-verified | `REDEPLOY SECTOR` / `SECTOR MAP` full at every harness row and matrix cell |
| GS-07 | re-verified | `REINFORCEMENTS` full at DS 200 (4px proportional); size caveat below |
| GS-08 | re-verified | help panel + CLOSE on-canvas; every help row full (no ellipsis) at all matrix cells |
| GS-09 | re-verified | endgame body above the buttons at every size; DS 200 size caveat below |
| GS-10 | re-verified | bridge rows pass (os rows + win200) |
| GS-11 | re-verified | campaign rows pass |
| GS-12 | unchanged | no terrain/atlas change in v165 |
| GS-13 | unchanged | stroke tokens untouched |
| GS-14 | **fixed** | matrix wrong-align counts → 0 on all four surfaces + battle; 108/108 harness align rows; positive control trips 104 fails on the parent tree |
| GS-15 | **fixed** | deploy labels full at every matrix cell; GS-15 layout budgets ALL PASS; positive control shows the clipped originals |

### Standing gates and suites (v165 tree)

`node --check` clean on every touched `.js`; `structure_audit.py` 0
violations / one-function 0; `reference_audit.py` identical to the v164
parent tree at the merged tip (legacy 6 / child-names 0 / doc-window 27 /
import-direction 2 — the v164 checker on both sides); in-page `?test`
**85/85 game + 5/5 audio**, zero
page errors (one transient favicon 404 in one run; a dedicated response
capture over the full suite run shows zero 4xx); `npx playwright test`
green (see run log). Ad-hoc harness kept on disk:
`/tmp/hermes-verify-text-visibility/` (probe outputs +
`harness-final/measurements.json`).

### Known characteristics and follow-ups (not fixed here)

- **DS 200 glyph size (root-cause candidate 4).** At the 200px hard minimum
  `textPx` is 4 (the v108 proportional design that removed the 8px floor to
  stop clipping). Every label still draws whole and un-ellipsized, but 4px
  glyphs are at the edge of human legibility regardless of contrast
  (measured 2.77–5.0 pixel contrast; the dimmest is the red accent endgame
  title). Fully-drawn AND legible cannot both hold for a 14-character label
  in a 41px button at readable sizes — any font floor re-creates GS-07's
  ellipsis. Resolving this is a design tradeoff (font floor + accepted
  ellipsis at the floor, or raising the canvas minimum to ≈300 where
  `textPx` ≥ 6) and belongs to the scaling strategy, not this defect card.
  **Resolved 2026-11-04 (card `t_8c5a6325`) — Decision record below: option
  3, canvas minimum raised 200 → 300.**
- **M4–M6 modal surfaces (station/outfit, hail/dialogue, mission board).**
  The GS-14 root cause is already fixed for them (leak contained at the
  source; their draws pinned alignment at birth). The remainder is
  instrument coverage: their labels are not in the pinned list. Cheap
  follow-up: extend `PINS` with their labels.

## Decision record — DS 200 4px-glyph legibility (2026-11-04)

**Decided: Option 3 — raise the canvas minimum 200 → 300.** Decision-only
card `t_8c5a6325`; no game code changed here. The implementation is specced
below for a follow-up card.

### The tradeoff

At the 200px hard floor `textPx` is 4 (`round(15 × 200/768)` = 4) and
measured pixel contrast is 2.77–5.0 (worst: the red accent `CRITICAL DEFEAT`,
Verification v165) — at the edge of human legibility regardless of contrast.
Fully-drawn AND legible cannot both hold below DS ≈ 282: at DS 200 the
`REINFORCEMENTS` button budget is 37px (button 42px) while the label needs
14 × 6 × 0.64 = 53.8px at a 6px legible floor, so any font floor re-creates
GS-07's ellipsis at the smallest cells. The v108 proportional design
deliberately chose whole-over-large (removed the `Math.max(8, …)` floor) to
keep the GS-07 bar.

### Options weighed

| Option | Verdict | Evidence |
|---|---|---|
| 1. Accept 4px at the hard floor (status quo) | Rejected | Leaves a known legibility defect reachable — 4px at contrast 2.77–5.0 is legible-with-effort at best; v165 already filed it as root-cause candidate 4. Documentation alone does not make it readable. |
| 2. Font floor `max(6, round(15·uiScale))`, accept ellipsis < DS ~300 | Rejected | Breaks the v165 "no ellipsis at any matrix cell" bar exactly where it would help: at DS 200 `REINFORCEMENTS` needs 53.8px in a 37px budget → `REINFO…`. Between DS 200–282 users get *both* truncated labels and small chrome — strictly less than option 3 delivers, and it costs an acceptance-bar amendment. |
| **3. Canvas minimum 200 → 300** | **Chosen** | At DS 300 `textPx` is 6 (15 × 300/768 = 5.86 → 6) and the full GS layout battery measures ALL PASS at ds282/ds300 (evidence below). Smallest change that makes every label whole AND ≥ 6px; keeps every acceptance bar intact. |
| 4. Zoom-independent HUD text (constant CSS px) | Rejected here | Contradicts the standing "UI never changes scale relative to the game" requirement (strategy §2 rejects browser-zoom-scaled UI and DOM/CSS chrome alike) and is a near-rewrite of the HUD draw path. Unnecessary once option 3 removes 4px text from the reachable range; if the requirement ever changes, the sketch belongs in `gui-scaling-strategy.md` §5. |

This matches strategy §2 "What would change my mind": a minimum legible UI
size is a *policy* implemented centrally (here: the shell's canvas floor),
never as widget floors.

### Measured evidence (this card)

`gui_scale_layout_check.js` battery run at ds200/ds282/ds300/ds400 from an
uncommitted copy (`/tmp/hermes-verify-ds200-decision/layout_check_ds300.js`,
size list substituted; the repo script and all game code are unchanged):

- `textPx`: ds200 → 4, ds282 → 6, ds300 → 6. DS 282 is the first integer
  where `round(15·DS/768)` reaches 6 (boundary DS ≥ 281.6).
- **ds282 and ds300: ALL PASS** on every GS row (GS-04…GS-11, GS-15 incl.
  deploy rows) — not just the font rows. GS-07 at `textPx` 6:
  `REINFORCEMENTS` budget 55px vs estimate 53.8px (button 62px) — whole
  label, fits. GS-15 `CONFIRM DEPLOYMENT` budget 71 vs 69.1 at ds300.
- ds200 at proportional `textPx` 4: budget 37 vs 35.8 (status quo). Under
  option 2's 6px floor the same button would need 53.8 in 37 — the
  quantitative GS-07 break.
- Label budgets at ds282 and ds300 are identical (both `textPx` 6 after
  rounding), so label fit does not discriminate the two; **300 is chosen over
  282 for margin**: `textPx` stays 6 even if the 15px design size is later
  reduced to 14.1px, whereas 282 sits exactly on the rounding boundary (any
  design-size reduction drops it to 5px).

### Spec — new canvas minimum (for the implementation card)

- **Value: 300 CSS px** (displaySize floor; `textPx` = 6 at the floor).
- **Location:** `main.js`, `computeLayoutMetrics()` (L155) — the three
  `Math.max(200, …)` literals at L163–165 (availW, availH, size).
  Implementation: hoist one `const MIN_CANVAS = 300;` used by all three and
  update the L159–161 comment ("The 200px floor is the engine minimum
  canvas, applied once here"). Single central place, per the shell/resolver
  ownership rule (strategy §3); no widget floors touched.
- **Expected window-behavior change below the floor:** the canvas element is
  `DS + 2` (1px border outset) and fits the viewport iff `innerW ≥ DS + 2`;
  `#battle-canvas` has no overflow policy, so an oversized canvas scrolls in
  the document (already today's behavior for windows < 202). After the
  change: windows **202–301px** (either dimension) — which today show a
  fitted DS 200–291 canvas — show a 300px canvas overflowing the viewport by
  up to 100px (scroll/clip); windows **302–309px** show a fitted 300px
  canvas; windows ≥ 310px are unchanged (`DS = inner − 10`). The minimum
  canvas cell convention moves from "window 208×208 → DS 200" to "**window
  308×308 → DS 300**" (smallest exactly-fitting window: 302×302).

### Acceptance bars after this decision

- **GS-07** ("labels shrink with `uiScale` and stay whole"): re-scoped from
  DS 200 to **DS 300 (the new minimum canvas)**. DS 200 rows are unreachable
  as a real page size after the floor change and stand as historical record
  (v105–v165 rows untouched).
- **v165 "no ellipsis at any matrix cell": unchanged as a bar** — option 3
  keeps it whole, which is why it beats option 2. The matrix's minimum cell
  moves from window 208×208 (DS 200) to window 308×308 (DS 300); every cell
  of the updated matrix must still show every label full.
- **Contrast gate bands** (`gui_scale_browser_check.py` `CONTRAST_FLOOR` 3.0
  / `CONTRAST_FLOOR_TINY` 2.0): after the floor change no draw can land in
  the 4px band, so `CONTRAST_FLOOR_TINY` becomes unreachable — keep as a
  dead guard or retire it in the implementation card; the live gate is 3.0
  (≥ 6px glyphs) at every matrix cell.

### Follow-up implementation note

Files to touch:

1. `main.js` `computeLayoutMetrics()` — `MIN_CANVAS = 300` (three literals
   L163–165 + comment L159–161).
2. `dev/scripts/gui_scale_layout_check.js` — size list `["ds200", 200, 1]`
   → `["ds300", 300, 1]` (the `textPx` expectation auto-checks 6).
3. `dev/scripts/gui_scale_browser_check.py` — `boot_at(208, 208, 1.0)` →
   `boot_at(308, 308, 1.0)`; `win200` row + `expected 200` assertion (L563–
   576) → `win300` / `expected 300`; decide keep/retire
   `CONTRAST_FLOOR_TINY`.
4. Release note: the window-behavior paragraph above (windows 202–301 now
   see a scrolling 300px canvas).
5. Docs: a Verification section for the implementation citing the updated
   matrix; historical rows untouched.

Acceptance criteria:

- `computeLayoutMetrics` returns `displaySize ≥ 300` for every window size
  (layout row `ds300` + browser row `win300` assert it).
- Browser check ALL PASS at the updated matrix incl. minimum cell 308×308:
  every pinned label full (0 ellipsized — the v165 bar), align 0 bad,
  contrast ≥ 3.0 (no 4px-band rows).
- Layout check ALL PASS incl. `ds300` (GS-07 budget 55 ≥ estimate 53.8 at
  `textPx` 6).
- GS-08…GS-11 and GS-15 re-verified at the new minimum cell (panel on-canvas,
  CLOSE on-canvas, deploy rows clear the wrapped cap block).
- Standing gates at baseline (`node --check`, structure audit, reference
  audit vs parent tree), in-page suites green, playwright green.
