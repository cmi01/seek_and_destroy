// sd.ts — typed pure wrappers over the game's window.SD debug handle
// (test-architecture doc §2, §6). Contract: (page, …args) → plain data via page.evaluate;
// no module-level state, no side effects on the game beyond what the named call
// documents. Specs assert on the data returned here — never on canvas pixels.
import type { Page } from '@playwright/test';

/** The game's live state object (SD.getRawState() === the State shell). */
export type SdRawState = {
  gameOver?: boolean;
  activeTeam?: number;
  turnNumber?: number;
  [key: string]: unknown;
};

/** Live canvas geometry computed at boot (SD.LayoutMetrics). */
export type SdLayoutMetrics = {
  devicePx: number;
  cellPx?: number;
  renderScale?: number;
  displaySize?: number;
  [key: string]: unknown;
};

/** True once the full script tree booted and exposeDebugHandle() ran. */
export function isBooted(page: Page): Promise<boolean> {
  return page.evaluate(() => typeof (window as unknown as { SD?: unknown }).SD === 'object' && (window as unknown as { SD?: unknown }).SD !== null);
}

/** SD.getRawState() — the whole game memory as plain data. */
export function getRawState(page: Page): Promise<SdRawState> {
  return page.evaluate(() => (window as any).SD.getRawState() as SdRawState);
}

/** SD.LayoutMetrics — live canvas geometry (devicePx pins canvas size assertions). */
export function getLayoutMetrics(page: Page): Promise<SdLayoutMetrics> {
  return page.evaluate(() => {
    const m = (window as any).SD.LayoutMetrics;
    return {
      devicePx: m.devicePx,
      cellPx: m.cellPx,
      renderScale: m.renderScale,
      displaySize: m.displaySize,
    } as SdLayoutMetrics;
  });
}

/** SD.Hud.isModalOpen() — modal / deploy overlay state (Hud view-model). */
export function isModalOpen(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as any).SD.Hud.isModalOpen()));
}

// TODO(02-sector-generation.spec.ts): setSeed(page, n) / clearSeed(page) —
//      SD.setSeed(n) is mulberry32 (game.js); seeds live in tests/fixtures/seeds.json.
// TODO(02-sector-generation.spec.ts): generateSector(page, levelId) —
//      SD.SectorGenerator.generate(levelId) after setSeed, returning unit layout.
// TODO(05-turn-cycle.spec.ts): harness oracles — SD.Harness.testKiting/testFocusFire/
//      testFlee/testRailgunAvoidance as logic-level assertions.
// TODO(10-persistence-audio.spec.ts): saveState/loadState round-trip wrappers.
