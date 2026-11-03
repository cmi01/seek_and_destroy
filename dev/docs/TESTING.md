# Seek & Destroy — Test Architecture

Status: **decided**. Every choice below is final; there are no open options.
Basis: the testable-surfaces audit (`origin/main` @ v114, in-page suites re-verified green at v118: 29/29 `SD.runTests()` + 5/5 `SD.runAudioTests()`). Evidence cited as "audit §n" refers to that report.

## 1. Tool choice — Playwright (TypeScript)

**Decision: `@playwright/test` (TypeScript), no other framework.** The audit (§1) confirms there is no framework, no bundler, and **no build step** — `index.html` + `main.js` + the `main.js children/` script tree are served as-is — so Playwright's `webServer` can drive the game exactly as `dev/serve.sh` does, with nothing for a build pipeline to wait on. The game already exposes its entire state through the `window.SD` debug handle (`getRawState`, `Actions.*`, `Hud` view-model, `setSeed`, `saveState/loadState` — audit §3), so tests assert on state rather than pixels and need neither jsdom nor a canvas stub. Vitest + jsdom is rejected explicitly: the game fetches binary `assets/*.pak` over HTTP and renders to a real canvas, which jsdom cannot do, and a canvas stub would throw away the very rendering we need to smoke-test.

## 2. Project layout

`tests/` at the repo root, **outside the game source tree** (`index.html`, `main.js`, `main.js children/`). Nothing is added to the game's ownership tree, so the architectural rule (state only in `main.js`, one pure function per file, single-parent references) is untouched; test helpers are pure functions (page/state in → assertion data out) and hold no module-level mutable state.

```
package.json                  # root; devDependencies: @playwright/test (does not join the game's script tree)
playwright.config.ts          # root; see §3
tests/
  fixtures/
    seeds.json                # canonical RNG seeds and their expected deterministic sector layouts (pure data)
    audio-settings.json       # localStorage payloads for sd.audio.settings.v2 (pure data)
  pages/
    gamePage.ts               # page object: boot URL + query params, canvas box, SD state reads, click a canvas button by id (Hud rect → normalized u,v)
  helpers/
    sd.ts                     # typed pure wrappers over window.SD via page.evaluate (getRawState, runTests, setSeed, Hud view-model, …)
    input.ts                  # synthesize POINTER_MOVE/DOWN/UP, WHEEL, KEY_DOWN/UP events at normalized u,v ∈ [0,1] (audit §3 input surface)
    time.ts                   # page.clock install/advance helpers for State.aiTimers / audioTimers — never real sleeps
  specs/
    01-boot-smoke.spec.ts           # boot & first paint: window.SD defined, canvas == LayoutMetrics.devicePx, no <pre> failure banner, units > 0
    02-sector-generation.spec.ts    # SD.setSeed(42) determinism: two generates → identical unit layout, flagship at lead apex
    03-movement.spec.ts             # selection → executeMove: AP cost, pathing/occupancy, ram (both hulls can die)
    04-combat.spec.ts               # canShoot gate → executeShoot: hp drop, mirage dies to any hit, destroy at hp ≤ 0
    05-turn-cycle.spec.ts           # END_TURN → AI turn → player turn; Harness.testKiting/testFocusFire/testFlee/testRailgunAvoidance as oracles
    06-hud-buttons.spec.ts          # Hud view-model rects → normalized pointer dispatch (END_TURN, MENU_THEME, …); disabled buttons change nothing
    07-endgame.spec.ts              # forced flagship loss → checkEndgame → endgame modal → ENDGAME_RETRY / ENDGAME_MAP
    08-campaign-deployment.spec.ts  # deployment modal, DEPLOY_CONFIRM (flagship forced), battleReserve overflow, credits frozen, applyBattleResult
    09-camera-zoom.spec.ts          # wheel → resolveZoom: cursor-cell anchoring + zoomLadder clamp (ZOOM ANCHOR/CLAMP contract)
    10-persistence-audio.spec.ts    # saveState/loadState round-trip incl. v99 migration; sd.audio.settings.v2 persistence across reload
```

One scenario per spec file (see §7).

## 3. Config file — `playwright.config.ts` (repo root)

