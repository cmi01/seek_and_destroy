# REMEDIATION_CONTRACTS.md — frozen shapes for the Wave-2 remediation streams

**Status: FROZEN** (Phase 0, card `t_08a1f3fe`, Nov 2026, branch `remed/baseline`).

This document is the single contract every remediation stream codes against. The
68-violation compliance audit is remediated by parallel streams
**W-S / W-A / W-B / W-C / W-D / W-E / W-F / W-G / W-DATA / W-T**; this file is the
ONLY serialization point. Once frozen:

- Streams **never renegotiate signatures with each other**. If a call site and a
  producer disagree, this document wins.
- A shape change requires a Phase-0 follow-up card that patches this file and
  re-announces it on the board. No stream may unilaterally extend a frozen type.
- Call sites are written **against the frozen shapes below**, even when the other
  side has not landed yet (W-S provides transitional adapters; see Addendum A).

Line references (`main.js:354` etc.) are against the `remed/baseline` commit and
are anchors for the migrating stream, not part of the contract.

---

## 0. Decision register (pre-decided in Phase 0)

| # | Decision | Outcome |
|---|----------|---------|
| **D1** | C5 composer collapse vs. per-behavior file split | **Argument dispatch** `family({op, ...args})`. Least churn, keeps op names for a later reversible split. |
| **D2** | AI sensor mask vs. omniscient AI | **Sensor mask at snapshot build** (C7). DESIGN.md fog/stealth rules (§2.2, §2.3, §2.6, §2.7) make visibility mechanical, so the design does NOT intend an omniscient AI — masking is the faithful reading, not a deviation. No sensor grant. |
| **D3** | Text metrics: builder-side vs. executor-side truncation | **`metrics` map threaded into builders** (C2a). Pure and deterministic; the executor renders text literally. |

---

## C1 — Action protocol

Every game action is one pure function:

```js
ActionFn(state, args, now, rng) -> { state, events }
```

```js
/** @typedef {{ state: GameState, events: GameEvent[] }} ActionResult */

/**
 * @typedef {{ type: "animation", kind: string, payload: Object }} AnimationEvent
 * @typedef {{ type: "audio", cmd: AudioCommandDTO }}               AudioEvent
 * @typedef {{ type: "fx",        kind: string, payload: Object }}   FxEvent
 * @typedef {{ type: "ui",        kind: string, payload: Object }}   UiEvent
 * @typedef {AnimationEvent | AudioEvent | FxEvent | UiEvent} GameEvent
 */
```

Rules (all enforced by `invariant_gate.js`):

1. **Arguments:**
   - `state` — the current frozen-ready game state. Read-only. Never mutated.
     Writes are returned as a **new** `state` (structural sharing allowed).
   - `args` — plain object of action arguments. Read-only.
   - `now` — `number`, monotonic game-clock ms supplied by `main.js`'s loop.
     Actions NEVER read `performance.now()`, `Date.now()` or any other clock.
   - `rng` — `() => number in [0,1)`, the seeded generator (mulberry32) owned by
     the main.js state container (`rngSeed`). Actions NEVER read `Math.random()`.
     Call order must be a deterministic function of `(state, args)`.
2. **Events, not side effects.** DOM, Web Audio, storage, scheduling, logging —
   everything observable leaves through `events`. An action that needs sound
   returns `AudioEvent`s (one per `AudioCommandDTO`, via the mechanical map
   `cmds.map(cmd => ({ type: "audio", cmd }))`).
3. **`main.js` owns `apply(result)`.** `apply({ state, events })` replaces the
   container state (deep-frozen at receipt) and dispatches each event to its
   effect driver by `event.type`: `animation`/`fx` → draw/vfx driver, `audio` →
   audio driver (C3), `ui` → host-bridge UI effects. Nothing else writes state.
4. Actions are **synchronous**. Async work (asset loads, boot) lives in
   main.js/W-S, never in an action.

