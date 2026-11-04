// 04-combat.spec.ts — scenario 04 (test-architecture doc §2): the firing
// mechanic — canShoot gate → executeShoot → hit/damage/destroy. The in-page
// precedent is gameTests.js "M2 MIRAGE ANY HIT DESTROYS"; the E2E seam drives
// the same Actions the input processor calls for a board click on an enemy.
// Scoring note (task wording "hit detection updates score"): this game has no
// kill-score counter — combat outcomes are recorded as target hp / destroyed
// units (plus turn reports), while progression-scoring lives in the campaign
// fold (covered in 08-campaign-deployment / 07-endgame).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getRawState, pickEmptyAdjacentPair, withLiveState } from '../helpers/sd';

test('firing: canShoot gates the shot and executeShoot costs 1 AP and drops target hp', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  // t_2922ab3c: sector terrain is randomly generated per unseeded boot and the
  // game's WEAPON LOS correctly refuses a shot into an ASTEROID target cell
  // (lineOfSight.js) — so the fixture cells come from State.terrain at runtime
  // (a verified EMPTY adjacent pair near the historical (16,16)/(16,17)),
  // never hardcoded. The (28,28) probe below is excluded from placement so it
  // stays an empty, out-of-range cell by construction.
  const cells = await pickEmptyAdjacentPair(page, { x: 16, y: 16 }, [{ x: 28, y: 28 }]);

  const shot = await withLiveState(page, (c: { shooter: { x: number; y: number }; target: { x: number; y: number } }) => {
    const s = (window as any).SD;
    const st = s.getRawState();
    st.units = [];
    st.ap = 4;
    st.activeTeam = 1;
    st.gameOver = false;
    const shooter = s.SectorGenerator.createUnit('Fighter', 1, c.shooter.x, c.shooter.y, false);
    const target = s.SectorGenerator.createUnit('Light Cruiser', 2, c.target.x, c.target.y, false);
    const gateIn = s.Actions.canShoot(shooter, { x: c.target.x, y: c.target.y });
    const gateOut = s.Actions.canShoot(shooter, { x: 28, y: 28 }); // out of range / no target
    const hpBefore = target.hp;
    s.Actions.executeShoot(shooter, target, false, 1);
    return {
      gateIn: Boolean(gateIn),
      gateOut: Boolean(gateOut),
      hpBefore,
      hpAfter: target.hp,
      apAfter: st.ap,
      attacked: shooter.flags.has('-attacked'),
    };
  }, cells);

  expect(shot.gateIn).toBe(true);
  expect(shot.gateOut).toBe(false);
  expect(shot.hpAfter).toBeLessThan(shot.hpBefore); // hit detection: damage applied
  expect(shot.hpAfter).toBeGreaterThan(0); // non-lethal shot
  expect(shot.apAfter).toBe(3); // 1 AP per shot
  expect(shot.attacked).toBe(true);
});

test('firing: a lethal hit destroys the target and removes it from the board', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  // Same terrain-derived fixture as the gate test above (t_2922ab3c) — these
  // two drive executeShoot directly (no gate), but share the fixture shape.
  const cells = await pickEmptyAdjacentPair(page, { x: 16, y: 16 });

  const kill = await withLiveState(page, (c: { shooter: { x: number; y: number }; target: { x: number; y: number } }) => {
    const s = (window as any).SD;
    const st = s.getRawState();
    st.units = [];
    st.ap = 4;
    st.activeTeam = 1;
    st.gameOver = false;
    const shooter = s.SectorGenerator.createUnit('Fighter', 1, c.shooter.x, c.shooter.y, false);
    const target = s.SectorGenerator.createUnit('Probe', 2, c.target.x, c.target.y, false); // hp 1
    s.Actions.executeShoot(shooter, target, false, 1);
    const survivors = s.getRawState().units.map((u: any) => u.id);
    return { targetId: target.id, alive: survivors.indexOf(target.id) !== -1 };
  }, cells);

  expect(kill.alive).toBe(false);
});

test('firing: a mirage is destroyed by any hit regardless of its hp', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  const cells = await pickEmptyAdjacentPair(page, { x: 16, y: 16 });

  const mirage = await withLiveState(page, (c: { shooter: { x: number; y: number }; target: { x: number; y: number } }) => {
    const s = (window as any).SD;
    const st = s.getRawState();
    st.units = [];
    st.ap = 4;
    st.activeTeam = 1;
    st.gameOver = false;
    const shooter = s.SectorGenerator.createUnit('Fighter', 1, c.shooter.x, c.shooter.y, false);
    const target = s.SectorGenerator.createUnit('Probe', 2, c.target.x, c.target.y, false);
    target.kind = 'mirage';
    target.hp = 5; // far more hp than one Fighter shot can deal
    target.maxHp = 5;
    s.Actions.executeShoot(shooter, target, false, 1);
    const survivors = s.getRawState().units.map((u: any) => u.id);
    return { alive: survivors.indexOf(target.id) !== -1 };
  }, cells);

  expect(mirage.alive).toBe(false); // DESIGN §2.8: a mirage has no HP
});
