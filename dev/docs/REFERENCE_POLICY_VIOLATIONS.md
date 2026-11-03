# Reference Policy — Violation Baseline and Remediation Plan

Committed baseline for the normative ruleset in `REFERENCE_POLICY.md`.

| Field | Value |
|---|---|
| Baseline stamp | 2026-11-03, HEAD 714646f (v99.1), detached-worktree scan |
| Scan | `python3 dev/scripts/reference_policy_check.py --repo <HEAD worktree>` |
| Total violations | 59 (all R1-inbound-cap; R2 count 0 at this HEAD) |
| Instrument | `dev/scripts/reference_policy_check.py` — rerun it before acting on any entry below; line numbers drift |

Interpretations in force: `main.js` exempt as referrer (central-loader allowance), dev/ referrers do not count toward fan-in, `index.html` is the owner edge of `main.js`, owner edge is the one entitled referrer. Every entry below is a referrer **beyond** the owner.

**Working-tree note.** The live working tree scans higher than this baseline for two reasons that are not part of it: (1) the roadmap task's untracked `docs/architecture/roadmap-design.md` contributes 57 extra R1 rows and all currently visible R2 rows (see P0); (2) parallel in-flight edits in the ai/ subtree shift counts slightly (98 total observed live at generation time vs 96 shortly before — the drift tracks sibling WIP, not this baseline). Scope findings to your own files and re-scan a clean HEAD worktree for truth.

## 1. Prioritized remediation plan

Ranked by blast radius (files touched x behavior risk), cheapest first. Group sizes overlap in rows but not in targets: P1 + P2 = the 59 HEAD targets.

### P0 — keep documentation out of the game tree (prevents 60 rows; untracked WIP)

The roadmap task's untracked `docs/architecture/roadmap-design.md` is a game-tree prose file; once committed it adds 57 R1 rows (it names 57 game files by basename/stem) and 3 R2 rows (it names `dev/docs/DESIGN.md`, `dev/docs/game_balance.md`, `dev/docs/gui-scaling-strategy.md`). Documentation is tooling: it belongs under `dev/docs/` where the dev-latitude interpretation (policy §4.2) applies and every one of those rows dissolves with no game-tree change.

- Change: move `docs/**` to `dev/docs/**` before that file is committed, and update cross-links inside it.
- Risk: none to the game (no game file touched). Attribution: the file belongs to the roadmap task (t_4cda942b) — its owner should do the move when committing.

### P1 — clear the grandparent/cross-owner load-path double reference (55 targets)

The v99 A05 split left parents loading grandchildren directly: `game.js` load-path-names 54 leaves under 10 stem parents (`boardQueries` 7, `rulesConfig` 12, `cameraMath` 5, `actionLegality` 5, `gameState` 6, `themes` 5, `combatMath` 4, `visionQueries` 3, `selectionQueries` 2, `sectorGenerator` 2, `ai.js` 1) while each stem parent also names its own children in composition code; and `graphics.js` load-path-names its `backgroundRenderer` while `game.js` stem-mentions it (@1806). The owner is the stem parent — remedy B (collapse the facade re-export): move each stem's children out of the grandparent's boot list into the stem's own self-kick loader (the v88 closed-boot-list pattern), so grandparents load only stems, and drop the cross-stem mention.

- Change: edit the game.js boot list (drop the 54 leaf rows, keep stem rows), add self-kick load lines to the 10 stems, fix the graphics.js/game.js backgroundRenderer pair; composition surfaces stay byte-identical.
- Risk: medium — load order/timing (leaves must load before the stem composes them); the v88 playbook covers the self-kicking loader + entry-guard fallback. Verify with the standard parity harness and browser suites. Highest-value fix in the tree: it clears 55 of 59.

### P2 — registrar handshakes and parent-mention rows (4 files, 22 rows)