## C2 — Draw-command lists

Builders return data; only the main.js draw executor touches the canvas.

```js
/**
 * DrawCmd — EXACTLY these 7 ops; an unknown op is a hard error in the executor.
 *
 * { op: "rect",  x, y, w, h, fill?, stroke?, lineWidth?, radius?, alpha? }
 * { op: "text",  text, x, y, font, fill, align?, baseline?, maxWidth?, ellipsis? }
 * { op: "path",  points: [{x,y}, ...], close?, fill?, stroke?, lineWidth?, alpha? }
 * { op: "arc",   cx, cy, r, start, end, ccw?, fill?, stroke?, lineWidth?, alpha? }
 * { op: "image", sprite: <spriteKey>, dx, dy, dw?, dh?, sx?, sy?, sw?, sh?, alpha? }
 * { op: "clip",  shape: <rect|path|arc DrawCmd>, children: DrawCmd[] }
 * { op: "group", children: DrawCmd[], alpha?, translate?: {x, y} }
 *
 * Frame = { layers: {
 *   board:   DrawCmd[],  // terrain, grid, fog
 *   objects: DrawCmd[],  // units, asteroids, projectiles
 *   vfx:     DrawCmd[],  // animations, explosions, projectiles-in-flight
 *   ui:      DrawCmd[],  // HUD (screen space)
 * } }
 */
```

- **Paint order is fixed:** `board → objects → vfx → ui`.
- Layer builders are pure per C4/C5 (`build*Layer(model, metrics, ...) ->
  DrawCmd[]`); the composed `Frame` is returned by `graphics({op:"render",...})`.
- Sprite atlas access (`spriteKey/spriteGet/blitSprite/drawUnit*`) moves inside
  the draw executor (`executeDrawList(cmds)` in main.js, W-S). Builders reference
  sprites **by key only**; they never see the atlas or a `ctx`.
- `clip` restores state after `children`; `group` is a pure transform/alpha scope.

### C2a (D3) — text metrics

```js
/**
 * TextMetrics — frozen map built ONCE at boot by main.js from ctx.measureText,
 * then threaded as a value into every builder that emits text ops:
 *   { [fontSpec]: { measure(text) -> pxWidth, height: number } }
 */
```

- Truncation/ellipsis/wrap decisions happen **in the builder** using `metrics`
  (e.g. `_fitTextToWidth` moves into the builder that needs it).
- The executor renders the `text` string **literally** — no executor-side
  truncation, no `measureText` calls at render time.
- `metrics` is deterministic for the whole session (captured once, frozen via
  `_freezeTree`), so draw lists are reproducible offscreen.

## C3 — Audio commands

Reuse the `sanitizeCommand` DTO from `audioInterface.js` verbatim; its output
shape IS the frozen DTO:

```js
/**
 * AudioCommandDTO = {
 *   type:     string,        // command name: "play" | "stop" | "music" | "unlock"
 *                            //   | "mute" | "gain" | "theme" | "clear" | "radio.bump" | ...
 *   kind:     string,        // clip/bus category ("sfx.shot", "music", "radio", ...)
 *   payload:  PlainObject,   // shallow-cloned per sanitizeCommand.clonePayload
 *   viewport: { viewX: number, viewY: number, viewSpan: number },
 *   gameOver: boolean,
 *   muted:    boolean,
 *   theme:    string,
 *   at?:      number         // game-clock ms; omitted = execute now
 * }
 */
```

- **Producers return `AudioCommandDTO[]`** and touch nothing: no `AudioContext`,
  no timers, no `localStorage` (W-F: `soundEngine/musicOps/sfxOps` and every
  `play*`/`dispatchEvent`/`schedule` method).
- **main.js owns the machinery** (W-S): the command queue, scheduling timers,
  `AudioContext` creation (currently `sounds.js:311-321`), gain/compressor/
  analyser graph, buffer playback (`music.js:43-61`, `sfx.js:106-150`), and the
  settings storage I/O (key `sd.audio.settings.v2`, currently `sounds.js:155/171`).
