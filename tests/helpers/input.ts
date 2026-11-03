// input.ts — synthesize the game's input events at normalized canvas
// coordinates (audit §3 input surface: POINTER_MOVE/DOWN/UP, WHEEL, KEY_DOWN/UP).
// Contract: pure dispatch helpers — (page, u, v, …) → void; u,v ∈ [0,1] are
// fractions of the canvas box, so specs are resolution-independent (test-architecture doc §2).
//
// Dispatch is REAL browser input (Playwright mouse/keyboard), matching the DOM
// listeners in inputs.js exactly: mousemove/mousedown/mouseleave/wheel on the
// canvas, mouseup/keydown/keyup on window. The game normalizes those to
// {type, u, v} input DTOs itself, so no synthetic-event plumbing is needed.
// These helpers never advance time — pair them with helpers/time.ts step().
import type { Page } from '@playwright/test';

/** Page-pixel point for normalized canvas coordinates u,v ∈ [0,1]. */
export async function toCanvasPoint(page: Page, u: number, v: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('#battle-canvas').boundingBox();
  if (!box) throw new Error('#battle-canvas has no bounding box');
  return { x: box.x + u * box.width, y: box.y + v * box.height };
}

/** POINTER_MOVE: hover the canvas at u,v (also seeds State.mousePx for WHEEL). */
export async function pointerMove(page: Page, u: number, v: number): Promise<void> {
  const p = await toCanvasPoint(page, u, v);
  await page.mouse.move(p.x, p.y);
}

/** POINTER_DOWN + POINTER_UP at u,v (canvas mousedown, window mouseup). */
export async function pointerClick(page: Page, u: number, v: number): Promise<void> {
  const p = await toCanvasPoint(page, u, v);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}

/** WHEEL at u,v with deltaY in pixels (inputs.js wheelNotchPx = 100 per notch). */
export async function wheelAt(page: Page, u: number, v: number, deltaY: number): Promise<void> {
  const p = await toCanvasPoint(page, u, v);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, deltaY);
}

/** KEY_DOWN (window keydown). */
export async function keyDown(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
}

/** KEY_UP (window keyup). */
export async function keyUp(page: Page, key: string): Promise<void> {
  await page.keyboard.up(key);
}
