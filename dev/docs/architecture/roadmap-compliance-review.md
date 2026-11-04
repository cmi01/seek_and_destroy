# Seek & Destroy — Roadmap compliance review

**Date:** 2026-11-03  
**Reviewer:** kanban task `t_02d6e801` (independent of the M1/M2 implementer runs)  
**Contracts:** `docs/roadmap.md` (`docs/roadmap` @ `8db8330`); `dev/docs/architecture/roadmap-design.md` (on `origin/main` after the v102 path move)  
**Code under review:** integrated M2 tree `e9229a5` (`milestone/2-battle-campaign`, stacked on M1 `ab58ae6`)  
**Checkout used:** detached worktree `/home/ubuntu/.hermes/kanban/workspaces/t_02d6e801/m2-review`  
**Not touched:** dirty `v105` working tree at `/home/ubuntu/seek-and-destroy`

PRs: [#1](https://github.com/cmi01/seek_and_destroy/pull/1) M1 (`ab58ae6` → GitHub `main`); [#2](https://github.com/cmi01/seek_and_destroy/pull/2) M2 (`e9229a5` → `milestone/1-campaign-state`). Neither is merged.

Judgment is explicit, not generous. “Met” means the acceptance criterion is implemented **and** exercised on a live or test path that the milestone named. A green unit test of an unwired seam is **partial**.

---

## 1. Verdict

| Milestone | Coverage | Notes |
|-----------|----------|--------|
| **M1** | **Mostly met** | Roster, campaign section, persistence and ×100 restore migration hold. Four design deviations, all documented; `game_balance.md` not regenerated. |
| **M2** | **Partial** | Summon / mirage / flagship-lost **unit tests** and live summon-from-reserve hold. The battle↔campaign **seam is not on the live play path**: `beginBattle` / `applyBattleResult` are test-bridge only; sector generate is still the ladder. Boot logs a lifetime-map error for `battleReserve`. |
| **M3** | **Met** | Campaign map shipped: `campaignMap.js` subtree (v126 movement/fuel/merchant + save migration, v129 hyperspace/render, v130 visibility/encounters/HUD/hailing). Battles launch from map encounters (level ladder retired); 40/40 in-page + 28/28 Playwright green at v130. |
| **M4–M6** | **Unmet** | Not started. Next batch. |

The slices **compose in-process** (M2 tree contains M1; M1 tests still pass on the M2 head). They do **not** yet compose with current `main` (`v107` GUI scaling, `d6b1174`): merge-base is `v106` `18788f9`. Four files changed on both sides; `git merge-tree` reported no `CONFLICT` markers.

---

## 2. Per-milestone coverage table

Status: **met** / **partial** / **unmet**. Evidence is the M2 worktree unless noted.

### M1 — Campaign state, roster, persistence

| # | Acceptance criterion (roadmap §4 M1) | Status | Evidence |
|---|--------------------------------------|--------|----------|
| M1.1 | Pure test: every hull row satisfies DESIGN §3.1 (flagship 2.5×, Dreadnought 2× Battleship, crew rounding, flagship scan 8) and every default loadout fits slot capacity | **met** | `CAMPAIGN ROSTER CONFORMANCE (M1)` pass: “22 hulls / 15 weapons conform to DESIGN §3”. Flagship Battlecruiser cost asserted 8750 (Q7 default). |
| M1.2 | Round-trip: save → restore JSON-equals a campaign state with fleet, wallet, cargo, reputation, clock | **met** | `CAMPAIGN STATE ROUND-TRIP (M1)` pass. Schema `M1-1.0`. |
| M1.3 | In-browser suites green; audits at baseline | **met** (baseline = v106, not the roadmap’s v99) | Fresh port 55921: 24/24 game + 5/5 audio. Audits vs v106: structure 0, one-function 0, reference 6, child-names 0, doc-window 27, import-direction 2. Structure **warnings 18** (v106 was 16): `gameTests.js` 460 lines and `objectRenderer.js` 306 lines crossed the 300-line presumption. |

| Design §4.1 / §5.1 deliverable | Status | Notes |
|--------------------------------|--------|-------|
| `campaignState.js` subtree under `game.js` with `initializeCampaignState`, `tryPatchCampaignState`, `rosterOf` | **met** | Direct child of `game.js`; leaves on `GAME_LEAF_SCRIPTS`. |
| CampaignState shape (fleet, wallet, cargo, reputation, clock, map) | **met** | Init from `campaign_DATA` starting package. `InitializeCampaign()` runs at subsystem boot if `State.campaign` is missing. |
| Single roster in `rules_DATA.js` (22×15, ×100, crew = ⌈cost/100⌉) | **met** | No second roster. |
| Persistence via `buildStateSave` / `restoreStateSave`; ×100 migration | **met** | `CAMPAIGN V99 SAVE MIGRATION (M1)`: V58-1.0 credits 35/12 → 3500/1200, income 5/1 → 500/100, campaign section supplied, no double-scale. |
| `getStateLifetimes` → `{profile, fleet, campaign}` | **unmet**, **justified** | Real seam is the lifetime map (`profile` / `match` / `ai` / `camera` + `campaign`). No `fleet` lifetime; roster lives in the campaign section. Documented in `beginningGameState_DATA.js`. |
| `initializeCampaignState(campaignData)` only | **unmet**, **justified** | Second arg `shipSpecs` so the child does not reach a sibling table. |
| Regenerate `dev/docs/game_balance.md` from data (roadmap §5.2, design R9) | **unmet**, **not justified as done** | File still titled “v70”. Follow-up F2. |
| Dedicated art for four new hulls | **unmet**, **justified** | Sprite-row aliases in `objectRenderer.js`; atlas suite reports 22 types. |

### M2 — Battle ↔ campaign integration

| # | Acceptance criterion (roadmap §4 M2) | Status | Evidence |
|---|--------------------------------------|--------|----------|
| M2.1 | Summon costs exactly 1 AP and 0 credits; any hit destroys a mirage; ram destroys both; losing the flagship → campaign-over | **met** | Tests still pass. Live `checkEndgame` folds via the campaign seam before the modal (flagship-lost → `campaignOver`). Turn change no longer ticks `credits`/`income` (Q3); HUD shows campaign wallet read-only. Test `M2 BATTLE CREDITS FROZEN`. |
| M2.2 | Pure tests over a seeded battle: post-battle state equals specified carry-over | **met** | `M2 BATTLE CARRY-OVER` plus live-path `M2 LIVE PATH CARRY-OVER` (campaign fleet > corner capacity → reserve; finish battle → fleet/parts/crew/wallet JSON). `SectorGenerator.generate` takes hull lists from the battle-setup seam; ladder table is encounter source only. |
| M2.3 | Suites green; audits at baseline | **met** | Count grows with the three new M2 live-path tests. Audits held at baseline (legacy 6 / child-names 0 / doc-window 27 / import-direction 2). |

| Design §4.2 / §5.2 deliverable | Status | Notes |
|--------------------------------|--------|-------|
| `beginBattle` / `applyBattleResult` as the **only** battle↔campaign translators | **met** | Live generate builds the encounter, then the setup seam; live `checkEndgame` packs a BattleResult and folds it before the modal. |
| `planDeployment` (overflow → reserve) | **met** | Used on live generate. Overflow → `State.battleReserve`. Pre-battle deploy modal (HUD child, v107 metrics); default selection = seam order so no-input start stays deterministic. Flagship always deploys (Q2/F6 justified: warp locus + permadeath target). Test `M2 DEPLOYMENT FLAGSHIP FORCED`. |
| `computeCrewLost` | **met** (as a function) | `Math.floor(crew * 0.5 * damage/maxHp)`. Used by `applyBattleResult` (tests), not by live combat. |
| Summon = 1 AP, 0 credits; shop → reserve view | **met** for HUD + warp | `buildReserveModel` / `buildReserveButtons` replaced `buildBridgeShop*`. Cards show `cost: 0`. |
| `materializeMirages`; `unit.kind` `"ship"` \| `"mirage"` | **met** | Live: called from `transitionToAITurn` / `transitionToPlayerTurn` for that team. Shoot/ram outcomes special-case mirage. |
| Warp locus = visible ∩ empty ∩ non-asteroid ∩ within 3 of flagship | **met** | `listWarpCells` + `executeWarpIn` radius 3; `#capital ship` warp role dropped. |
| Endgame `{ over, reason: "flagship-lost" }` | **met** in the status DTO | `over` is true only when **team-1** flagship count is 0 (player permadeath). |
| `-shielded` latch folded into M2(a) if DESIGN unmet | **unmet** | Latch still written in `executeShield`, cleared on turn, gated in `canUnitShield`, described in `flagDescriptions`, seeded on spawn. No M2 grep+harness recorded. Follow-up F4. |
| Injected sibling transforms / composer aliases | **justified** | `beginBattle(..., deployFn)`, `applyBattleResult(..., shipSpecs, crewLostFn)`; `game.js` methods `splitOverflow` / `crewLostFromDamage` / `listWarpCells` so the composer does not spell grandchild stems. |
| HUD signatures `(state, hudDeps)` | **justified** | Existing HUD convention is `(deps, input)` / `(input, bridgeModal)`. |
| `battleReserve` in the lifetime map | **met** | Landed in v110 (`lifetimes.match`). |

### M3 — Campaign map

| # | Criterion | Status |
|---|-----------|--------|
| M3.1 Fuel formula / unfuelled merchant event / detection radius = ship count | **met** — exact formula + rejections + merchant offer (v126); detection radius = ship count (`mapVisibility.js`, v130). In-page "M3 FUEL FORMULA …" / "M3 DETECTION RADIUS …"; ad-hoc `/tmp/hermes-verify-t_ab74f8de/verify-m3.js` + `verify-m3c.js` |
| M3.2 Browser traverse system → hyperspace → system | **met** — v129: live traverse with fuel 500 → 485 → 273.85 → 129.35; red gravity-well-only render screenshots at 1200/768 px (card evidence/) |
| M3.3 Encounter entry → battle next turn via the M2 seam; result folds back to the map (Q4) | **met** — v130: `battleEventAt.js` + orchestrator; live chain (encounter → hail shell → next turn → deployment → battle → victory fold) + Playwright 11-campaign-map.spec.ts |
| M3.4 Map HUD + hailing shell (voice placeholder) | **met** — v130: `buildMapHudModel.js` / `buildHailModel.js` (hud.js children) + `_drawHailPanel`; HAIL_TALK/THREATEN/LEAVE |
| M3.5 Save/restore round-trip incl. map; old-save migration | **met** — in-page "M3 MAP SAVE ROUND-TRIP + MIGRATION" (no new persisted fields in v130: hail state is HUD-view only) |

Campaign-map subtree complete: `campaignMap.js` children `buildMapState`, `moveFleet`, `hyperspaceJump`, `fuelCost`, `mapVisibility`, `battleEventAt`, `merchantOffer`, `mapFrame`; hud.js children `buildMapHudModel`, `buildHailModel`. The map is the campaign's main screen at boot (the deploy modal opens from an encounter); the level ladder no longer launches battles (`LEVEL_SELECT` retired).

### M4 — Economy, stations, crew

| # | Criterion | Status |
|---|-----------|--------|
| M4.1 Seeded prices; buy-then-sell loses the spread | **met** — v134: `economy.js` subtree (`buildMarketState`/`priceAt`/`applyTrade`) + `campaign_DATA.js` trade tables; in-page "M4 SEEDED PRICE DETERMINISM" / "M4 BUY-THEN-SELL LOSES EXACTLY THE SPREAD" (gap 43 = round(356 × 0.12); loss 215 = 5 × 43 exactly) / "M4 BUY A HULL UPDATES WALLET/CARGO/FLEET" / "M4 ILLEGAL TRADES REJECTED"; ad-hoc `/tmp/hermes-verify-t_abaf9305/verify-m4a.js` (12/12) |
| M4.2 Crew casualty / 50% incapacitation / monthly wages | **met** — v138: `economy.js children/payWages.js` (month clock: 5 ⒸB/crew/month ceil — 87.5 → 88; month = 30 map turns (Q6); year rollover; unpaid ⇒ desertion most-expensive-hulls-first) + `actionLegality.js children/crewStatus.js` (strictly-under 50% ⇒ "incapacitated") gating every battle verdict + `planDeployment` (non-flagship; the flagship ALWAYS deploys per Q2 but cannot act) + the reserve-summon path; battle manning rides the roster crew onto spawned units so the gate sees real crew all battle. In-page "M4 CREW CASUALTY FORMULA" / "M4 CREW 50% GATE: ACT + DEPLOY" / "M4 WAGES MONTH TICK"; ad-hoc `verify-m4c.js` (10/10) |
| M4.3 Browser: buy a hull at a station | **met** — v135: the station modal (`buildStationModel.js` + `_drawStationModal` + map-HUD opener) replaces the bridge shop as the general storefront — GOODS/HULLS/WEAPONS tabs with posted quotes, SERVICE tab (repair = proportional HP restore, refit = hull-default loadout at parts-per-swap), all consuming parts. Real-button evidence at SOL GATE STATION: wallet 25000 → 24480 (−520 = posted quote), fleet 5 → 6 (Fighter, full crew), cargo untouched; save/reload JSON-identical. Playwright `12-economy-station.spec.ts` (2 acceptance specs; suite 30/30) |
| M4.4 Merchant-fleet flow wired (M3 placeholder → real service) | **met** — v139: `pendingMerchant` records the M3 offer on the rejected move and the storefront opens in merchant mode — PROVISIONS (crew/fuel at the inflated ×1.3) / SELL (anything at the discount ×0.7), executed at posted prices; buying fuel rescues the stranded fleet and the next move goes through (caravan dismissed). In-page "M4 MERCHANT FLOW: STRANDED FLEET RESCUED" / "M4 MERCHANT SALE: ANYTHING AT THE DISCOUNT"; Playwright merchant-rescue spec |

Shipped surface: `economy.js` children `buildMarketState`, `priceAt`, `applyTrade`, `payWages`; `campaignState.js children/applyStationService.js` (repair/refit); `actionLegality.js children/crewStatus.js`; `hud.js children/buildStationModel.js`; trade tables in `campaign_DATA.js` (R9). Ad-hoc harnesses: `verify-m4a.js` (12/12), `verify-m4b.js` (5/5), `verify-m4c.js` (10/10) under `/tmp/hermes-verify-t_abaf9305/`.

**Adopted decisions (M4)** — recorded here per the plan's flip-on-a-word convention:
1. **Posted prices** (design §5.4 comment reading): the quote the storefront shows is the price the trade executes at; trading nudges the location's price multiplier for the *next* quote. This is what makes "buy-then-sell loses exactly the spread" hold as an exact identity (the round-trip at one quote loses exactly `qty × (buy − sell)`), while still honoring "buying moves the local price".
2. **Flagship deployment exemption** (Q2): a ship under 50% crew cannot deploy — except the flagship, which ALWAYS deploys (warp locus / permadeath target) but cannot *act* while incapacitated. `planDeployment` + the deploy modal enforce this ("(LOW CREW)" rows are locked).
3. **Refit** = restore the hull's default loadout, parts charged per swapped weapon position (M5's outfit modal owns custom swaps/slot validation). Repair = proportional HP restore (1 part/HP by table).
4. **Weapons inventory** = `cargo.weapons` (count map) — the station's weapons tab stocks it; M5's outfitting consumes it.
5. **The month clock lives in the wage tick** (`payWages` advances `clock.month/year`, base year 2401): one pure transform per map-turn commit, no-op until the 30-turn boundary.
6. **Manning on battle units**: `buildUnitRecord` ships `crew/maxCrew` (full by default); the deploy/warp-in seams overlay the roster entry's actual crew, and the battle fold reads the same numbers back (M2's carry-over semantics unchanged for full-crew ships).

