// 11-campaign-map.spec.ts — scenario 11 (M3 acceptance, roadmap §4 M3):
// the campaign map is the campaign's main screen; battles launch from map
// encounters through the M2 seam and the result folds back onto the map.
// (a) boot lands on the map (no modal, "MAP // …" HUD tag), (b) entering a
// fleet/location opens it — the encounter records on the map and the hailing
// shell (voice placeholder) shows the HAIL_TALK/THREATEN/LEAVE options,
// (c) the NEXT turn commits the encounter to battle via the M2 seam (the
// DEPLOYMENT step opens), (d) victory folds the result back onto the map
// (screen "map", freeze lifted). The level ladder is retired as the
// encounter source (M3).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getActiveModal, getRawState, withLiveState } from '../helpers/sd';
import { advanceEndgameModal } from '../helpers/time';

test('campaign map: entering an encounter opens the hailing shell and the NEXT turn launches the battle (M2 seam)', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  // (a) map-first boot.
  const boot = await getRawState(page);
  expect(((boot.campaign as { map: { screen: string } }).map).screen).toBe('map');
  expect(await getActiveModal(page)).toBeNull();

  // (b) enter the first foreign fleet's square (turn-capped travel is out of
  // scope here — park adjacent via the sanctioned live-state seam, then the
  // real travel op opens the encounter).
  await game.engageMapEncounterOpenOnly();
  const opened = await getRawState(page);
  const map = (opened.campaign as { map: { pendingEncounter: { kind: string } | null } }).map;
  expect(map.pendingEncounter).not.toBeNull();
  expect(map.pendingEncounter!.kind).toBe('fleet');

  // The hailing shell (voice placeholder) is on the map HUD with the three
  // dialogue options as canvas buttons.
  const hailIds = opened.canvasButtons.map((b) => b.id).filter((id) => id.startsWith('HAIL_'));
  expect(hailIds).toEqual(['HAIL_TALK', 'HAIL_THREATEN', 'HAIL_LEAVE']);

  // (c) the NEXT turn commits the encounter to battle through the M2 seam:
  // the DEPLOYMENT step opens (the level ladder no longer launches battles).
  await game.commitMapTurn();
  expect(await getActiveModal(page)).toBe('deploy');
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  const after = await getRawState(page);
  const mapAfter = (after.campaign as { map: { screen: string; battleActive: boolean; pendingEncounter: unknown } }).map;
  expect(mapAfter.screen).toBe('battle');
  expect(mapAfter.battleActive).toBe(true); // Q4: the map freezes during battle
  expect(mapAfter.pendingEncounter).toBeNull(); // consumed by the launch
});

test('campaign map: the battle result folds back onto the map (screen returns, freeze lifts)', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  // Victory through the sanctioned seam: clear the enemy fleet, then the
  // endgame check runs the campaign fold (ApplyBattleResult).
  const outcome = await withLiveState(page, () => {
    const s = (window as any).SD;
    const st = s.getRawState();
    st.units = st.units.filter((u: { team: number }) => u.team !== 2);
    return { check: Boolean(s.Actions.checkEndgame()), gameOver: s.getRawState().gameOver };
  });
  expect(outcome.check).toBe(true);
  expect(outcome.gameOver).toBe(true);

  await advanceEndgameModal(page);
  expect(await getActiveModal(page)).toBe('endgame');

  const folded = await getRawState(page);
  const map = (folded.campaign as {
    map: { screen: string; battleActive: boolean; fleets: Array<{ faction: string; ships: unknown[] }> };
  }).map;
  expect(map.screen).toBe('map'); // the map screen returns
  expect(map.battleActive).toBe(false); // the freeze lifts
  const playerFleet = map.fleets.find((f) => f.faction === 'player');
  expect(playerFleet!.ships.length).toBeGreaterThan(0); // roster mirrored back
});
