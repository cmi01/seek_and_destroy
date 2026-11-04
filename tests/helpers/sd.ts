// sd.ts — typed pure wrappers over the game's window.SD debug handle
// (test-architecture doc §2, §6). Contract: (page, …args) → plain data via page.evaluate;
// no module-level state, no side effects on the game beyond what the named call
// documents. Specs assert on the data returned here — never on canvas pixels.
// Units/flags are projected to plain JSON (Sets → arrays) so every helper
// returns structured-clone-safe data. Anything that mutates the game does so
// through the game's own SD.Actions / SD.SectorGenerator entry points.
import type { Page } from '@playwright/test';

/** Plain-data unit projection (the live record carries a flags Set). */
export type SdUnit = {
  id: number;
  type: string;
  team: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  move: number;
  /** M5: seam-derived from the unit's loadout (SD.Outfitting), not a unit field. */
  firepower: number;
  range: number;
  loadout: string[];
  scan: number;
  cost: number;
  flags: string[];
};

/** Canvas button rect from the Hud view-model (displaySize px space). */
export type SdButton = {
  id: string;
  label: string;
  enabled: boolean;
  active: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** The projection of SD.getRawState() the suite asserts on. */
export type SdRawState = {
  gameOver: boolean;
  activeTeam: number;
  turnNumber: number;
  ap: number;
  credits: { [k: string]: number };
  income: { [k: string]: number };
  rngSeed: number | null;
  levelId: number;
  units: SdUnit[];
  battleReserve: Array<{ hull: string }>;
  completedLevels: number[];
  campaign: unknown;
  viewSpan: number;
  viewX: number;
  viewY: number;
  zoomAnim: { active: boolean; toSpan: number; fromSpan: number; duration: number };
  canvasButtons: SdButton[];
  selectedUnitId: number | null;
  audioSettings: unknown;
  aiTimers: number;
  audioTimers: number;
};

/** Live canvas geometry computed at boot (SD.LayoutMetrics). */
export type SdLayoutMetrics = {
  devicePx: number;
  cellPx: number;
  renderScale: number;
  displaySize: number;
};

/** One self-test result ({name, pass, detail}) from the in-page suites. */
export type SdTestResult = { name: string; pass: boolean; detail: string };

/** True once the full script tree booted and exposeDebugHandle() ran. */
export function isBooted(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const s = (window as unknown as { SD?: unknown }).SD;
    return typeof s === 'object' && s !== null;
  });
}

/** SD.getRawState() projected to plain JSON (Sets → arrays). */
export function getRawState(page: Page): Promise<SdRawState> {
  return page.evaluate(() => {
    const st = (window as any).SD.getRawState();
    return {
      gameOver: st.gameOver,
      activeTeam: st.activeTeam,
      turnNumber: st.turnNumber,
      ap: st.ap,
      credits: { 1: st.credits[1], 2: st.credits[2] },
      income: { 1: st.income[1], 2: st.income[2] },
      rngSeed: st.rngSeed,
      levelId: st.levelId,
      units: st.units.map((u: any) => ({
        id: u.id, type: u.type, team: u.team, x: u.x, y: u.y,
        hp: u.hp, maxHp: u.maxHp, move: u.move,
        firepower: (window as any).SD.Outfitting.fpOf(u),
        range: (window as any).SD.Outfitting.rngOf(u),
        loadout: Array.from((u.loadout || []) as string[]),
        scan: u.scan, cost: u.cost,
        flags: Array.from(u.flags as Set<string>),
      })),
      battleReserve: (st.battleReserve || []).map((e: any) => ({ hull: e.hull })),
      completedLevels: Array.from(st.completedLevels as Set<number>),
      campaign: st.campaign ? JSON.parse(JSON.stringify(st.campaign)) : null,
      viewSpan: st.viewSpan,
      viewX: st.viewX,
      viewY: st.viewY,
      zoomAnim: { active: st.zoomAnim.active, toSpan: st.zoomAnim.toSpan, fromSpan: st.zoomAnim.fromSpan, duration: st.zoomAnim.duration },
      canvasButtons: (st.canvasButtons || []).map((b: any) => ({
        id: b.id, label: b.label, enabled: b.enabled, active: b.active,
        x: b.x, y: b.y, w: b.w, h: b.h,
      })),
      selectedUnitId: st.selectedUnitId,
      audioSettings: st.audioSettings ? JSON.parse(JSON.stringify(st.audioSettings)) : null,
      aiTimers: (st.aiTimers || []).length,
      audioTimers: (st.audioTimers || []).length,
    } as SdRawState;
  });
}