### M5 — Outfitting / multi-weapon

| # | Criterion | Status |
|---|-----------|--------|
| M5.1 Slot-sum validation; two weapons fire with own dmg/range | **unmet** |
| M5.2 Red numbers show the chosen weapon | **unmet** |

No `outfitting.js`. Battle units still use `wType` / `firepower` / `range`. Dual representation (roster `loadout` vs battle stats) is contained only inside the unwired seam (design R3 still open).

### M6 — Factions, reputation, missions, world life

| # | Criterion | Status |
|---|-----------|--------|
| M6.1 Reputation quintile boundaries | **unmet** |
| M6.2 Seeded NPC fleet interaction without player input | **unmet** |
| M6.3 Doctrine-weighted fleet generation (≥90% Armoury capital) | **unmet** |

No `factions.js` / `reputation.js` / `missions.js` / `mapAi.js`. Reputation keys exist as zeros in M1 campaign state (shape only).

---

## 3. Architecture-design compliance (boundaries)

Checked against design D1–D6, §4–§5, and the five seams.

**Respected**

- D1: new M1/M2 stems parent under `game.js` (`campaignState.js`, `materializeMirages.js`).
- D2: one roster table.
- D6: new files are one function named for the file, with Owner headers; folder tree matches ownership; `PARENT_OF` updated in `reference_audit.py`.
- Campaign children do not touch rendering or storage.
- Mirage is `unit.kind`, not a parallel entity type.
- Frame DTO and `Actions.*` spellings unchanged.

