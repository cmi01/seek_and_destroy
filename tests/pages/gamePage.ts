// gamePage.ts — page object for the Seek & Destroy game shell (test-architecture doc §2).
// Job: translate Playwright interaction with the game's single-canvas UI into
// stable handles (boot URL + query params, canvas box, SD state reads) so specs
// never hand-roll selectors. The game's UI is entirely canvas-drawn (audit §3):
// buttons are Hud view-model rects in SD.LayoutMetrics.displaySize px space, and
// clicks are normalized (u,v) pointer dispatch through helpers/input.ts.
import { expect, type Page, type Locator } from '@playwright/test';
import { getRawState, isBooted, type SdButton } from '../helpers/sd';
import { pointerClick, wheelAt } from '../helpers/input';
import { installClock, step } from '../helpers/time';

export class GamePage {
  constructor(private readonly page: Page) {}

  /** Boot the game under the virtual clock (doc §7) and wait for window.SD. */
  async boot(path = '/'): Promise<void> {
    await installClock(this.page);
    await this.goto(path);
    await expect.poll(() => isBooted(this.page), { timeout: 15_000 }).toBe(true);
    await step(this.page);
  }

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

  /** Canvas bounding box in CSS px. */
  async canvasBox(): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await this.canvas().boundingBox();
    if (!box) throw new Error('#battle-canvas has no bounding box');
    return box;
  }

  /** Live Hud button rect by id (null when the button is not on screen). */
  async buttonRect(id: string): Promise<SdButton | null> {
    const state = await getRawState(this.page);
    return state.canvasButtons.find((b) => b.id === id) ?? null;
  }

  /** Click a canvas button by id: Hud rect → normalized (u,v) → pointer dispatch. */
  async clickCanvasButton(id: string): Promise<void> {
    const btn = await this.buttonRect(id);
    if (!btn) throw new Error(`canvas button not on screen: ${id}`);
    const ds = await this.page.evaluate(() => (window as any).SD.LayoutMetrics.displaySize as number);
    await pointerClick(this.page, (btn.x + btn.w / 2) / ds, (btn.y + btn.h / 2) / ds);
    await step(this.page);
  }

  /**
   * M3: reach the battle from the campaign map (the map is the campaign's
   * main screen since M3; the level ladder is retired as the encounter
   * source). Parks the player fleet one square from the first foreign fleet
   * (live-state surgery seam), enters its square — the encounter OPENS (the
   * hailing shell) — and commits the map turn, so the encounter enters
   * battle on the next turn through the M2 seam. Leaves the DEPLOYMENT
   * modal open for the caller's DEPLOY_CONFIRM click.
   */
  async engageMapEncounter(): Promise<void> {
    await this.engageMapEncounterOpenOnly();
    await this.commitMapTurn();
  }

  /** Park the fleet at the first encounter and enter its square — the
   *  encounter OPENS (hailing shell) but the turn is NOT committed yet. */
  async engageMapEncounterOpenOnly(): Promise<void> {
    await this.page.evaluate(() => {
      const s = (window as any).SD;
      const st = s.getRawState();
      const m = JSON.parse(JSON.stringify(st.campaign.map));
      const foe = m.fleets.find((f: { faction: string }) => f.faction !== 'player');
      const pf = m.fleets.find((f: { faction: string }) => f.faction === 'player');
      pf.x = foe.x - 1;
      pf.y = foe.y;
      st.campaign.map.fleets = m.fleets;
      s.Map.travel('player', { x: foe.x, y: foe.y });
    });
    await step(this.page);
  }

  /** Commit the map turn: an opened encounter enters battle (M2 seam). */
  async commitMapTurn(): Promise<void> {
    await this.page.evaluate(() => {
      (window as any).SD.Map.endTurn();
    });
    await step(this.page);
  }

  /** Click a grid cell's center (cell coords → viewport → normalized u,v). */
  async clickCell(gx: number, gy: number): Promise<void> {
    const geo = await this.page.evaluate(
      ([x, y]) => {
        const s = (window as any).SD;
        const ds = s.LayoutMetrics.displaySize;
        const cellPx = ds / s.getRawState().viewSpan;
        const px = ((x as number) + 0.5 - s.getRawState().viewX) * cellPx;
        const py = ((y as number) + 0.5 - s.getRawState().viewY) * cellPx;
        return { u: px / ds, v: py / ds };
      },
      [gx, gy] as [number, number],
    );
    await pointerClick(this.page, geo.u, geo.v);
    await step(this.page);
  }

  /** Zoom gesture at a normalized canvas position (deltaY in px; 100 = 1 notch). */
  async wheelAt(u: number, v: number, deltaY: number): Promise<void> {
    await wheelAt(this.page, u, v, deltaY);
    await step(this.page, 300); // zoom animation window is 180 ms
  }
}

export function gamePage(page: Page): GamePage {
  return new GamePage(page);
}