/** SD.LayoutMetrics — live canvas geometry (devicePx pins canvas size assertions). */
export function getLayoutMetrics(page: Page): Promise<SdLayoutMetrics> {
  return page.evaluate(() => {
    const m = (window as any).SD.LayoutMetrics;
    return {
      devicePx: m.devicePx,
      cellPx: m.cellPx,
      renderScale: m.renderScale,
      displaySize: m.displaySize,
    } as SdLayoutMetrics;
  });
}

/** SD.Hud.isModalOpen() — modal / deploy overlay state (Hud view-model). */
export function isModalOpen(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as any).SD.Hud.isModalOpen()));
}

/** SD.Hud.getActiveModal() — 'deploy' | 'endgame' | 'bridge' | 'campaign' | 'help' | null. */
export function getActiveModal(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as any).SD.Hud.getActiveModal());
}

/** SD.Hud.isMenuOpen() — the HUD dropdown menu state. */
export function isMenuOpen(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as any).SD.Hud.isMenuOpen()));
}

/** SD.setSeed(n) — mulberry32 seeding of sector generation (game.js). */
export async function setSeed(page: Page, seed: number): Promise<void> {
  await page.evaluate((n) => { (window as any).SD.setSeed(n); }, seed);
}

/** SD.clearSeed() — back to unseeded Math.random generation. */
export async function clearSeed(page: Page): Promise<void> {
  await page.evaluate(() => { (window as any).SD.clearSeed(); });
}

/** SD.SectorGenerator.generate(levelId, opts) — regenerate the current sector. */
export async function generateSector(page: Page, levelId: number, opts: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate(
    ([id, o]) => { (window as any).SD.SectorGenerator.generate(id as number, o as Record<string, unknown>); },
    [levelId, opts] as [number, Record<string, unknown>],
  );
}

/** SD.getTheme() — active theme id. */
export function getTheme(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).SD.getTheme() as string);
}

/** SD.saveState() — JSON-safe snapshot ({schema, version, state}). */
export function saveState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => (window as any).SD.saveState());
}

/** SD.loadState(data) — restore a snapshot; returns whether it was accepted. */
export function loadState(page: Page, data: Record<string, unknown>): Promise<boolean> {
  return page.evaluate((d) => Boolean((window as any).SD.loadState(d)), data);
}

/** SD.Sound.toggleMute() — flips mute and persists sd.audio.settings.v2. */
export async function toggleMute(page: Page): Promise<void> {
  await page.evaluate(() => { (window as any).SD.Sound.toggleMute(); });
}

/** Raw localStorage payload for sd.audio.settings.v2 (null when unset). */
export function getAudioStorage(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('sd.audio.settings.v2'));
}

/** SD.runAudioTests() — the synchronous 5-test audio self-suite. */
export function runAudioTests(page: Page): Promise<SdTestResult[]> {
  return page.evaluate(() => (window as any).SD.runAudioTests() as SdTestResult[]);
}

/**
 * SD.Harness.<name>() — one named in-page self-test (gameTests.js or
 * graphicsTests.js), loaded on demand. Resolves to that test's {name, pass,
 * detail} regardless of whether the runner returns a single result or a list.
 */
export function runHarnessTest(page: Page, name: string): Promise<SdTestResult> {
  return page.evaluate(async (n) => {
    const fn = (window as any).SD.Harness[n as string];
    const raw = await fn.call((window as any).SD.Harness);
    const one = Array.isArray(raw) ? raw[0] : raw;
    return { name: one.name, pass: Boolean(one.pass), detail: String(one.detail) };
  }, name);
}