**Deviations — justified (keep)**

| ID | Deviation | Why it stands |
|----|-----------|----------------|
| J1 | `initializeCampaignState(campaignData, shipSpecs)` | Child cannot name a sibling data module. |
| J2 | Lifetime map extended, not rewritten to `{profile, fleet, campaign}` | Matches the actual save seam; documented. |
| J3 | `rosterOf(section, …)` parameter name | Child-names-parent checker. |
| J4 | Sprite aliases for new hulls | Art not in scope. |
| J5 | Injected `deployFn` / `crewLostFn` / `shipSpecs` on the M2 seam | Same parent→child rule as J1. |
| J6 | Composer method aliases (`splitOverflow`, …) | Stops `game.js` mentioning grandchild stems. |
| J7 | HUD `(deps, input)` vs design `(state, hudDeps)` | Pre-existing HUD bag convention. |

**Deviations — not justified (follow-up)**

| ID | Deviation | Design clause | Follow-up |
|----|-----------|---------------|-----------|
| D-A | ~~Live battles still launch from generate + spawn lists~~ **closed (v112)** | Live generate consumes the setup seam; ladder is encounter source only | F3 |
| D-B | ~~Live checkEndgame skipped the fold seam~~ **closed (v112)** | Fold runs before the modal | F3 |
| D-C | `battleReserve` missing from `lifetimes.match` | **closed (v110)** | F1 |
| D-D | `game_balance.md` still v70 after ×100 | roadmap §5.2, design R9 | F2 |
| D-E | `-shielded` latch still live | design §7 fold-into-M2(a) | F4 |
| D-F | ~~In-battle credits/income still tick~~ **closed (v112)** | Q3: no tick; HUD wallet read-only | F5 |
| D-G | M1/M2 not rebased onto `v107` | **closed (v109/v110 on main)** | F0 |
| D-H | Flagship always deploys before `choice` | **justified (Q2 ruling)**: flagship is the warp locus and permadeath target; player picks the remaining slots. Deploy UI added v112. | F6 |

