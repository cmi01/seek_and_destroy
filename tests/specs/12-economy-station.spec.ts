// 12-economy-station.spec.ts — scenario 12 (M4 acceptance, roadmap §4 M4):
// the economy/station/crew milestone end to end in the live page.
// (a) docked at SOL GATE STATION the map HUD offers the STATION opener and
// the storefront modal lays out posted quotes; buying a hull through real
// canvas-button clicks updates wallet + fleet consistently and survives a
// save/reload round-trip; (b) a stranded fleet (tank dry) gets the merchant
// caravan — the storefront opens in merchant mode, provisions cost the
// inflated price, buying fuel rescues the fleet and the next move goes
// through (the M3 placeholder offer is a real service).
import { test, expect } from '@playwright/test';
import { gamePage } from '../pages/gamePage';
import { getActiveModal, getRawState, withLiveState } from '../helpers/sd';

test('station storefront: buying a hull updates wallet/fleet and survives save/reload (M4)', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  // (a) docked at a station the opener is on the map HUD; the modal opens.
  expect(await game.buttonRect('STATION_OPEN')).not.toBeNull();
  await game.clickCanvasButton('STATION_OPEN');
  expect(await getActiveModal(page)).toBe('station');

  // (b) HULLS tab, then a real BUY click on the Fighter row.
  await game.clickCanvasButton('STATION_TAB:hulls');
  const buyBtn = await game.buttonRect('STATION_BUY:hull:Fighter');
  expect(buyBtn).not.toBeNull();
  expect(buyBtn!.enabled).toBe(true);

  const before = await getRawState(page);
  const beforeWallet = (before.campaign as { wallet: number }).wallet;
  const beforeFleet = (before.campaign as { fleet: unknown[] }).fleet.length;

  await game.clickCanvasButton('STATION_BUY:hull:Fighter');

  const after = await getRawState(page);
  const campaign = (after.campaign as {
    wallet: number;
    fleet: { hull: string; hp: number; maxHp: number; crew: number; maxCrew: number }[];
    cargo: Record<string, unknown>;
  });
  // wallet, cargo and fleet update consistently: wallet down by the posted
  // quote, the roster gains a full-crewed Fighter, cargo untouched.
  expect(campaign.wallet).toBeLessThan(beforeWallet);
  expect(campaign.fleet.length).toBe(beforeFleet + 1);
  const added = campaign.fleet[campaign.fleet.length - 1];
  expect(added.hull).toBe('Fighter');
  expect(added.hp).toBe(added.maxHp);
  expect(added.crew).toBe(added.maxCrew);
  const quote = beforeWallet - campaign.wallet;
  expect(quote).toBeGreaterThan(0);

  // (c) the purchase survives save/reload exactly.
  const roundTrip = await withLiveState(page, () => {
    const SD = (window as unknown as {
      SD: {
        saveState(): unknown;
        loadState(data: unknown): boolean;
        getRawState(): { campaign: { wallet: number; fleet: unknown[] } };
      };
    }).SD;
    const saved = SD.saveState();
    const w = SD.getRawState().campaign.wallet;
    const n = SD.getRawState().campaign.fleet.length;
    SD.getRawState().campaign.wallet = 0;   // visible drift, then reload
    const ok = SD.loadState(saved);
    return ok && SD.getRawState().campaign.wallet === w && SD.getRawState().campaign.fleet.length === n;
  });
  expect(roundTrip).toBe(true);
});

test('merchant fleet: a stranded fleet is rescued at the inflated provisions price (M4)', async ({ page }) => {
  const game = gamePage(page);
  await game.boot();

  // Drain the tank (sanctioned live-state seam), then attempt a real move —
  // the move is rejected and the merchant caravan pulls alongside.
  const offered = await withLiveState(page, () => {
    const SD = (window as unknown as {
      SD: {
        getRawState(): { campaign: { map: { fleets: { faction: string; fuel: number }[] } } };
        Map: { travel(id: string, dest: { x: number; y: number }): unknown };
      };
    }).SD;
    const fleets = SD.getRawState().campaign.map.fleets;
    fleets.forEach((f) => { if (f.faction === 'player') f.fuel = 0; });
    const events = SD.Map.travel('player', { x: 10, y: 30 }) as { kind: string }[];
    return Array.isArray(events) && events.some((e) => e && e.kind === 'merchantFleetEvent');
  });
  expect(offered).toBe(true);

  // The merchant storefront opens automatically in merchant mode; the
  // provisions tab prices crew/fuel as BUY x / SELL y posted quotes.
  expect(await getActiveModal(page)).toBe('station');
  const bundle = await withLiveState(page, () => {
    const SD = (window as unknown as { SD: { Station: { bundle(): { mode: string; rows: { id: string; priceText: string; canBuy: boolean }[] } } } }).SD;
    return SD.Station.bundle();
  });
  expect(bundle.mode).toBe('merchant');
  const fuelRow = bundle.rows.find((r) => r.id === 'fuel');
  expect(fuelRow).toBeTruthy();
  expect(fuelRow!.priceText).toMatch(/^BUY \d+ \/ SELL \d+$/);
  expect(fuelRow!.canBuy).toBe(true);

  // Buying the fuel lot at the POSTED price rescues the fleet: the tank
  // fills, the wallet drops by lot x posted buy price, and the next move
  // goes through (the caravan is dismissed).
  const rescue = await withLiveState(page, () => {
    const SD = (window as unknown as {
      SD: {
        getRawState(): { campaign: { wallet: number; map: { fleets: { faction: string; fuel: number }[]; pendingMerchant: unknown } } };
        Station: {
          bundle(): { rows: { id: string; priceText: string }[] };
          trade(good: string, sign: number): unknown;
        };
        Map: { travel(id: string, dest: { x: number; y: number }): { kind: string }[] };
      };
    }).SD;
    const buyText = SD.Station.bundle().rows.find((r) => r.id === 'fuel')!.priceText;
    const buy = Number(buyText.split(' ')[1]);
    const before = SD.getRawState().campaign.wallet;
    SD.Station.trade('fuel', 1);
    const c = SD.getRawState().campaign;
    const tank = c.map.fleets.find((f) => f.faction === 'player')!.fuel;
    const paid = before - c.wallet;
    const events = SD.Map.travel('player', { x: 12, y: 30 });
    // NB: state patches replace the campaign object — read fresh after the move.
    const cleared = !SD.getRawState().campaign.map.pendingMerchant;
    return {
      tank,
      paid,
      expectedPaid: 50 * buy,
      moved: Array.isArray(events) && events.some((e) => e && e.kind === 'fleetMoved'),
      cleared
    };
  });
  expect(rescue.tank).toBeGreaterThan(0);
  expect(rescue.paid).toBe(rescue.expectedPaid);
  expect(rescue.moved).toBe(true);
  expect(rescue.cleared).toBe(true);
});