/**
 * State surgery helper: run `body` against the live SD handle and state inside
 * ONE evaluate (live unit objects only exist inside a single call). Returns
 * whatever the body returns. The codebase audit sanctions state surgery through
 * the SD.State live handle for logic-level scenario setup. `body` must be
 * self-contained (page.evaluate serializes it — no closures over spec-scope
 * variables); pass fixture data in through the optional `arg`.
 */
export function withLiveState<T>(page: Page, body: () => T): Promise<T>;
export function withLiveState<T, A>(page: Page, body: (arg: A) => T, arg: A): Promise<T>;
export function withLiveState(page: Page, body: (...args: never[]) => unknown, arg?: unknown): Promise<unknown> {
  return arg === undefined
    ? page.evaluate(body as () => unknown)
    : page.evaluate(body as (a: unknown) => unknown, arg);
}

/** A shooter/target fixture cell pair (chosen from live terrain, see below). */
export type CellPair = { shooter: { x: number; y: number }; target: { x: number; y: number } };

/**
 * Pick a shooter/target fixture from the LIVE sector terrain: an orthogonally
 * adjacent pair of EMPTY cells, nearest to `anchor` (deterministic tie-break),
 * never containing one of `exclude`. Sector terrain is randomly generated per
 * unseeded boot and hasLineOfSight(WEAPON) correctly refuses a shot whose
 * target cell is ASTEROID (lineOfSight.js) — so a spec that gates on canShoot
 * must derive its fixture cells from State.terrain instead of hardcoding them
 * (t_2922ab3c: an asteroid at the old fixed cell (16,17) gated the shot in 1/25
 * boots). Both cells EMPTY + orthogonally adjacent keeps every gate condition
 * terrain-independent: no intermediate ray cells, distance 1 ≤ any weapon
 * range, and the shooter's scan (≥ 1 even under NEBULA) covers the adjacent
 * target cell. Throws when terrain is not generated yet or no pair exists.
 */
export function pickEmptyAdjacentPair(
  page: Page,
  anchor: { x: number; y: number },
  exclude: Array<{ x: number; y: number }> = [],
): Promise<CellPair> {
  return page.evaluate(
    ([a, ex]) => {
      const st = (window as any).SD.getRawState();
      const terr = st.terrain;
      if (!Array.isArray(terr)) {
        throw new Error('pickEmptyAdjacentPair: State.terrain missing — generate a sector first');
      }
      const size = terr.length;
      const isExcluded = (x: number, y: number) =>
        (ex as Array<{ x: number; y: number }>).some((e) => e.x === x && e.y === y);
      const cands: CellPair[] = [];
      for (let x = 0; x < size - 1; x++) {
        for (let y = 0; y < size; y++) {
          if (terr[x][y] !== 'EMPTY' || terr[x + 1][y] !== 'EMPTY') continue;
          if (isExcluded(x, y) || isExcluded(x + 1, y)) continue;
          cands.push({ shooter: { x, y }, target: { x: x + 1, y } });
          if (terr[x][y + 1] === 'EMPTY' && y + 1 < size && !isExcluded(x, y + 1)) {
            cands.push({ shooter: { x, y }, target: { x, y: y + 1 } });
          }
        }
      }
      const anchorPt = a as { x: number; y: number };
      const dist = (c: { x: number; y: number }) => Math.hypot(c.x - anchorPt.x, c.y - anchorPt.y);
      cands.sort(
        (p, q) =>
          dist(p.shooter) - dist(q.shooter) ||
          dist(p.target) - dist(q.target) ||
          p.target.x - q.target.x ||
          p.target.y - q.target.y,
      );
      if (!cands.length) throw new Error('pickEmptyAdjacentPair: no EMPTY adjacent cell pair on the board');
      return cands[0];
    },
    [anchor, exclude] as [{ x: number; y: number }, Array<{ x: number; y: number }>],
  );
}
