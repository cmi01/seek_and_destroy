// 05-turn-cycle.spec.ts — scenario 05 (test-architecture doc §2): END_TURN →
// AI turn → player turn, through the real END_TURN canvas button (the input
// path the audit's scenario 5/6 describe), plus the AI behaviour oracles
// (SD.Harness.testKiting/testFocusFire/testFleeWhenOutgunned/testRailgunAvoidance)
// as logic-level assertions on the same AI the turn runner executes.
// Timer regime (§7): the AI turn is driven entirely on the virtual clock —
// 500 ms start timer, 500 ms per beat (rules_DATA.js enemyActionIntervalMs,
// 12-beat cap), 460 ms handoff (game.js AI.executeTurn).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getRawState, runHarnessTest } from '../helpers/sd';
import { advanceAiTurn } from '../helpers/time';

test('turn cycle: END_TURN hands off to the AI and back, advancing the turn counter', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  const before = await getRawState(page);
  expect(before.activeTeam).toBe(1);
  expect(before.turnNumber).toBe(1);

  // Real button dispatch: Hud rect → POINTER_DOWN/UP → _handleCanvasButtonClick
  // "END_TURN" → consumeAPAndCheckTurn → transitionToAITurn.
  await game.clickCanvasButton('END_TURN');
  expect((await getRawState(page)).activeTeam).toBe(2); // player actions locked

  await advanceAiTurn(page); // virtual: start timer + AI beats + handoff timer

  await expect.poll(async () => (await getRawState(page)).activeTeam, { timeout: 5_000 }).toBe(1);
  const after = await getRawState(page);
  expect(after.turnNumber).toBe(before.turnNumber + 1);
  expect(after.ap).toBe(4); // player AP refilled on the new turn
  expect(after.gameOver).toBe(false);
});

test('AI behavior oracles pass: kiting, focus fire, flee-when-outgunned, railgun avoidance', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  // Each oracle builds its own board (gameTests.js clearBoard) and returns
  // {name, pass, detail}; they mutate state, so they run strictly sequentially.
  for (const name of ['testKiting', 'testFocusFire', 'testFleeWhenOutgunned', 'testRailgunAvoidance']) {
    const result = await runHarnessTest(page, name);
    expect(result.pass, `${result.name}: ${result.detail}`).toBe(true);
  }
});
