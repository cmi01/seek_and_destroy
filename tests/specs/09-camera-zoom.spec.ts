// 09-camera-zoom.spec.ts — scenario 09 (test-architecture doc §2): the
// wheel → resolveZoom contract (cursor-cell anchoring + zoomLadder clamp) and
// WASD camera panning. The wheel path is real input (inputs.js WHEEL DTO →
// game.js resolveZoom → State.viewSpan/viewX/viewY + zoomAnim); the pure-math
// oracles (SD.Harness.testZoomAnchor/testZoomClamp) back the same contract.
// Grounded constants: zoomLadder [5..32] and wheelNotchPx 100, max 3 steps per
// event (data/rules_DATA.js).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getRawState, runHarnessTest, withLiveState } from '../helpers/sd';
import { keyDown, keyUp } from '../helpers/input';
import { runFor } from '../helpers/time';

const MIN_SPAN = 5;
const MAX_SPAN = 32;
const GRID = 32;

test('camera: wheel zoom steps the span along the ladder and anchors the cursor cell', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  // Cursor anchored at canvas center; the anchor grid coords must drift ≤ 0.5
  // cells per zoom step (gameTests.js ZOOM ANCHOR (AC-1) contract). Park the
  // viewport interior first: at a board edge the post-step clamp legitimately
  // breaks exact anchoring (viewX cannot go negative), so the AC-1 contract is
  // asserted away from the clamps — exactly as the in-page oracle does.
  await withLiveState(page, () => {
    const st = (window as any).SD.getRawState();
    st.viewX = 8;
    st.viewY = 8;
    st.zoomAnim.active = false;
    (window as any).SD.MathGrid.clampViewport();
  });
  const u = 0.5;
  const v = 0.5;
  const before = await getRawState(page);
  const anchorBefore = { gx: before.viewX + u * before.viewSpan, gy: before.viewY + v * before.viewSpan };

  await game.wheelAt(u, v, 100); // one notch out
  const after = await getRawState(page);
  expect(after.viewSpan).not.toBe(before.viewSpan);
  expect(after.viewSpan).toBeGreaterThanOrEqual(MIN_SPAN);
  expect(after.viewSpan).toBeLessThanOrEqual(MAX_SPAN);
  expect(after.zoomAnim.toSpan).toBe(after.viewSpan); // anim targets the applied span

  const anchorAfter = { gx: after.viewX + u * after.viewSpan, gy: after.viewY + v * after.viewSpan };
  expect(Math.abs(anchorAfter.gx - anchorBefore.gx)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(anchorAfter.gy - anchorBefore.gy)).toBeLessThanOrEqual(0.5);

  // Clamp at both ladder ends (AC-2/AC-5): 3 steps per event max (19 rungs
  // end to end), so repeat until the ladder end is provably reached.
  for (let i = 0; i < 8; i++) await game.wheelAt(u, v, 300); // hard zoom out
  expect((await getRawState(page)).viewSpan).toBe(MAX_SPAN);
  for (let i = 0; i < 8; i++) await game.wheelAt(u, v, -300); // hard zoom in
  const zoomed = await getRawState(page);
  expect(zoomed.viewSpan).toBe(MIN_SPAN);
});

test('camera: WASD pans the viewport and clamps at the board edges', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  const before = await getRawState(page);
  await keyDown(page, 'd');
  await runFor(page, 300);
  await keyUp(page, 'd');
  const panned = await getRawState(page);
  expect(panned.viewX).toBeGreaterThan(before.viewX);

  // Hold west past the edge: clamped at 0 (MathGrid.clampViewport).
  await keyDown(page, 'a');
  await runFor(page, 3_000);
  await keyUp(page, 'a');
  const west = await getRawState(page);
  expect(west.viewX).toBe(0);

  // Hold east past the edge: clamped at GRID − span.
  await keyDown(page, 'd');
  await runFor(page, 3_000);
  await keyUp(page, 'd');
  const east = await getRawState(page);
  expect(east.viewX).toBe(GRID - east.viewSpan);
  expect(east.viewX).toBeGreaterThanOrEqual(0);
});

test('camera: the zoom math oracles agree (anchor ≤ 0.5 cells, ladder clamp)', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  for (const name of ['testZoomAnchor', 'testZoomClamp']) {
    const result = await runHarnessTest(page, name);
    expect(result.pass, `${result.name}: ${result.detail}`).toBe(true);
  }
  // Sanity: the oracles ran against the live math bridge the wheel path uses.
  const reachable = await withLiveState(page, () => {
    const s = (window as any).SD;
    const r = s.MathGrid.resolveZoom(0, 0, 16, { x: 100, y: 100 }, -100, 768);
    return { changed: Boolean(r.changed), viewSpan: r.viewSpan };
  });
  expect(reachable.changed).toBe(true);
  expect(reachable.viewSpan).not.toBe(16);
});
