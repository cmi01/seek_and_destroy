// smoke.spec.ts — the ONE boot smoke test (test-architecture doc §2's 01-boot-smoke
// scenario trimmed to this task's contract).
// (a) boot the game at its root URL, (b) a stable root surface is present,
// (c) window.SD is up and the game is in its initial state.
// Determinism (§7): no sleeps, no randomness — boot convergence only through
// auto-retrying assertions (expect.poll). Initial-state values below are
// grounded in an observed boot at v123 (1280×800, dsf 1): title
// "SEEK & DESTROY // …", canvas 790² == LayoutMetrics.devicePx, deploy modal
// open pre-deployment (boot behaviour since v112), turnNumber 1, activeTeam 1,
// gameOver false, rngSeed null (sector not yet generated — units [] until
// DEPLOY_CONFIRM).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getLayoutMetrics, getRawState, isBooted, isModalOpen } from '../helpers/sd';

test('smoke: game boots to a stable root surface in its initial state', async ({ page }) => {
  const game = gamePage(page);

  // (a) navigate to the game's root URL.
  await game.goto();

  // (b) stable root surface: document title + the game's single canvas.
  await expect(page).toHaveTitle(/SEEK & DESTROY/);
  await expect(game.canvas()).toBeVisible();

  // Boot is complete only once exposeDebugHandle() has installed window.SD.
  await expect.poll(() => isBooted(page)).toBe(true);

  // A successful boot must not have produced the failure banner.
  await expect(game.bootFailureBanner()).toHaveCount(0);

  // (c) initial state, asserted on window.SD (test-architecture doc §6: state-first).
  const state = await getRawState(page);
  expect(state.gameOver).toBe(false);
  expect(state.turnNumber).toBe(1);
  expect(state.activeTeam).toBe(1);
  expect(state.rngSeed).toBeNull(); // pristine boot: determinism seed not engaged
  // The pre-battle deployment modal is the documented boot state (since v112).
  expect(await isModalOpen(page)).toBe(true);

  // Canvas backing store pins to LayoutMetrics.devicePx (§6 secondary).
  const metrics = await getLayoutMetrics(page);
  const size = await game.canvas().evaluate((c) => {
    const el = c as HTMLCanvasElement;
    return { w: el.width, h: el.height };
  });
  expect(size.w).toBe(metrics.devicePx);
  expect(size.h).toBe(metrics.devicePx);

  // TODO(full suite): scenario specs 02..10 per test-architecture doc §2 land as their own
  // one-scenario files. Sector generation / units-in-play assertions belong to
  // 02-sector-generation.spec.ts — at boot the sector is not yet generated.
  // TODO(spec 01 itself): this smoke covers the task's (a)(b)(c); the doc's
  // 01-boot-smoke also wants "units > 0" post-deployment — fold in when 01 is
  // written for real (needs DEPLOY_CONFIRM first).
});