**Layering / hidden coupling**

- `game.js` remains the hotspot composer (design R2): warp, endgame, turn income, mirage apply, campaign boot, test bridge.
- Battle still keys `team` 1/2 (design D5 / R5: new **campaign** state is faction-keyed; battle generalization was out of scope — not a regression, do not half-fix).
- `materializeMirages` copies `flags` by reference (shallow). Latent aliasing, not a live failure today because the caller replaces `State.units`.
- Dual unit representation (R3) is unfinished because the translators are not on the live path.

---

## 4. Integration (slices together)

| Check | Result |
|-------|--------|
| M2 head contains M1 | Yes. `e9229a5` parent `ab58ae6`. M1 tests run on M2 and pass. |
| M2 vs M1 file delta | 26 paths (PR #2). New: `beginBattle`, `applyBattleResult`, `planDeployment`, `computeCrewLost`, `materializeMirages`, `buildReserveModel/Buttons`, `listWarpCells`. |
| M1 vs v106 file delta | 15 paths including `docs/roadmap.md` and `reference_audit.py`. |
| vs current `main` (v107) | Merge-base `18788f9` (v106). Main-only: GUI scaling `e9b5f74` + docs `d6b1174`. Overlap (changed in both, no conflict markers): `dev/scripts/reference_audit.py`, `main.js`, `main.js children/game.js`, `main.js children/game.js children/hud.js`. |
| PR #2 mergeability | GitHub `mergeable=true`, `mergeable_state=clean` vs M1. |
| PR #1 mergeability | GitHub `base.sha` still `bba17dc` (v102) on fetch — stale vs local `origin/main` `d6b1174`. Do not merge #1 onto current main without a rebase (F0). |
| Live campaign init | `initializeSubsystems` calls `InitializeCampaign()` if campaign is null. |
| Live battle launch | Still the four-card ladder. Overflow/reserve/carry-over unused in play. |

---

## 5. Test / build / lint — verbatim

No build step, no typecheck (vanilla JS). Commands run in the M2 worktree `e9229a5`.

### 5.1 `node --check`

```
checked 145 fail 0
```

(All `.js` files under the worktree; `node --check` each.)

### 5.2 `python3 dev/scripts/structure_audit.py`

```
warning: main.js: presumed multi-job — 622 lines (> 300)
warning: main.js: presumed library — 16 function definitions (> 8)
warning: main.js children/game.js: presumed multi-job — 2462 lines (> 300)
warning: main.js children/game.js: presumed library — 39 function definitions (> 8)
warning: main.js children/game.js children/ai.js children/aiPriorities_DATA.js: presumed multi-job — 507 lines (> 300)
warning: main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatScorer.js: presumed multi-job — 391 lines (> 300)
warning: main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatScorer.js: presumed library — 14 function definitions (> 8)
warning: main.js children/game.js children/gameTests.js: presumed multi-job — 460 lines (> 300)
warning: main.js children/game.js children/hud.js: presumed multi-job — 486 lines (> 300)
warning: main.js children/game.js children/hud.js: presumed library — 20 function definitions (> 8)
warning: main.js children/graphics.js: presumed multi-job — 1046 lines (> 300)
warning: main.js children/graphics.js: presumed library — 39 function definitions (> 8)
warning: main.js children/graphics.js children/objectRenderer.js: presumed multi-job — 306 lines (> 300)
warning: main.js children/graphics.js children/uiRenderer.js: presumed multi-job — 1038 lines (> 300)
warning: main.js children/graphics.js children/uiRenderer.js: presumed library — 17 function definitions (> 8)
warning: main.js children/sounds.js: presumed multi-job — 651 lines (> 300)
warning: main.js children/sounds.js: presumed library — 39 function definitions (> 8)
warning: main.js children/sounds.js children/sfx.js: presumed library — 10 function definitions (> 8)
structure_audit: 0 violation(s), 18 warning(s)
one-function-per-file check: 0 violation(s)
```

Exit 0.

### 5.3 `python3 dev/scripts/reference_audit.py`

```
main.js children/game.js children/beginningGameState_DATA.js:7: data file contains '=>' outside its registration call (data modules must be pure data)
main.js children/game.js children/campaign_DATA.js:13: data file contains '=>' outside its registration call (data modules must be pure data)
main.js children/game.js children/rules_DATA.js:15: data file contains '=>' outside its registration call (data modules must be pure data)
main.js children/game.js children/themes_DATA.js:7: data file contains '=>' outside its registration call (data modules must be pure data)
main.js children/graphicsInterface.js:66: 'audioInterface.js' (file main.js children/audioInterface.js) is referenced here; only main.js (its parent), its own children and itself may reference it
main.js children/sounds.js children/audio_DATA.js:7: data file contains '=>' outside its registration call (data modules must be pure data)
reference_audit: 6 violation(s)
child-names-parent check: 0 violation(s)
doc-window-main-only check: 27 violation(s)
import-direction check: 2 violation(s)
```

(The 27 doc-window lines and 2 import-direction lines match the v106 baseline set: `game.js` 847/848/1787/1792, `graphics.js` 214/219/237/239/248/252/265, `inputs.js` 34/76/82/101/109/113/114/126, `sounds.js` 41/46/311×2/542/543/547/548; import-direction `game.js:2236` → `graphicsInterface.js`, `graphicsInterface.js:66` → `audioInterface.js`.)

Script exit 1 because the legacy 6 still print; that is the standing baseline, not a M1/M2 regression.

### 5.4 Browser suites (ad-hoc)

Script: `/tmp/hermes-verify-m2-review/run-suites.py`  
Server: `python3 -m http.server 55921` in the M2 worktree (fresh port).  
Playwright Chromium, `http://127.0.0.1:55921/?test`.

```
boot: OK
url: http://127.0.0.1:55921/?test
game_count: 24
game_fails: 0
audio_count: 5
audio_fails: 0
pageerrors: []
console: ["error: [S&D state] lifetime map mismatch for keys: [battleReserve]"]
```

Game (all `pass: true`):

| name | detail |
|------|--------|
| CAMPAIGN ROSTER CONFORMANCE (M1) | 22 hulls / 15 weapons conform to DESIGN §3 |
| CAMPAIGN STATE ROUND-TRIP (M1) | save → restore JSON-identical (fleet/wallet/cargo/reputation/clock) |
| CAMPAIGN V99 SAVE MIGRATION (M1) | v99 credits/income ×100, campaign section present, no double-scale |
| M2 SUMMON 1 AP 0 CREDITS | AP 4→3, credits unchanged, mirage on board |
| M2 MIRAGE ANY HIT DESTROYS | mirage removed after one hit |
| M2 MIRAGE RAM DESTROYS BOTH | both hulls destroyed |
| M2 FLAGSHIP-LOST CAMPAIGN OVER | over/flagship-lost |
| M2 BATTLE CARRY-OVER | parts +8, flagship crew 72, Probe retained |
| T-1 … T-9, ZOOM ANCHOR, ZOOM CLAMP | pass (pre-M1 suite) |
| BAKED SPRITE ATLAS COVERAGE | 22 ship types verified |
| RAILGUN PULSE OFFSET / HULL FACTION READ / WEAPON FACTION NEUTRAL / EXHAUSTED STATE DISTINCT | pass |

Audio 5/5: A-1 CLIP MANIFEST, A-2 EVENT ROUTING, A-3 BACKGROUND LOOPS, A-4 SOUND THEMES, A-5 BUS LEVELS.

Roadmap still says “16/16 game”; the live `SD.runTests()` total is **24** (16 historical + 3 M1 + 5 M2). Do not treat 16/16 as the M2 gate.

---

## 6. Prioritized follow-up

### Before any merge (blockers)

| ID | Work | Why |
|----|------|-----|
| **F0** | Rebase `milestone/1-campaign-state` (then M2) onto current `main` (`v107` `d6b1174`). Overlap: `reference_audit.py`, `main.js`, `game.js`, `hud.js`. Single-agent merge. | PRs sit on v106; GUI scaling shipped on main. |
| **F1** | Add `battleReserve` to `lifetimes.match` (and serialize it). Confirm the boot console error is gone. | Persistence hole; every `/?test` load logs an error. |

### Close M2 for real (do not start M3 until these land)

| ID | Work |
|----|------|
| **F3** | **DONE (v112).** Live sector start goes through the setup seam; live endgame folds before the modal. Tests `M2 LIVE PATH CARRY-OVER`. |
| **F5** | **DONE (v112).** No in-battle credit/income tick; HUD wallet read-only; in-battle purchase path (`SHOP_BUY`) removed. Test `M2 BATTLE CREDITS FROZEN`. |
| **F6** | **DONE (v112), justified.** Flagship always deploys (warp locus + permadeath). Player picks remaining hulls in a pre-battle deploy modal. Test `M2 DEPLOYMENT FLAGSHIP FORCED`. |

### Deferred from M1 (do not block M3 if F0–F3 done)

| ID | Work |
|----|------|
| **F2** | **DONE (v114).** `dev/docs/game_balance.md` is now GENERATED from the ×100 `rules_DATA` / `campaign_DATA` tables by `dev/scripts/generate_game_balance.js` (pure read of the data payloads → markdown), titled with the release (`v114`, was “v70”). 22 specs, flagship Battlecruiser 8,750 ⒸB, 15 weapon variants, difficulty profiles, flag table and the 4-sector escalation all come straight from the data. Gate: `node dev/scripts/generate_game_balance.js --check` regenerates and requires a byte-identical file (in the harness `/tmp/hermes-verify-t_fb967eff/verify.js`), so the doc can never drift from the data silently. |
| **F4** | **DONE (v113), latch REMOVED per DESIGN §2.5.** Ruling — DESIGN §2.5 is explicit: “There is no cooldown: a ship can raise its shield again later in the same turn if it was stripped (each raise costs 1 AP), and re-raising is blocked only by an already raised shield, no shield generator, or no AP. Shielding matters at the end of a faction's turn, so raising more than once per turn is allowed.” No once-per-X shield lockout is mandated, so the latch is gone end-to-end: raise action no longer sets it, turn clears no longer track it, the legality gate blocks only on an already raised bubble / no generator / no AP, capture and warp-in spawn-exhaustion no longer seed it, the flag table entry is deleted (`#shield generator` text now records the no-cooldown rule), the AI belief tracks observed bubble state (`+shield`) instead, and the AI flagship shield gate no longer checks it. Zero `-shielded` occurrences remain in `.js`. Rule test `T-12 SHIELD RE-RAISE (DESIGN 2.5)`; A/B vs pre-change tag v112 in `/tmp/hermes-verify-t_fb967eff/verify.js` (re-raise after strip: blocked pre → allowed post; parity on the raised/no-generator/no-AP blocks and plain raise). |

### Next milestone batch (roadmap order)

Design sequence remains **M1 → M2 → M3 → M4 → {M5 ∥ M6}**. M3 must not start until F0 and F3 close, or map launch will paper over the unwired seam.

| Milestone | Owns (new) | First update (design §6) |
|-----------|------------|--------------------------|
| **M3** Campaign map | `campaignMap.js` subtree | `buildMapState` + `moveFleet` / fuel |
| **M4** Economy / stations / crew | `economy.js` | trade tables + `priceAt` / `applyTrade` |
| **M5** Outfitting | `outfitting.js` | slot math + loadout readers (after M4) |
| **M6** Factions / reputation / missions | `factions.js`, `reputation.js`, `missions.js`, `mapAi.js` | `factions_DATA` + `composeFleet` (after M4; parallel with M5 only if hotspot files are serialized) |

Shared-file hotspots still: `game.js`, `main.js`, `rules_DATA.js`, `campaign_DATA.js`, `hud.js` children, `gameState.js`, `sectorGenerator.js`, `aiThreatScorer.js`.

---

## 7. Open questions (unchanged)

Roadmap §7 Q4–Q11, Q12 (planning-doc home), Q13 (cadence) remain requester-confirmable. M1/M2 adopted Q1–Q3 and Q7 defaults as designed. Q12: this review follows the commissioned path `docs/architecture/…` in the task workspace; the architecture design itself now lives at `dev/docs/architecture/roadmap-design.md` after the v102 refpolicy move. Do not copy this file into repo-root `docs/` without that ruling — naming game stems there is an R1 flood.

---

## 8. Method (what was not rubber-stamped)

- Read roadmap `8db8330` and design on `origin/main`.
- Inspected PR #1 / #2 JSON and the M2 file list vs design §4.1–4.2.
- Read the new transforms and the live `executeWarpIn` / `checkEndgame` / `SectorGenerator.generate` paths.
- Re-ran structure + reference audits and `node --check` on this tree.
- Re-ran browser suites on a **new** port (55921), not the implementers’ 55869/55903.
- `git merge-tree` of `e9229a5` vs `origin/main`.
- Dirty `v105` checkout left as found.

---

## 9. Gate review — M3 campaign map (2026-11-03)

**Date:** 2026-11-03 · **Reviewer:** kanban task `t_e5937bed` (spec `t_f15523c0`, superseded duplicate) ·
**Implementation under review:** `t_ab74f8de` — v126 (a), v129 (b), v130 (c) on `origin/main` @ `0fca1ec`.

**Verdict: MET.** Every roadmap §4 M3 deliverable and acceptance criterion is
implemented on `origin/main`, verified by re-execution against the tree (detached
review worktree at `0fca1ec`), the live `/v130/` deployment, and an independent
browser traverse. No blocking findings. Deviations are recorded below and are
justified.

### 9.1 Standing gates re-run (review worktree @ 0fca1ec, not the implementer's runs)

| Gate | Result |
|------|--------|
| `node --check` all `.js` | all pass |
| `structure_audit.py` | 0 violations / 19 warnings / one-function 0 |
| `reference_audit.py` | legacy 6, child-names 0, doc-window 27, import-direction 2 = exact baseline |
| `reference_policy_check.py` | 0 violations |
| In-page suites, fresh port 58412 (`?test`) | 45/45 (40 game + 5 sprite) + 5/5 audio |
| Live `https://seek-and-destroy.abacusai.cloud/v130/?test&bust=gate1` | 45/45 + 5/5 |
| Playwright `npx playwright test` (worktree) | 28/28 (incl. both M3 acceptance specs `11-campaign-map.spec.ts`) |
| Deploy | root 302 → `/v130/`; `/v130/` 200; `/v130/?test` 200 |
| Release refs | v126–v130 each: branch + tag + `main` pushed, `git ls-remote` parity verified (`main` = `v130` = `0fca1ec`) |

### 9.2 M3 traverse re-run independently (measurements, not report quotes)

Single clean chain on a fresh boot (screenshots under the review card's evidence
dir; in-page state read via `SD.Map.*` / `SD.getRawState()`):

1. **Map-first boot.** `levelTag "MAP // SOL GATE STATION"`, screen `map`, no modal;
   player fleet 5 ships (Flagship Battlecruiser `flagship:true`, crew 88 = ⌈8750/100⌉ —
   Q6/Q7 rules intact), fuel 500.
2. **Fuel formula, normal space.** Move (41,24)→(45,24), distance 4:
   fuel 500→480 = 5 ships × 4 × 1 exactly (roadmap: "proportional to ship count").
3. **Hyperspace jump (Q5).** `jump → aurora-prime`: `fleetJumped` event, departure
   on sol-gate's well edge (distance to well center = 6.000 = `wellRadius`), arrival
   on aurora-prime's edge; cost **144.4996 = 5 × 9.6333 × 3** (hyperspace ×3, edge-to-edge
   distance); deep space refused at both ends (`unknown-target` / `no-jump-point`),
   same-well refused (`already-there`) — pinned by `M3 JUMP POINTS AT EDGES, WELLS ONLY (Q5)`.
