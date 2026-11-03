// 08-campaign-deployment.spec.ts — scenario 08 (test-architecture doc §2):
// the M2 campaign deployment flow at the UI seam: the pre-battle deployment
// modal (boot state since v112), DEPLOY_TOGGLE selection, the forced flagship
// (its row is locked: DEPLOY_LOCK:0), overflow landing in State.battleReserve,
// and credits staying frozen during battle (the in-page precedent is
// gameTests.js "M2 DEPLOYMENT FLAGSHIP FORCED" / "M2 BATTLE CREDITS FROZEN").
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getActiveModal, getRawState } from '../helpers/sd';
import { advanceAiTurn as advanceTurn } from '../helpers/time';

test('deployment: the flagship row is locked and confirm deploys the toggled selection with overflow to the reserve', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  // Boot contract: deployment modal over an ungenerated sector, campaign fleet
  // of 5 hulls behind it, flagship row locked, capacity 4 (campaign_DATA.js
  // cornerCapacity) → 1 hull overflows to the battle reserve.
  expect(await getActiveModal(page)).toBe('deploy');
  const boot = await getRawState(page);
  expect(boot.units).toHaveLength(0);
  const fleet = (boot.campaign as { fleet: Array<{ hull: string }> }).fleet;
  expect(fleet).toHaveLength(5);
  expect(fleet[0].hull).toContain('Flagship'); // flagship forced first

  const locked = await game.buttonRect('DEPLOY_LOCK:0');
  expect(locked!.enabled).toBe(false);
  for (let i = 1; i <= 4; i++) {
    const btn = await game.buttonRect(`DEPLOY_TOGGLE:${i}`);
    expect(btn, `DEPLOY_TOGGLE:${i} on the deploy modal`).not.toBeNull();
    expect(btn!.enabled).toBe(true);
  }

  // Toggle the selection: drop fleet[3] (Attack Frigate), add fleet[4] (Probe).
  await game.clickCanvasButton('DEPLOY_TOGGLE:3');
  await game.clickCanvasButton('DEPLOY_TOGGLE:4');
  await game.clickCanvasButton('DEPLOY_CONFIRM');

  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);
  const state = await getRawState(page);
  expect(await getActiveModal(page)).toBeNull();

  const team1 = state.units.filter((u) => u.team === 1);
  const team2 = state.units.filter((u) => u.team === 2);
  const hulls = team1.map((u) => u.type).sort();
  expect(hulls).toEqual(['Fighter', 'Fighter', 'Flagship Battlecruiser', 'Probe']);
  expect(team1.filter((u) => u.flags.includes('!flagship'))).toHaveLength(1);
  expect(team2.length).toBeGreaterThan(0); // the encounter still spawns opposition

  // Overflow accounting: deployed + reserve == the campaign fleet.
  expect(state.battleReserve).toEqual([{ hull: 'Attack Frigate' }]);
  expect(team1.length + state.battleReserve.length).toBe(fleet.length);
});

test('deployment: battle credits stay frozen across a full turn cycle', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  const before = await getRawState(page);
  const walletBefore = (before.campaign as { wallet: number }).wallet;

  await game.clickCanvasButton('END_TURN');
  await advanceTurn(page);
  await expect.poll(async () => (await getRawState(page)).activeTeam, { timeout: 5_000 }).toBe(1);

  const after = await getRawState(page);
  expect(after.credits).toEqual(before.credits); // M2: in-battle credits frozen
  expect(after.income).toEqual(before.income);
  expect((after.campaign as { wallet: number }).wallet).toBe(walletBefore);
  expect(after.turnNumber).toBe(before.turnNumber + 1);
});
