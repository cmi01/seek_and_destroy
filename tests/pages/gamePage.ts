// gamePage.ts — page object for the Seek & Destroy game shell (test-architecture doc §2).
// Job: translate Playwright interaction with the game's single-canvas UI into
// stable handles (boot URL + query params, canvas box, SD state reads) so specs
// never hand-roll selectors. Thin stub for now — real rect math and button
// dispatch land with the scenario specs (TODOs below).
import type { Page, Locator } from '@playwright/test';

export class GamePage {
  constructor(private readonly page: Page) {}

  /** Boot the game. Query params (?test=1 preloads the test harness) go here. */
  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
  }

  /** The game's only interactive DOM surface (audit §3). */
  canvas(): Locator {
    return this.page.locator('#battle-canvas');
  }

  /** Boot-failure banner the game appends on a failed start (main.js boot guard). */
  bootFailureBanner(): Locator {
    return this.page.locator('pre');
  }

  // TODO(01-boot-smoke.spec.ts): canvasBox() helper — canvas bounding box in CSS px.
  // TODO(06-hud-buttons.spec.ts): clickCanvasButton(id) — Hud view-model rect →
  //      normalized (u,v) pointer dispatch via helpers/input.ts.
  // TODO(09-camera-zoom.spec.ts): wheelAt(u, v, deltaY) — zoom gesture at a
  //      normalized canvas position.
}

export function gamePage(page: Page): GamePage {
  return new GamePage(page);
}
