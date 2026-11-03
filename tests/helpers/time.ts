// time.ts — virtual-clock helpers (test-architecture doc §7): page.clock.install() before
// load and clock.runFor(...) to fire State.aiTimers / audioTimers. Real sleeps
// (waitForTimeout) are banned in this suite — never add one.
// Contract: pure helpers — (page, ms) → Promise<void>.
import type { Page } from '@playwright/test';

/** Install Playwright's virtual clock before navigation. */
export function installClock(page: Page): Promise<void> {
  return page.clock.install();
}

/** Advance virtual time by ms, firing the game's pending timers. */
export function runFor(page: Page, ms: number): Promise<void> {
  return page.clock.runFor(ms);
}

// TODO(05-turn-cycle.spec.ts): advanceToAiTurn(page) — runFor just enough for the
//      AI turn timers once the spec pins the timer durations from State.aiTimers.
// TODO(10-persistence-audio.spec.ts): flushAudioTimers(page) — runFor over
//      State.audioTimers.
