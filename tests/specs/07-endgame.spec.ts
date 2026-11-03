// 07-endgame.spec.ts — scenario 07 (test-architecture doc §2): game over →
// endgame modal → restart. Defeat (flagship lost → over/flagship-lost) and
// victory (enemy flagship down → level complete + campaign fold) are forced
// through state surgery + Actions.checkEndgame (the audit's sanctioned seam);
// the modal timer is fired on the virtual clock (450 ms, game.js checkEndgame),
// and the restart contract is the real ENDGAME_RETRY button (Hud rect →
// pointer dispatch → SectorGenerator.generate fresh).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getActiveModal, getRawState, setSeed, withLiveState } from '../helpers/sd';
import { advanceEndgameModal } from '../helpers/time';

test('game over: losing the flagship ends the game, shows the endgame modal, and REDEPLOY restarts a fresh sector', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  // Force the defeat condition: no team-1 hull left (flagship lost).
  const ended = await withLiveState(page, () => {
    const s = (window as any).SD;
    const st = s.getRawState();
    st.units = st.units.filter((u: any) => u.team !== 1);
    return { check: Boolean(s.Actions.checkEndgame()), gameOver: s.getRawState().gameOver };
  });
  expect(ended.check).toBe(true);
  expect(ended.gameOver).toBe(true);

  // The verdict modal arrives on a 450 ms timer to let the killing blow play.
  await advanceEndgameModal(page);
  expect(await getActiveModal(page)).toBe('endgame');
  const buttons = (await getRawState(page)).canvasButtons.map((b) => b.id);
  expect(buttons).toContain('ENDGAME_RETRY');
  expect(buttons).toContain('ENDGAME_MAP');

  // Restart: ENDGAME_RETRY regenerates the sector fresh (seeded for
  // determinism before the click, since generation consumes the RNG).
  await setSeed(page, 42);
  await game.clickCanvasButton('ENDGAME_RETRY');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  const fresh = await getRawState(page);
  expect(fresh.gameOver).toBe(false);
  expect(await getActiveModal(page)).toBeNull();
  expect(fresh.turnNumber).toBe(1);
  expect(fresh.ap).toBe(4);
  expect(fresh.rngSeed).toBe(42);
});

test('victory: clearing the enemy fleet marks the level complete and folds the battle into the campaign', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  const outcome = await withLiveState(page, () => {
    const s = (window as any).SD;
    const st = s.getRawState();
    const survivors = st.units.filter((u: any) => u.team === 1).length;
    const reserve = (st.battleReserve || []).length;
    st.units = st.units.filter((u: any) => u.team !== 2);
    const check = Boolean(s.Actions.checkEndgame());
    const after = s.getRawState();
    const campaign = after.campaign;
    return {
      check,
      gameOver: after.gameOver,
      completed: Array.from(after.completedLevels as Set<number>),
      survivors,
      reserve,
      fleetSize: campaign && Array.isArray(campaign.fleet) ? campaign.fleet.length : -1,
      hasFlagship: campaign && Array.isArray(campaign.fleet)
        ? campaign.fleet.some((e: any) => String(e.hull).indexOf('Flagship') !== -1)
        : false,
    };
  });

  expect(outcome.check).toBe(true);
  expect(outcome.gameOver).toBe(true);
  expect(outcome.completed).toContain(101); // State.completedLevels.add(levelId)

  // Campaign fold (game.js checkEndgame → ApplyBattleResult): surviving hulls
  // plus the battle reserve become the next fleet, flagship retained — the
  // same contract as in-page "M2 LIVE PATH CARRY-OVER".
  expect(outcome.fleetSize).toBe(outcome.survivors + outcome.reserve);
  expect(outcome.hasFlagship).toBe(true);

  await advanceEndgameModal(page);
  expect(await getActiveModal(page)).toBe('endgame');
});
