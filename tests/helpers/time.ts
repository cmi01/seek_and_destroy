// time.ts — virtual-clock helpers (test-architecture doc §7): page.clock.install() before
// load and clock.runFor(...) to fire State.aiTimers / audioTimers. Real sleeps
// (waitForTimeout) are banned in this suite — never add one.
// Contract: pure helpers — (page, ms) → Promise<void>. Durations below are
// grounded in the game's timer constants: the endgame modal timer is 450 ms
// (game.js checkEndgame), the AI turn runs beats every 500 ms (rules_DATA.js
// enemyActionIntervalMs, max 12) behind a 500 ms start timer and closes with a
// 460 ms handoff timer (game.js AI.executeTurn).
import type { Page } from '@playwright/test';

/** Install Playwright's virtual clock before navigation. */
export function installClock(page: Page): Promise<void> {
  return page.clock.install();
}

/** Advance virtual time by ms, firing the game's pending timers. */
export function runFor(page: Page, ms: number): Promise<void> {
  return page.clock.runFor(ms);
}

/** One interaction beat: enough frames for the input FIFO + short VFX clocks. */
export function step(page: Page, ms = 100): Promise<void> {
  return page.clock.runFor(ms);
}

/** Cover the 450 ms endgame-modal timer (game.js checkEndgame). */
export function advanceEndgameModal(page: Page): Promise<void> {
  return page.clock.runFor(500);
}

/** Cover a full AI turn: 500 ms start + 12×500 ms beats + 460 ms handoff. */
export function advanceAiTurn(page: Page): Promise<void> {
  return page.clock.runFor(8_000);
}

/** Drain every pending timer (audio + AI) without asserting on wall time. */
export function flushTimers(page: Page): Promise<void> {
  return page.clock.runFor(10_000);
}
