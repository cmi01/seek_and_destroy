// 10-persistence-audio.spec.ts — scenario 10 (test-architecture doc §2): state
// persistence + audio. (a) SD.saveState()/SD.loadState() round-trips the battle
// state, (b) a v99-shaped save (pre-M1 money scale) migrates with money ×100
// and never double-scales (the in-page precedent is gameTests.js "CAMPAIGN V99
// SAVE MIGRATION"), (c) sd.audio.settings.v2 persists across a reload, and (d)
// the audio engine's own self-suite passes. The game persists no score counter;
// the persisted surface is the state snapshot + audio settings (audit §3).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import {
  getAudioStorage, getRawState, isBooted, loadState, runAudioTests, saveState, toggleMute, withLiveState,
} from '../helpers/sd';
import audioFixture from '../fixtures/audio-settings.json';
import { step } from '../helpers/time';

// Scalar unit fingerprint — the save's own units carry flag Sets that do not
// survive JSON, so the round-trip asserts on scalar fields.
function unitFingerprints(state: any): Array<Record<string, unknown>> {
  return state.units
    .map((u: any) => ({ id: u.id, type: u.type, team: u.team, x: u.x, y: u.y, hp: u.hp }))
    .sort((a: any, b: any) => a.id - b.id);
}

test('persistence: a battle snapshot round-trips through saveState/loadState', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  const saved = await saveState(page) as any;
  expect(saved.schema).toBe('seek-and-destroy.beginning-game-state');
  const expectedUnits = unitFingerprints(saved.state);
  expect(expectedUnits.length).toBeGreaterThan(0);

  // Diverge the live state, then restore the snapshot.
  await withLiveState(page, () => {
    const st = (window as any).SD.getRawState();
    st.credits[1] = 9999;
    st.turnNumber = 7;
    st.units = [];
  });
  const diverged = await getRawState(page);
  expect(diverged.turnNumber).toBe(7);
  expect(diverged.units).toHaveLength(0);

  expect(await loadState(page, saved)).toBe(true);
  const restored = await getRawState(page);
  expect(restored.turnNumber).toBe(saved.state.turnNumber);
  expect(restored.credits[1]).toBe(saved.state.credits[1]);
  expect(unitFingerprints(restored)).toEqual(expectedUnits);
});

test('persistence: a v99 save migrates money ×100 and never double-scales', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  // The v99 fixture shape, mirroring gameTests.js "CAMPAIGN V99 SAVE MIGRATION":
  // pre-M1 credits/income in units, no campaign key.
  const v99 = {
    schema: 'seek-and-destroy.beginning-game-state',
    version: 'V58-1.0',
    state: {
      theme: 'default',
      levelId: 101,
      turnNumber: 3,
      activeTeam: 1,
      ap: 4,
      credits: { 1: 35, 2: 12 },
      income: { 1: 5, 2: 1 },
      gameOver: false,
      viewX: 4,
      viewY: 6,
      viewSpan: 16,
    },
  };

  expect(await loadState(page, v99)).toBe(true);
  const migrated = await getRawState(page);
  expect(migrated.credits).toEqual({ 1: 3500, 2: 1200 }); // ×100 money scale
  expect(migrated.income).toEqual({ 1: 500, 2: 100 });
  expect(migrated.turnNumber).toBe(3); // non-money fields untouched
  expect(migrated.viewSpan).toBe(16);

  // Reload the migrated save: money must not scale a second time.
  const resaved = await saveState(page) as any;
  expect(resaved.version).not.toBe('V58-1.0');
  expect(await loadState(page, resaved)).toBe(true);
  const again = await getRawState(page);
  expect(again.credits).toEqual({ 1: 3500, 2: 1200 });
});

test('persistence: audio settings survive a page reload', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  // toggleMute persists the sd.audio.settings.v2 payload (sounds.js
  // STORAGE_KEY / saveSettings) — the game's only localStorage key.
  await toggleMute(page);
  const raw = await getAudioStorage(page);
  expect(raw).not.toBeNull();
  const stored = JSON.parse(raw!);
  expect(Object.keys(stored).sort()).toEqual(Object.keys((audioFixture.payloads as any).default).sort());
  expect(stored.muted).toBe(true);

  await page.reload();
  await expect.poll(() => isBooted(page), { timeout: 15_000 }).toBe(true);
  await step(page);

  const restored = (await getRawState(page)).audioSettings as { muted: boolean; master: number };
  expect(restored.muted).toBe(true); // persisted state applied at boot
  expect(restored.master).toBe((audioFixture.payloads as any).default.master);
});

test('persistence: the audio engine self-suite passes 5/5', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  const results = await runAudioTests(page);
  expect(results).toHaveLength(5);
  for (const r of results) {
    expect(r.pass, `${r.name}: ${r.detail}`).toBe(true);
  }
});
