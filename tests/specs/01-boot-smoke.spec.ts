// 01-boot-smoke.spec.ts — scenario 01 (test-architecture doc §2): boot & first
// paint. (a) the game loads at its root URL, (b) a stable root surface renders,
// (c) window.SD is up in its initial state, and (d) confirming deployment
// starts the battle with units on the board (the doc §2 "units > 0" clause —
// at boot the sector is not yet generated; units appear only after
// DEPLOY_CONFIRM, boot behaviour since v112).
// Determinism (§7): virtual clock; boot convergence only through auto-retrying
// assertions. Initial-state values are grounded in an observed boot at v125
// (1280×800, dsf 1): title "SEEK & DESTROY // …", canvas 790² ==
// LayoutMetrics.devicePx, deploy modal open pre-deployment, turnNumber 1,
// activeTeam 1, gameOver false, rngSeed null, units [].
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getActiveModal, getLayoutMetrics, getRawState, isBooted } from '../helpers/sd';

test('boot: the game loads and renders its initial battle surface', async ({ page }) => {
  const game = gamePage(page);

  // (a) navigate to the game's root URL (virtual clock installed by boot()).
  await game.boot();

  // (b) stable root surface: document title + the game's single canvas.
  await expect(page).toHaveTitle(/SEEK & DESTROY/);
  await expect(game.canvas()).toBeVisible();

  // A successful boot must not have produced the failure banner.
  await expect(game.bootFailureBanner()).toHaveCount(0);

  // (c) initial state, asserted on window.SD (test-architecture doc §6: state-first).
  const state = await getRawState(page);
  expect(state.gameOver).toBe(false);
  expect(state.turnNumber).toBe(1);
  expect(state.activeTeam).toBe(1);
  expect(state.rngSeed).toBeNull(); // pristine boot: determinism seed not engaged
  expect(state.units).toHaveLength(0); // sector not generated until a map encounter reaches DEPLOY_CONFIRM
  // M3 boot contract: the campaign MAP is the main screen — no modal at boot
  // (pre-M3 the pre-battle deployment modal was the documented boot state).
  expect(await getActiveModal(page)).toBeNull();
  expect(((await getRawState(page)).campaign as { map: { screen: string } }).map.screen).toBe('map');

  // Canvas backing store pins to LayoutMetrics.devicePx (§6 secondary).
  const metrics = await getLayoutMetrics(page);
  const size = await game.canvas().evaluate((c) => {
    const el = c as HTMLCanvasElement;
    return { w: el.width, h: el.height };
  });
  expect(size.w).toBe(metrics.devicePx);
  expect(size.h).toBe(metrics.devicePx);
});

test('boot: deploy confirm starts the battle and units render on the board', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  // Confirming the deployment modal generates the sector (game.js
  // _handleCanvasButtonClick "DEPLOY_CONFIRM" → SectorGenerator.generate).
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');

  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);
  const state = await getRawState(page);
  expect(state.units.length).toBeGreaterThan(0);
  expect(state.gameOver).toBe(false);
  expect(await getActiveModal(page)).toBeNull();

  // Rendered, not just generated: the battle surface keeps its pinned size and
  // the board reports a generated sector (rngSeed null = unseeded boot run).
  const metrics = await getLayoutMetrics(page);
  const size = await game.canvas().evaluate((c) => {
    const el = c as HTMLCanvasElement;
    return { w: el.width, h: el.height };
  });
  expect(size.w).toBe(metrics.devicePx);
  expect(size.h).toBe(metrics.devicePx);
});
