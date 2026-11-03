// 06-hud-buttons.spec.ts — scenario 06 (test-architecture doc §2): HUD canvas
// buttons dispatched through the Hud view-model rects. There are no DOM widgets
// (audit §3) — the resilient selector here is the button id from
// State.canvasButtons + a rect-center pointer dispatch at normalized (u,v).
// Covered: MENU dropdown open/close, MENU_THEME theme switching, MENU_HELP →
// help modal → CLOSE_MODAL, and the disabled-button contract (a disabled rect
// changes nothing).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getActiveModal, getRawState, getTheme, isMenuOpen, withLiveState } from '../helpers/sd';
import { pointerClick } from '../helpers/input';

test('hud buttons: MENU opens the dropdown and clicking outside the board closes it', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  expect(await isMenuOpen(page)).toBe(false);
  await game.clickCanvasButton('MENU');
  expect(await isMenuOpen(page)).toBe(true);

  // The open dropdown exposes its menu entries as canvas buttons.
  const menuButtons = (await getRawState(page)).canvasButtons.map((b) => b.id);
  expect(menuButtons).toContain('MENU_THEME');
  expect(menuButtons).toContain('MENU_HELP');

  // Clicking outside the dropdown closes it (game.js POINTER_DOWN menu guard).
  await pointerClick(page, 0.5, 0.55);
  expect(await isMenuOpen(page)).toBe(false);
});

test('hud buttons: MENU_THEME cycles the active theme', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  const before = await getTheme(page);
  await game.clickCanvasButton('MENU'); // the theme entry lives in the dropdown
  await game.clickCanvasButton('MENU_THEME');

  const after = await getTheme(page);
  expect(after).not.toBe(before);
  const order = await withLiveState(page, () => (window as any).SD.Themes.order as string[]);
  expect(order).toContain(after);
});

test('hud buttons: MENU_HELP opens the help modal and CLOSE_MODAL dismisses it', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  await game.clickCanvasButton('MENU');
  await game.clickCanvasButton('MENU_HELP');
  expect(await getActiveModal(page)).toBe('help');

  await game.clickCanvasButton('CLOSE_MODAL');
  expect(await getActiveModal(page)).toBeNull();
});

test('hud buttons: a disabled button rect is ignored and changes nothing', async ({ page }) => {
  const game = gamePage(page);
  await game.boot(); // deploy modal is open at boot

  // The flagship row of the deployment modal is locked: id DEPLOY_LOCK:0,
  // enabled:false (hud.js buildDeploymentButtons).
  const locked = await game.buttonRect('DEPLOY_LOCK:0');
  expect(locked).not.toBeNull();
  expect(locked!.enabled).toBe(false);

  const before = await getRawState(page);
  await game.clickCanvasButton('DEPLOY_LOCK:0');
  const after = await getRawState(page);

  // Nothing changed: still pre-deployment, no units, same modal.
  expect(after.units).toHaveLength(0);
  expect(after.turnNumber).toBe(before.turnNumber);
  expect(await getActiveModal(page)).toBe('deploy');
});
