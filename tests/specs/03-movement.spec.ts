// 03-movement.spec.ts — scenario 03 (test-architecture doc §2): selection →
// executeMove through real canvas input (the audit's "player movement responds
// to input"): click a unit → Selection.select, click a reachable empty cell →
// the input processor's getPriorityActionAt → "MOVE" → Actions.executeMove,
// costing 1 AP. The ram/collision contract (M2 MIRAGE RAM DESTROYS BOTH, the
// in-page precedent) is verified at the Actions seam: colliding hulls can both
// die. State surgery through the SD live handle is the audit-sanctioned setup
// seam for the collision case.
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getRawState, withLiveState } from '../helpers/sd';

test('movement: clicking a unit selects it and clicking a reachable cell moves it for 1 AP', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  // Pick a player unit whose cell is clear of HUD panels, and a reachable
  // destination inside the current viewport (clicks under a panel are
  // swallowed by panel hit-testing — that is the game's own UX). The deploy
  // flow auto-selects one unit (sectorGenerator result.selectedUnitId), and
  // clicking the ALREADY-selected unit deselects it — so click a different one.
  const setup = await withLiveState(page, () => {
    const s = (window as any).SD;
    const st = s.getRawState();
    const selectedId = st.selectedUnitId;
    const panels = s.Hud.getPanelRects() || {};
    const inPanel = (px: number, py: number) =>
      Object.values(panels).some((r: any) => r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
    const cellPx = s.LayoutMetrics.displaySize / st.viewSpan;
    const cellClear = (x: number, y: number) => {
      const px = (x + 0.5 - st.viewX) * cellPx;
      const py = (y + 0.5 - st.viewY) * cellPx;
      return px >= 0 && py >= 0 && px <= s.LayoutMetrics.displaySize && py <= s.LayoutMetrics.displaySize && !inPanel(px, py);
    };
    const unit = st.units.find((u: any) => u.team === 1 && u.id !== selectedId && cellClear(u.x, u.y) && !u.flags.has('-moved'));
    if (!unit) return null;
    let dest: { x: number; y: number } | null = null;
    for (let x = st.viewX; x < st.viewX + st.viewSpan && !dest; x++) {
      for (let y = st.viewY; y < st.viewY + st.viewSpan; y++) {
        if (!cellClear(x, y)) continue;
        if (s.Actions.canMove(unit, { x, y })) { dest = { x, y }; break; }
      }
    }
    return dest ? { unitId: unit.id, from: { x: unit.x, y: unit.y }, dest, ap: st.ap } : null;
  });
  expect(setup).not.toBeNull();
  const { unitId, from, dest, ap } = setup!;

  // Click 1: select the unit (real pointer input through inputs.js).
  await game.clickCell(from.x, from.y);
  expect((await getRawState(page)).selectedUnitId).toBe(unitId);

  // Click 2: the reachable cell — input processor resolves MOVE and executes it.
  await game.clickCell(dest.x, dest.y);
  const after = await getRawState(page);
  const moved = after.units.find((u) => u.id === unitId)!;
  expect({ x: moved.x, y: moved.y }).toEqual(dest);
  expect(after.ap).toBe(ap - 1); // 1 AP per move (consumeAPAndCheckTurn)
});

test('collision: ramming an enemy hull resolves through the collision path and can destroy both', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();
  await game.engageMapEncounter();
  await game.clickCanvasButton('DEPLOY_CONFIRM');
  await expect.poll(async () => (await getRawState(page)).units.length).toBeGreaterThan(0);

  // Mirrors the in-page "M2 MIRAGE RAM DESTROYS BOTH" precedent at the E2E
  // seam: a mirage hull occupies the destination cell, the mover rams it.
  const ram = await withLiveState(page, () => {
    const s = (window as any).SD;
    const st = s.getRawState();
    st.units = [];
    st.ap = 4;
    st.activeTeam = 1;
    st.gameOver = false;
    const rammer = s.SectorGenerator.createUnit('Fighter', 1, 16, 16, false);
    const mirage = s.SectorGenerator.createUnit('Probe', 2, 16, 17, false);
    mirage.kind = 'mirage';
    const ids = { rammerId: rammer.id, mirageId: mirage.id };
    s.Actions.executeMove(rammer, { x: 16, y: 17 }, false, 1);
    const alive = s.getRawState().units.map((u: any) => u.id);
    return {
      ...ids,
      rammerAlive: alive.indexOf(ids.rammerId) !== -1,
      mirageAlive: alive.indexOf(ids.mirageId) !== -1,
    };
  });
  expect(ram.rammerAlive).toBe(false);
  expect(ram.mirageAlive).toBe(false);
});