```ts
export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,                 // per test
  expect: { timeout: 5_000 },      // auto-retrying assertions
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8123',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,        // pins LayoutMetrics so canvas geometry assertions are stable
    },
  }],
  webServer: {
    command: 'bash dev/serve.sh 8123',
    url: 'http://127.0.0.1:8123/',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
```

## 4. Browser matrix — Chromium only

**Decision: Chromium (Desktop Chrome) is the only project.** Firefox/WebKit are excluded from the default suite and from CI. Cost/benefit: tripling browser installs and roughly tripling runtime would buy coverage of canvas blits, WebAudio and dynamic script loading for which the audit found zero cross-browser divergence evidence — all 34 green in-page results are Chromium-only, and no test CI exists yet to absorb the extra minutes (audit §4). Revisit only when a browser-specific bug is reported or CI budget is proven idle.

## 5. Launching the game under test — `webServer`, never `file://`

**Decision: the `webServer` block above.** `file://` is not an option: the game loads modules via dynamic `<script>` tags and fetches `assets/*.pak` binaries over HTTP — `dev/serve.sh`'s own header states `file://` will not work (audit §1). Exact settings:

- **command:** `bash dev/serve.sh 8123` — i.e. `python3 -m http.server 8123` from the repo root, byte-identical to the documented dev command `bash dev/serve.sh [port]`.
- **url:** `http://127.0.0.1:8123/`
- **reuseExistingServer:** `!process.env.CI` — `true` locally (a hand-started dev server may be reused; safe because each Playwright run launches a fresh browser process, so the audit's per-origin script-cache staleness gotcha, §6, cannot leak across runs), `false` in CI for hermeticity.
- **Port 8123, not the dev default 8000:** no collision with a manual `dev/serve.sh`, and a distinct origin from any long-lived browser session a developer keeps open.

## 6. Canvas rendering strategy — assert on `window.SD` state

The whole UI (HUD, modals, buttons, minimap) is drawn on the single `#battle-canvas`; there are no DOM widgets or `data-testid` hooks (audit §3). Assertions therefore follow this order:

1. **Primary — exposed game state via `window.SD`** (audit §3): `SD.getRawState()` / `SD.State` for units, hp, AP, `activeTeam`, `gameOver`, `rngSeed`, `viewSpan`; `SD.Hud` view-model + `SD.Hud.isModalOpen()` for modal and button state; `SD.Actions.*` to drive logic-level scenarios directly (cheaper and more stable than synthetic clicks).
2. **Secondary — the game's entire DOM surface:** assert the boot-failure `<pre>` banner is **absent** and `#battle-canvas` width/height === `SD.LayoutMetrics.devicePx`.
3. **Last resort — `toHaveScreenshot` is not used in the default suite.** Raw canvas pixel reads (`toDataURL` / `getImageData`) are banned as assertions. If a visual-regression need ever arises, it goes in a separate opt-in `visual` project pinned to one viewport/DPR with committed baselines — never into the default gate.

**Debug hook: none needed.** The audit shows the game already exposes everything the suite requires through `window.SD`, so the contingency "add a `getDebugState()` hook to the game" does **not** apply — there is no follow-up game-source change.

## 7. Determinism

- **Seeded RNG** — call `SD.setSeed(n)` (mulberry32, game.js) before any scenario that generates a sector; the canonical seeds live in `tests/fixtures/seeds.json`; `SD.clearSeed()` at teardown. Additionally install a seeded `Math.random` override via `page.addInitScript` (mulberry32, fixed seed) so anything outside `State.rng` (e.g. graphics background layers) is reproducible too.
- **Time** — `page.clock.install()` before page load; advance with `clock.runFor(...)` to fire `State.aiTimers` (endgame modal timer) and `audioTimers`. No assertion depends on wall-clock time.
- **Waits** — `await expect(...).toPass()` / `expect.poll(...)` for state convergence; auto-retrying assertions only. `waitForTimeout` is banned in this suite.
- **Isolation** — one scenario per spec file; every test gets a fresh Playwright page (default fixture); `tests/` holds no module-level mutable state; each test seeds its own RNG and state at start, so files run in any order and in parallel (`workers: 2`).

## Follow-up (out of scope for this doc)

- Wire `npx playwright test` into GitHub Actions once the repository-admin steps in `dev/docs/REFERENCE_POLICY_CI.md` land (the deploy credential cannot push workflows — audit §4).