- **Scheduling = timestamped commands resolved by the driver.** A producer that
  wants a future effect sets `at` (from the threaded `now` + offset); the driver
  executes due commands. Producers never own a clock or a timer.
- Radio state is a command, not producer state:
  `bumpRadioUntil` → `{ type: "audio", cmd: { type: "radio.bump", kind: "radio",
  payload: { until }, ... } }` with `now` threaded (C1). (W-F's
  `{type:"audio", cmd:{kind:"radio.bump", until}}` sketch normalizes to this.)

## C4 — Binding convention (every child file)

```js
const <jobName> = (() => {
  // ...private helpers, private constants...
  return theOneFunction;   // exactly ONE value leaves this file
})();
```

- **Exactly one top-level `const` per child file** = the file's job binding,
  named in camelCase after the job (`hud`, `gameState`, `boardQueries`,
  `soundEngine`, `buildBackgroundLayer`, ...). Everything else is IIFE-private.
- The exported value is a function. If it dispatches ops, it is a C5 family.
- No `globalThis.*` publishes, no registrar/`_register` handshakes (retired at
  v105): **parents capture children by name at composition**; load order (C8)
  guarantees the child binding exists.
- VM probe gate for every touched file: exactly **1** top-level binding.

## C5 — Composer collapse (D1)

Every module that today exposes an object dictionary of members collapses to one
argument-dispatch function:

```js
family({ op: "<memberName>", ...args }) -> plainData
```

- `op` is a string discriminator; member names are kept verbatim as `op` values
  so call-site rewrites are mechanical and a later per-behavior split stays
  reversible. Dispatch is a `switch (op)` inside the C4 IIFE.
- **Returns plain data only** — JSON-serializable: no functions, no closures, no
  DOM nodes, no class instances. Frozen C6 tables may be returned by reference
  (they are immutable); never mutate anything you were handed.
- Applies to: `gameState`, `rulesConfig`, `boardQueries`, `actionLegality`,
  `cameraMath`, `combatMath`, `visionQueries`, `themes`, `sectorGenerator`,
  `selectionQueries` (W-B), `hud` (W-C), `graphics`/`graphicsTests` (W-E),
  `soundEngine`/`musicOps`/`sfxOps` (W-F), `game` (W-A), the game.js forwarders
  `MathGrid`/`Visibility`/`Selection` (W-B call sites).
- **Do NOT split per-behavior files yet** (D1). One dispatcher per module.

## C6 — Data files

Every `*_DATA.js` file exposes **one function returning the table** (C4 applies).
Frozen wrapper shape (matches the W-DATA cards verbatim):

```js
// in <name>_DATA.js — the C4 single top-level const IS the getter:
const <name>Data = (() => {
  const T = { ...plain table... };        // built once at parse
  return function get<Name>Data() { return T; };
})();

// main.js, at boot, exactly once:
const <NAME>_DATA = _freezeTree(<name>Data());
```

- `main.js` calls each builder **once at boot**, deep-freezes via `_freezeTree`
  (currently `main.js:354`), and **threads the frozen table as arguments** to the
  consumers that need it. Consumers never re-read it from a global and never
  recompute it.
- Data files read nothing: no state, no clock, no DOM, no `rng`. Same output
  every call; the table is plain JSON-shaped data.
- In scope: `aiPriorities_DATA.js`, `themes_DATA.js`, and every config table
  currently threaded as module constants in game.js (`GRID_SIZE`, `SPAWN_RADIUS`,
  `MAX_AP`, `ENEMY_ACTION_INTERVAL_MS`, `DIFFICULTY(_TABLE)`, `SHIP_SPECS`,
  `CAMPAIGN_LEVELS` — game.js:73-80).