- `game.js` (11 inbound refs): data files still exercise `Game._register` (remedy C — the A01-A08 program); `gameState.js` / `gameTests.js` / `hud.js` / `ai.js` use `Game.*` bindings (remedy C/D as each sweep lands); `uiRenderer.js` names it in a comment (remedy A).
- `graphics.js` (5): its children reference it via `Graphics.*` bindings — same registrar retirement.
- `sounds.js` (3): children reference it via `SoundEngine._register` — same.
- `main.js` (2 extra refs beyond the index.html owner edge): `game.js` and `hud.js` name it in header comments (remedy A — reword; the doc-window rule already forbids it).
- Risk: the registrar retirements are the A01-A08 program itself; each is its own vNN with parity evidence. Comment rewords are zero-risk but must respect CRLF discipline on `tests/*.js`.

## 2. Baseline listing (R1, 59 targets)

| Target | inbound | owner | referrers (kind @line, context) |
|---|---|---|---|
| `main.js` | 3 | `index.html` | `index.html` — html-script @16 (code); `main.js children/game.js` — basename-mention @153 (comment); `main.js children/game.js children/hud.js` — basename-mention @9 (comment) |
| `main.js children/game.js` | 11 | `main.js` | `main.js children/game.js children/ai.js` — binding-mention @7 (code); `main.js children/game.js children/ai.js children/aiPriorities_DATA.js` — binding-mention @8 (code); `main.js children/game.js children/ai.js children/aiTurnWorkflow.js` — binding-mention @116 (code); `main.js children/game.js children/beginningGameState_DATA.js` — binding-mention @7 (code); `main.js children/game.js children/campaign_DATA.js` — binding-mention @7 (code); `main.js children/game.js children/gameState.js` — binding-mention @34 (code); `main.js children/game.js children/gameTests.js` — binding-mention @226 (code); `main.js children/game.js children/hud.js` — binding-mention @485 (code); `main.js children/game.js children/rules_DATA.js` — binding-mention @7 (code); `main.js children/game.js children/themes_DATA.js` — binding-mention @7 (code); `main.js children/graphics.js children/uiRenderer.js` — binding-mention @566 (comment) |
| `main.js children/game.js children/actionLegality.js children/canUnitCapture.js` | 2 | `main.js children/game.js children/actionLegality.js` | `main.js children/game.js` — load-path @1880 (code); `main.js children/game.js children/actionLegality.js` — stem-mention @12 (code) |
| `main.js children/game.js children/actionLegality.js children/canUnitMove.js` | 2 | `main.js children/game.js children/actionLegality.js` | `main.js children/game.js` — load-path @1879 (code); `main.js children/game.js children/actionLegality.js` — stem-mention @11 (code) |
| `main.js children/game.js children/actionLegality.js children/canUnitShield.js` | 2 | `main.js children/game.js children/actionLegality.js` | `main.js children/game.js` — load-path @1882 (code); `main.js children/game.js children/actionLegality.js` — stem-mention @14 (code) |
| `main.js children/game.js children/actionLegality.js children/canUnitShoot.js` | 2 | `main.js children/game.js children/actionLegality.js` | `main.js children/game.js` — load-path @1881 (code); `main.js children/game.js children/actionLegality.js` — stem-mention @13 (code) |
| `main.js children/game.js children/actionLegality.js children/priorityActionAt.js` | 2 | `main.js children/game.js children/actionLegality.js` | `main.js children/game.js` — load-path @1883 (code); `main.js children/game.js children/actionLegality.js` — stem-mention @21 (code) |
| `main.js children/game.js children/ai.js` | 2 | `main.js children/game.js` | `main.js children/game.js` — load-path @1911 (code); `main.js children/game.js children/ai.js children/aiPriorities_DATA.js` — basename-mention @11 (string) |
| `main.js children/game.js children/boardQueries.js children/cellDistance.js` | 2 | `main.js children/game.js children/boardQueries.js` | `main.js children/game.js` — load-path @1867 (code); `main.js children/game.js children/boardQueries.js` — stem-mention @10 (code) |
| `main.js children/game.js children/boardQueries.js children/cellOnBoard.js` | 2 | `main.js children/game.js children/boardQueries.js` | `main.js children/game.js` — load-path @1866 (code); `main.js children/game.js children/boardQueries.js` — stem-mention @9 (code) |
| `main.js children/game.js children/boardQueries.js children/cellsWithinRange.js` | 2 | `main.js children/game.js children/boardQueries.js` | `main.js children/game.js` — load-path @1868 (code); `main.js children/game.js children/boardQueries.js` — stem-mention @11 (code) |
| `main.js children/game.js children/boardQueries.js children/indexLivingUnits.js` | 2 | `main.js children/game.js children/boardQueries.js` | `main.js children/game.js` — load-path @1871 (code); `main.js children/game.js children/boardQueries.js` — stem-mention @14 (code) |
| `main.js children/game.js children/boardQueries.js children/occupancyKey.js` | 2 | `main.js children/game.js children/boardQueries.js` | `main.js children/game.js` — load-path @1870 (code); `main.js children/game.js children/boardQueries.js` — stem-mention @13 (code) |
| `main.js children/game.js children/boardQueries.js children/terrainOfCell.js` | 2 | `main.js children/game.js children/boardQueries.js` | `main.js children/game.js` — load-path @1869 (code); `main.js children/game.js children/boardQueries.js` — stem-mention @12 (code) |
| `main.js children/game.js children/boardQueries.js children/unitOnCell.js` | 2 | `main.js children/game.js children/boardQueries.js` | `main.js children/game.js` — load-path @1872 (code); `main.js children/game.js children/boardQueries.js` — stem-mention @15 (code) |
| `main.js children/game.js children/cameraMath.js children/clampViewportToBoard.js` | 2 | `main.js children/game.js children/cameraMath.js` | `main.js children/game.js` — load-path @1893 (code); `main.js children/game.js children/cameraMath.js` — stem-mention @12 (code) |
| `main.js children/game.js children/cameraMath.js children/computeCellCentre.js` | 2 | `main.js children/game.js children/cameraMath.js` | `main.js children/game.js` — load-path @1896 (code); `main.js children/game.js children/cameraMath.js` — stem-mention @15 (code) |
| `main.js children/game.js children/cameraMath.js children/computeRenderedViewport.js` | 2 | `main.js children/game.js children/cameraMath.js` | `main.js children/game.js` — load-path @1894 (code); `main.js children/game.js children/cameraMath.js` — stem-mention @13 (code) |
| `main.js children/game.js children/cameraMath.js children/pixelToCell.js` | 2 | `main.js children/game.js children/cameraMath.js` | `main.js children/game.js` — load-path @1895 (code); `main.js children/game.js children/cameraMath.js` — stem-mention @14 (code) |
| `main.js children/game.js children/cameraMath.js children/resolveZoomStep.js` | 2 | `main.js children/game.js children/cameraMath.js` | `main.js children/game.js` — load-path @1892 (code); `main.js children/game.js children/cameraMath.js` — stem-mention @10 (code) |
| `main.js children/game.js children/combatMath.js children/isLethalShot.js` | 2 | `main.js children/game.js children/combatMath.js` | `main.js children/game.js` — load-path @1887 (code); `main.js children/game.js children/combatMath.js` — stem-mention @11 (code) |
| `main.js children/game.js children/combatMath.js children/isShootableFrom.js` | 2 | `main.js children/game.js children/combatMath.js` | `main.js children/game.js` — load-path @1888 (code); `main.js children/game.js children/combatMath.js` — stem-mention @12 (code) |
| `main.js children/game.js children/combatMath.js children/resolveCollisionOutcome.js` | 2 | `main.js children/game.js children/combatMath.js` | `main.js children/game.js` — load-path @1886 (code); `main.js children/game.js children/combatMath.js` — stem-mention @10 (code) |
| `main.js children/game.js children/combatMath.js children/resolveShootOutcome.js` | 2 | `main.js children/game.js children/combatMath.js` | `main.js children/game.js` — load-path @1885 (code); `main.js children/game.js children/combatMath.js` — stem-mention @9 (code) |
| `main.js children/game.js children/gameState.js children/buildStateSave.js` | 2 | `main.js children/game.js children/gameState.js` | `main.js children/game.js` — load-path @1844 (code); `main.js children/game.js children/gameState.js` — stem-mention @38 (code) |
| `main.js children/game.js children/gameState.js children/getGameState.js` | 2 | `main.js children/game.js children/gameState.js` | `main.js children/game.js` — load-path @1841 (code); `main.js children/game.js children/gameState.js` — stem-mention @35 (code) |
| `main.js children/game.js children/gameState.js children/getStateLifetimes.js` | 2 | `main.js children/game.js children/gameState.js` | `main.js children/game.js` — load-path @1843 (code); `main.js children/game.js children/gameState.js` — stem-mention @37 (code) |
| `main.js children/game.js children/gameState.js children/initializeGameState.js` | 2 | `main.js children/game.js children/gameState.js` | `main.js children/game.js` — load-path @1840 (code); `main.js children/game.js children/gameState.js` — stem-mention @25 (code) |
| `main.js children/game.js children/gameState.js children/restoreStateSave.js` | 2 | `main.js children/game.js children/gameState.js` | `main.js children/game.js` — load-path @1845 (code); `main.js children/game.js children/gameState.js` — stem-mention @45 (code) |
| `main.js children/game.js children/gameState.js children/tryPatchGameState.js` | 2 | `main.js children/game.js children/gameState.js` | `main.js children/game.js` — load-path @1842 (code); `main.js children/game.js children/gameState.js` — stem-mention @36 (code) |
| `main.js children/game.js children/hud.js` | 2 | `main.js children/game.js` | `main.js children/game.js` — load-path @1907 (code); `main.js children/graphicsInterface.js` — basename-mention @11 (comment) |
| `main.js children/game.js children/rulesConfig.js children/getCombatRules.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1864 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @30 (code) |
| `main.js children/game.js children/rulesConfig.js children/getDefaultDifficulty.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1861 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @17 (code) |
| `main.js children/game.js children/rulesConfig.js children/getDifficultyProfiles.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1862 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @18 (code) |
| `main.js children/game.js children/rulesConfig.js children/getEnemyActionIntervalMs.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1857 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @13 (code) |
| `main.js children/game.js children/rulesConfig.js children/getFlagDescriptions.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1853 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @9 (code) |
| `main.js children/game.js children/rulesConfig.js children/getGridSize.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1854 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @10 (code) |
| `main.js children/game.js children/rulesConfig.js children/getMaxAp.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1856 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @12 (code) |
| `main.js children/game.js children/rulesConfig.js children/getMaxZoomStepsPerEvent.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1860 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @16 (code) |
| `main.js children/game.js children/rulesConfig.js children/getShipSpecs.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1863 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @19 (code) |
| `main.js children/game.js children/rulesConfig.js children/getSpawnRadius.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1855 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @11 (code) |
| `main.js children/game.js children/rulesConfig.js children/getWheelNotchPx.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1859 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @15 (code) |
| `main.js children/game.js children/rulesConfig.js children/getZoomLadder.js` | 2 | `main.js children/game.js children/rulesConfig.js` | `main.js children/game.js` — load-path @1858 (code); `main.js children/game.js children/rulesConfig.js` — stem-mention @14 (code) |
| `main.js children/game.js children/rules_DATA.js` | 2 | `main.js children/game.js` | `main.js children/game.js` — load-path @1836 (code); `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js` — basename-mention @138 (comment) |
| `main.js children/game.js children/sectorGenerator.js children/buildSectorData.js` | 2 | `main.js children/game.js children/sectorGenerator.js` | `main.js children/game.js` — load-path @1909 (code); `main.js children/game.js children/sectorGenerator.js` — stem-mention @10 (code) |
| `main.js children/game.js children/sectorGenerator.js children/buildUnitRecord.js` | 2 | `main.js children/game.js children/sectorGenerator.js` | `main.js children/game.js` — load-path @1908 (code); `main.js children/game.js children/sectorGenerator.js` — stem-mention @9 (code) |
| `main.js children/game.js children/selectionQueries.js children/cellForUnit.js` | 2 | `main.js children/game.js children/selectionQueries.js` | `main.js children/game.js` — load-path @1899 (code); `main.js children/game.js children/selectionQueries.js` — stem-mention @10 (code) |
| `main.js children/game.js children/selectionQueries.js children/getSelectedUnit.js` | 2 | `main.js children/game.js children/selectionQueries.js` | `main.js children/game.js` — load-path @1898 (code); `main.js children/game.js children/selectionQueries.js` — stem-mention @9 (code) |
| `main.js children/game.js children/themes.js children/nextTheme.js` | 2 | `main.js children/game.js children/themes.js` | `main.js children/game.js` — load-path @1849 (code); `main.js children/game.js children/themes.js` — stem-mention @12 (code) |
| `main.js children/game.js children/themes.js children/normalizeThemeKey.js` | 2 | `main.js children/game.js children/themes.js` | `main.js children/game.js` — load-path @1848 (code); `main.js children/game.js children/themes.js` — stem-mention @11 (code) |
| `main.js children/game.js children/themes.js children/remapColor.js` | 2 | `main.js children/game.js children/themes.js` | `main.js children/game.js` — load-path @1851 (code); `main.js children/game.js children/themes.js` — stem-mention @14 (code) |
| `main.js children/game.js children/themes.js children/themePalette.js` | 2 | `main.js children/game.js children/themes.js` | `main.js children/game.js` — load-path @1850 (code); `main.js children/game.js children/themes.js` — stem-mention @13 (code) |
| `main.js children/game.js children/themes.js children/themeTables.js` | 2 | `main.js children/game.js children/themes.js` | `main.js children/game.js` — load-path @1847 (code); `main.js children/game.js children/themes.js` — stem-mention @8 (code) |
| `main.js children/game.js children/visionQueries.js children/cellVisibleToTeam.js` | 2 | `main.js children/game.js children/visionQueries.js` | `main.js children/game.js` — load-path @1876 (code); `main.js children/game.js children/visionQueries.js` — stem-mention @23 (code) |
| `main.js children/game.js children/visionQueries.js children/unitScanRange.js` | 2 | `main.js children/game.js children/visionQueries.js` | `main.js children/game.js` — load-path @1875 (code); `main.js children/game.js children/visionQueries.js` — stem-mention @22 (code) |
| `main.js children/game.js children/visionQueries.js children/unitSpottedByTeam.js` | 2 | `main.js children/game.js children/visionQueries.js` | `main.js children/game.js` — load-path @1877 (code); `main.js children/game.js children/visionQueries.js` — stem-mention @24 (code) |
| `main.js children/graphics.js` | 5 | `main.js` | `main.js children/game.js children/themes_DATA.js` — basename-mention @15 (comment); `main.js children/graphics.js children/backgroundRenderer.js` — binding-mention @240 (code); `main.js children/graphics.js children/graphicsTests.js` — binding-mention @205 (code); `main.js children/graphics.js children/objectRenderer.js` — binding-mention @286 (code); `main.js children/graphics.js children/uiRenderer.js` — binding-mention @1032 (code) |
| `main.js children/graphics.js children/backgroundRenderer.js` | 2 | `main.js children/graphics.js` | `main.js children/game.js` — stem-mention @1806 (comment); `main.js children/graphics.js` — load-path @8 (code) |
| `main.js children/sounds.js` | 3 | `main.js` | `main.js children/sounds.js children/audio_DATA.js` — binding-mention @7 (code); `main.js children/sounds.js children/music.js` — binding-mention @7 (code); `main.js children/sounds.js children/sfx.js` — binding-mention @7 (code) |

Pattern note: 55 targets are the grandparent/cross-owner load-path pattern (P1); the remaining 4 files carry the 22 registrar/parent-mention rows (P2). R2 has no committed-tree rows at this HEAD — every R2 row visible in the working tree comes from the P0 file.

## 3. Maintenance

This file is a snapshot, not a live document: after clearing a group, rerun the checker, replace the cleared entries, and stamp a new baseline date + HEAD. The checker's stdout listing is always current; this file records what the committed plan promised to fix and when it was promised.