4. **Red render at two resolutions.** 1200px + 768px screenshots: dark-red/maroon
   SC2-style palette, gravity-well reticle nodes + labels only (no star/ship clutter),
   page dark from first paint, no flash, no modal.
5. **Encounter opens on entry + Q4 edge.** Arriving inside aurora-prime's well opens
   `pendingEncounter {kind:"location", locationId:"aurora-prime", encounterFaction:"garrison",
   entry:{edge:"W"}, joinNextTurn:true}` — the entry is the well edge nearest the
   approach (came from the west) ✓.
6. **Hailing shell.** `buildHailModel`: speaker `LOCAL GARRISON`, placeholder voice
   lines (M6 banks noted), options `talk/threaten/leave`; rendered with
   HAIL_TALK/HAIL_THREATEN/HAIL_LEAVE buttons.
7. **Battle next turn via the M2 seam.** `endTurn()` with the encounter open → deploy
   modal (`DEPLOY_LOCK` forced flagship row disabled-ON + player pick toggles + CONFIRM)
   → battle: 16 units, screen `battle`, `battleActive: true`, map frozen (Q4),
   `pendingEncounter` consumed. The forced flagship deployed carrying `!flagship` (F6
   contract holds on the map path).
8. **Victory folds back.** `checkEndgame()` → campaign fold: screen `map`,
   `battleActive: false`, player fleet mirrored 5/5 hulls intact;
   `gameOver: true` + victory modal after 450 ms are the designed M2 fold semantics
   (asserted by `11-campaign-map.spec.ts` lines 66–82 — the fold lands beneath the modal).