## C7 — AI sensor mask (D2)

The AI snapshot carries **masked** data only:

```js
AiSnapshot = {
  myUnits:         UnitView[],      // own faction units
  spottedEnemies:  UnitView[],      // enemies visible under own + allied shared
                                    //   sensor vision (DESIGN.md §2.7)
  lastSeenEnemies: MaskedMemory[],  // memory only: last known pos/heading/class
  reservations:    Reservation[],   // masked memory: own planned cells
  // ... turn/AP/context fields unchanged.
  // NO raw `units` array. NO unspotted enemy truth anywhere in the snapshot.
}
```

- **Filter at snapshot build** (`AI._snapshot`, game.js:1490-1533, W-A).
- Known leak sites that must stop reading unspotted units (W-A + AI subtree):
  `aiThreatScorer.js:138,249`; `listReachableCells.js:14`; `rankMoveTargets.js:14`;
  `computeUpdatedReservations.js:18-34`; `aiBeliefMemory.js:18`.
- **DESIGN.md disposition (recorded per Phase-0 instruction):** DESIGN.md
  §2.2 ("only **spotted** targets can be attacked", attacks into fog forbidden),
  §2.3 (blind-asteroid hazard), §2.6 (board only a **spotted** enemy) and
  §2.7 (nebula stealth: "only visible to enemies at d ≤ 1") make visibility a
  core mechanic. An omniscient AI would nullify stealth and fog. Therefore the
  design does **not** intend omniscience: **D2 stands as the faithful reading** —
  no explicit sensor grant is introduced.
- **Named regression test `aiSensorMask`** (game suites): asserts the snapshot
  excludes unspotted enemies, `lastSeenEnemies`/`reservations` carry no live
  enemy truth, and each leak site above reads only masked fields.

## C8 — Loader ownership

`main.js` is the **sole script loader**.

- One `LOAD_MANIFEST` (phased sub-lists OK) holds **every script path exactly
  once** — absorbing the child lists currently living in `game.js:1830-1885`
  (25 direct children), `graphics.js:10-20` and `sounds.js`'s loader. A dedupe
  check (each path appears exactly once) is part of the gate.
- `_verifyLoaded` verifies **only main.js's direct children's bindings**:
  `Game`, `Graphics`, `SoundEngine`, `Inputs`, `createInputInterface`,
  `createGraphicsInterface`, `createAudioInterface` (7). The deep grandchild
  tables (`main.js:444-567`) are **deleted**. (After C9's fold lands, W-G,
  `createInputInterface` no longer exists and the verified set is the remaining
  6 names — W-S and W-G agree the final list at wiring time; no other change.)
- **Parents capture children by name** at composition (v105 convention). A
  missing grandchild surfaces as a `ReferenceError` during composition, caught
  at boot and reported via `reportBootFailure(err)` — never a silent degrade.
- Optional-script semantics (`optionalSet`) survive for genuinely optional
  capabilities only; nothing in the game core is optional.

## C9 — Input interface

- **`inputInterface.js` is folded into `inputs.js`** (file deleted) as pure
  translation. inputs.js exposes exactly one binding (C4):

  ```js
  inputEvent(raw, geometry) -> InputEventDTO[]
  ```

  `raw` = the DOM event's projected plain fields, `geometry` = canvas/viewport
  geometry values; returns 0..n DTOs (the array form is frozen here; a raw event
  that maps to nothing returns `[]`). `getNormCoords` math and the
  `e.key/code/repeat` mapping stay as IIFE-private helpers. The frozen DTO is
  the current `sanitizeEvent` shape, byte-compatible:

  ```js
  InputEventDTO = { type, u, v, inside, button, shiftKey, deltaY, key, code, repeat }
  ```

- **DOM listeners move out of inputs.js** into the main.js input driver (W-S),
  which emits the translated DTOs into the channel. `inputs.js` holds no state,
  no listeners, no `AbortController`.
