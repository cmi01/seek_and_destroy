// 02-sector-generation.spec.ts — scenario 02 (test-architecture doc §2):
// SD.setSeed(42) determinism — two generates → identical unit layout — plus the
// generated sector's structural contract: player formation with the flagship at
// the lead apex (buildSectorData.js spawnPlayerFormation: lead cell (4,15),
// escorts on a radius-2 arc behind, facing +x) and a spawned enemy fleet with
// its own flagship held far right. Enemy spawn counts/composition come from
// data/campaign_DATA.js budgets — only invariants are asserted, not a
// hard-coded roster (the canonical seed-42 layout is pinned in
// tests/fixtures/seeds.json against observed output).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { generateSector, getRawState, setSeed, type SdUnit } from '../helpers/sd';
import seedsFixture from '../fixtures/seeds.json';

// The canonical seed for sector determinism (tests/fixtures/seeds.json).
const SEED = seedsFixture.seeds.sectorDeterminism as number;

// Deterministic, order-stable unit layout fingerprint.
function layout(units: SdUnit[]): Array<Pick<SdUnit, 'id' | 'type' | 'team' | 'x' | 'y' | 'hp'> & { flags: string[] }> {
  return [...units]
    .sort((a, b) => a.id - b.id)
    .map((u) => ({ id: u.id, type: u.type, team: u.team, x: u.x, y: u.y, hp: u.hp, flags: [...u.flags].sort() }));
}

test('sector generation: SD.setSeed(42) reproduces an identical sector twice', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  await setSeed(page, SEED);
  await generateSector(page, 101);
  const first = await getRawState(page);
  const firstLayout = layout(first.units);

  await setSeed(page, SEED);
  await generateSector(page, 101);
  const second = await getRawState(page);
  const secondLayout = layout(second.units);

  expect(first.rngSeed).toBe(SEED);
  expect(second.rngSeed).toBe(SEED);
  expect(firstLayout.length).toBeGreaterThan(0);
  expect(secondLayout).toEqual(firstLayout);

  // The canonical layout from the fixture (observed output for seed 42) — the
  // determinism contract is pinned, not merely self-consistent.
  const canonical = (seedsFixture.expectedLayouts as Record<string, unknown>)[String(SEED)];
  expect(canonical).toBeDefined();
  expect(secondLayout).toEqual(canonical);
});

test('sector generation: player flagship leads the apex and the enemy fleet spawns far right', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  await setSeed(page, SEED);
  await generateSector(page, 101);
  const state = await getRawState(page);

  const team1 = state.units.filter((u) => u.team === 1);
  const team2 = state.units.filter((u) => u.team === 2);
  expect(team1.length).toBeGreaterThan(0);
  expect(team2.length).toBeGreaterThan(0); // enemy spawn

  // Exactly one player flagship, at the formation's lead apex (4,15).
  const flags1 = team1.filter((u) => u.flags.includes('!flagship'));
  expect(flags1).toHaveLength(1);
  expect({ x: flags1[0].x, y: flags1[0].y }).toEqual({ x: 4, y: 15 });

  // Escorts sit on the radius-2 arc behind the lead (x ≤ 4, within the circle).
  for (const u of team1) {
    if (u.flags.includes('!flagship')) continue;
    const dx = u.x - 4;
    const dy = u.y - 15;
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(2.5);
    expect(dx).toBeLessThanOrEqual(0); // behind the lead, facing +x
  }

  // The enemy flagship is held far right of the board (buildSectorData.js).
  const flags2 = team2.filter((u) => u.flags.includes('!flagship'));
  expect(flags2.length).toBeGreaterThanOrEqual(1);
  expect(flags2[0].x).toBeGreaterThanOrEqual(16);

  // Both fleets are healthy spawns: full-hp units on the grid.
  for (const u of state.units) {
    expect(u.hp).toBe(u.maxHp);
    expect(u.hp).toBeGreaterThan(0);
  }
});