Probe note (reviewer artifact, not a defect): running the traverse on a `?test` page
AFTER `SD.runTests()` executes produces damaged leftover state (a partial deploy was
once observed). All figures above come from clean boots with no prior test-harness run.

### 9.3 Roadmap §4 M3 deliverables and acceptance — verdicts

| Item | Verdict | Evidence |
|------|---------|----------|
| Turn-based map movement; real space + hyperspace; fleets/locations single map units; speed = slowest ship | met | `moveFleet.js` (slowest-ship cap test `M3` map tests green); traverse steps 2–3 |
| Fuel: consumption ∝ ship count, hyperspace ×3; blocked move → merchant event | met | step 2–3 measurements; `M3` fuel/rejection/merchant tests green |
| Map visibility: N squares = N ships; nebula hides battles | met | `mapVisibility.js`; MapHud `detection: 5` for a 5-ship fleet; `M3` detection/nebula tests green |
| Entering a fleet/location opens it; battle next turn; hailing shell (voice placeholder) | met | traverse steps 5–7; `buildHailModel.js` |
| Hyperspace rendering: red SC2-style, gravity wells only | met | step 4 screenshots at two resolutions |
| Pure tests: fuel formula, unfuelled rejection + merchant event, detection radius | met | in-page M3 test block green in my run (45/45) |
| Browser evidence: system → hyperspace → system with fuel decrements + red render at two resolutions | met | step 2–4 (independent re-run) |
| Save migration of M2-era saves (v126 schema bump) | met | `M3` save round-trip + migration test green ("a pre-map (M2-era) save migrates onto the map schema with the saved anchor kept as the fleet's location") |