- **`graphicsInterface` and `audioInterface` remain one pure boundary fn each**,
  with all queues held by main.js (W-G):
  - `audioInterface` → `sanitizeCommand(cmd) -> AudioCommandDTO | null` (its DTO
    IS C3; `clonePayload` stays private).
  - `graphicsInterface` → `sanitizeFrame(frame) -> Frame` (C2 shape;
    `cloneData`/`sanitizeStaticConfig` become private helpers).
  - The queues (`_queue`, `_staticConfig`/`_latestFrame`) move to main.js-held
    objects; producer/consumer pairs are constructed in main.js (W-S task 5).

---

## Addendum A — Wave/ownership map

### game.js region ownership (2,368 ln at `remed/baseline`)

| Lines | Owner | Contents |
|---|---|---|
| 1–858 | **W-A** | Game IIFE state, GameAudio, composers, Actions — EXCEPT the W-B band below |
| 260–373 | **W-B** | forwarders `MathGrid`@260, `Visibility`@301, `Selection`@341 (carved out of W-A's band) |
| 859–905 | **W-C** | `Hud` forwarder block |
| 906–2368 | **W-A** | `InputProcessor`@906, `AI`@1490, `SectorGenerator`@1656, loaders, `api`@1821+ |

Overlap rules (both cards agree; stated once here):

- W-B's scripted call-site rewrites may touch W-A-owned regions at its forwarder
  map only (`Actions`@450-754 call sites, `SectorGenerator`@1656-1716, config/
  theme/state reads). **W-A owns all mutations there**; W-B rewrites call sites
  only, against the frozen C5 shapes.
- W-C's hud.js work is file-local except the 859-905 forwarder block it owns.
- **W-DATA holds a one-call-site exception in main.js:469-470** (the
  `__sndAiPublished` capture → replaced with `aiPrioritiesData()` +
  `_freezeTree`), granted by its card. Every other main.js line remains W-S's.

### Parallelism rule

**Call sites are written against the frozen shapes in this document, not against
what the other stream has landed.** A stream that needs `game({op:"runTest"})`
writes that call even if W-A has not landed the dispatcher yet; W-S's transitional
adapters (W-S task 6) keep the tree bootable until integration. No stream blocks
on another stream's merge. Integration ordering: **W-S merges first**, remaining
streams rebase on it; adapters are deleted by the integration card.

---

## Addendum B — stream → contract dependency map

| Stream | Scope | Contracts needed |
|---|---|---|
| **W-S** | main.js shell: state container, effect drivers, sole loader | C1, C2, C3, C4, C6, C8, C9 |
| **W-A** | game.js core: state extraction, actions, api collapse, AI mask | C1, C2, C3, C5, C6, C7, C8 |
| **W-B** | query/composer children + game.js forwarders (260-373) | C4, C5 |
| **W-C** | hud.js entry + game.js forwarders (859-905) | C4, C5 |
| **W-E** | graphics subtree: layer registry removal, draw-list conversion | C2, C2a, C4, C5 |
| **W-F** | audio subtree: command DTOs, state/IO to main.js | C3, C4, C5 |
| **W-G** | interfaces & input: pure boundary fns, listeners to main.js | C1, C3, C9 |
| **W-DATA** | data-file wrapping (`*_DATA.js` getters, registry side effect removal) | **C4, C6 only — started immediately** |
| **W-D** | AI subtree leaked-helper wrapping (pure structural) | **C4 only — started immediately** |
| **W-T** | test surface + `invariant_gate.js` (codifies this contract set as executable CI) | **C4/C5 only — started immediately** (its gate validates C1–C9 for everyone) |

The three contract-light streams (W-DATA/W-D/W-T) need only C4/C6 (or less) and
were already running against the pre-decided shapes; this document freezes what
they assumed. Everything else waits for nothing: the shapes above are sufficient
to write any call site or producer before the other side lands.