### 9.4 Design §4.3 / §5.3 / D1 / D5 / D6

- **§4.3 module map:** all nine named files exist with the specified parents —
  `campaignMap.js` stem under `game.js children/` with children `buildMapState`,
  `moveFleet`, `hyperspaceJump`, `fuelCost`, `merchantOffer`, `mapVisibility`,
  `battleEventAt`, `mapFrame`; `hud.js` children `buildMapHudModel`, `buildHailModel`.
- **§5.3 interfaces:** shapes verified live or by green pure tests — `fuelCost`
  (ships × distance × 1, hyperspace ×3), `moveFleet`/`hyperspaceJump` →
  `{mapState, events}`, `battleEventAt` → `BattleSetup | null`, `mapVisibility` →
  detection set, `merchantOffer` (placeholder offer model), `mapFrame` →
  `MapFrameDTO` (`kind:"map"`, `hyperspace` flag, 12 locations), `buildMapHudModel`,
  `buildHailModel({speaker, lines, options})`.
- **Contrast pair (justified deviation):** standard says `battleEventAt(mapState,
  locationId)` (two args) / code does `battleEventAt(mapState, locationId, entering?)`
  — the optional third argument computes the Q4 nearest-edge entry; the documented
  two-arg call shape is preserved and the header records the M3 interface. Accept;
  update §5.3's signature line when the doc is next touched.
- **D1** map subtree parents under `game.js` ✓. **D5** faction-keyed from birth: zero
  `team` keys in `campaignMap.js children/` (fleets keyed `faction:
  "player"/"Syndicate"/"Freehold"`, encounters by `encounterFaction`) ✓. **D6** born
  compliant: every new file one pure function (one-function check 0) with
  `— job:` / `Owner: campaignMap.js (pure)` headers ✓.

### 9.5 M1/M2 non-regression and release discipline

- All M1/M2 in-page tests green in my 45/45 run (roster conformance, round-trip,
  v99 migration, summon/mirage/flagship/carry-over, live-path, credits-frozen,
  deployment-forced, T-1…T-9, zoom, shield re-raise); Playwright 07/08/10 specs green.
- v126–v130: all three refs pushed and parity-verified via `git ls-remote`;
  `main` tip = `v130` = `0fca1ec`; `/v130/` snapshotted and serving. The v129
  release-number collision (origin/main moved mid-task; local v129 pre-claimed) was
  resolved per the runbook's collision rule (cherry-picked onto the new tip, next
  free number used, renumber instructions flagged on `t_d8a27d0d`) — recorded, not blocking.

### 9.6 Non-blocking observations (for the next lanes)

1. HUD label clipping at narrow canvases: at a 768×768 emulation the top-right panel
   text clips ("REINFORCEMENTS" → "ORCEMENTS"); the implementer's 768px evidence clips
   the same panel's border. Cosmetic; the M3 render acceptance (red, wells-only, two
   resolutions) is met. Fold into the GUI-scaling (GS) lane. Likewise the hail panel's
   dialogue text truncates at small canvases.
2. `merchantOffer` remains the placeholder offer model by design — M4 wires the real
   service (roadmap M3 scope note: "service wiring completes in M4").
3. `game.js`, `hud.js`, `campaign_DATA.js`, `main.js` remain shared-file hotspots for
   M4/M5/M6 (roadmap §5.4); keep updates small and rebased.

**Method (not rubber-stamped):** detached review worktree at `origin/main` 0fca1ec;
all gates re-executed by the reviewer on fresh ports and against live `/v130/`;
the M3 traverse re-driven end-to-end through the real map ops (`SD.Map.travel/jump/
endTurn`, canvas-button deploy click, `SD.Actions.checkEndgame`) with fuel numbers
measured from live state, not quoted; Playwright suite re-run (`npx playwright test`,
28/28); dirty `v105` main checkout left untouched.
