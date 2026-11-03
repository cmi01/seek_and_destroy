---
title: Seek & Destroy — Architecture Compliance
version: v99.1
date: 2026-11-03
owner: default
status: structural compliance standard
---

# Seek & Destroy — Architecture Compliance

Status: the structural compliance standard for every file in the repository.
Scope: **structure only**. What the game does lives in `docs/DESIGN.md`; why the
architecture looks the way it does lives in `docs/GUIDING_PRINCIPLES.md`. Where
this document and `GUIDING_PRINCIPLES.md` disagree about structure, **this document
wins**.

Requirements clarification (post-v91): **every file except `main.js` is exactly
one pure function** — cores, data files, tests and interfaces included. State
and every effect live in `main.js`. References flow **only from parent to
child** (call edges): a child never references its parent. Appendix A is
re-baselined against this bar below, and the folder tree mirrors the ownership
tree (§5).

Three rules carry the standard:

1. **Every file except `main.js` is exactly one pure function — and `main.js`
   is the ONLY file that may hold anything between calls.**
2. **A file is not a library.**
3. **A complex data-object builder decomposes into per-domain pure children.**

Everything else in this document defines those rules, states the compliance tests,
and records how compliance is measured.

---

## 1. One File, One Pure Function

Every file except `main.js` is **exactly one pure function** — the file's job —
plus the private helpers that function alone needs. Data in, plain data out; no
state, no effects, no globals, no registration calls. The precise contracts —
module form, banned internals, data crossing rules, naming — are in §8.

- **`main.js` is the single exception — the imperative shell.** It loads every
  file and wires the call graph; it owns the state container and the hardware
  (canvas context, audio context, input listeners, timers, storage); it
  performs every effect (drawing, playback, I/O) using the plain data the
  functions compute. Nothing imperative exists anywhere else.
- **State lives only in `main.js`.** Game logic computes transitions as pure
  values (`state → state`, or `state → {state, events}`) and `main.js` applies
  them. **State means any value held between calls** — mutable or not:
  module-level variables, computed module constants, lazy caches, memoized
  tables. Nothing is held outside `main.js`; even the frozen data tables are
  obtained by `main.js` calling the data files' functions once at load, and
  held by the shell. No other file holds, mutates, or aliases state.
- **Data files are one pure function returning their frozen table** — the
  table is the function's return value, frozen at receipt by its caller.
- **Tests are one pure function each** (`state → results`). The state-mutating
  test bridge is retired; `main.js`'s test entry runs them.
- **Interfaces are one pure function each** — the boundary's translation or
  validation of a plain-data payload. The four system domains (Inputs, Game,
  Graphics, Audio) remain as responsibilities, not as stateful entities.
- **The job is stated in one sentence in the file's header comment**, immediately
  after the filename, and it names that one function. A file without a job
  sentence is non-compliant.
- **The filename states the job.** The name identifies the single function's
  action (a file whose function is `reachableCells` is named for reaching cells,
  not `positionQueries`). A name that would need "and" — or that spans several
  functions — means the file has several jobs; split it.
- **The surface is exactly one function.** A second exposed function is a second
  job, whatever the two functions happen to share. If several behaviors share a
  domain, either give each behavior its own file or collapse the domain to one
  entry function whose behavior is selected by arguments — never two exports.
- **Private helpers are allowed** and stay private. The moment a helper serves a
  second job, that job belongs to its own single-function file.
- **Composers compose; they do not accumulate.** A composition function (a
  builder, a planner) is itself the file's one function; it calls its children's
  functions and assembles their plain-data returns.

### The job tests

A file is single-job when all three hold:

1. **Sentence test** — its job fits one sentence naming one function, without
   joining unrelated duties with "and".
2. **Name test** — the name says what that sentence says.
3. **Edge test** — the file's parent references it only for that one function.
   A second function, or a second reason to reach in, is a library wearing a
   job's name — split it.

## 2. A File Is Not a Library

A file is a **unit of work**, not a bag of helpers.

- **Banned shapes:** `utils.js`, `helpers.js`, `common.js`, `shared.js`, `misc.js`
  — and any file whose surface is more than one function. Convenience grouping
  is the failure mode, not an exception.
- **A file of pure predicates can still be a library.** Twenty queries in one
  export list is a library no matter how pure each function is. One function
  per file; group by job, not by "these are all rules".
- **Allowed aggregation:** one function often needs several small private
  helpers. Helpers that serve only the file's own function are fine and stay
  private.

## 3. Complex Data-Object Builders Decompose Into Per-Domain Children

When a function's job is to **convert inputs into a complex data object** (a
render frame, an AI plan, a HUD model, a market snapshot), the builder may **not**
construct that object in one monolithic body. It must **call children, one per
domain of the processing**, and its own body only composes their results.

- **A domain of the processing** is one independently changing part of the
  transformation — a slice that changes for its own reasons and can be tested on
  its own (for a render frame: board geometry, unit presentation, HUD model,
  overlay model, cursor/presentation decisions, audio cue derivation).
- **One child per domain, one function per child.** Each child receives only what
  its domain needs (passed in by the composer) and returns exactly its slice of
  the data object as plain data, through its single function.
- **The composer's assembly is trivial.** Assigning the children's slices into
  the final object is its whole logic. If assembly needs real logic, that logic
  is itself a domain and gets its own child.
- **The rule recurses.** If a domain child's job is itself a complex transform,
  it decomposes further. The recursion stops at leaves that each do one job.
- **Split signals** (any one means "split"):
  - the function body has sections that change for different reasons;
  - two parts of the output would be tested separately;
  - the object literal being returned has groups of fields assembled by
    unrelated code paths;
  - different consumers read unrelated slices of the output (that is two jobs
    wearing one object).

### Worked example (compliant)

```
main.js (imperative shell: state, hardware, effects, loader)
 └── buildFrame (one pure function: game state → render frame)
      ├── buildBoardSlice    (board geometry + terrain cells → slice)
      ├── buildUnitSlice     (units + flags + effects → slice)
      ├── buildOverlaySlice  (damage numbers, badges, highlights → slice)
      ├── buildCursorSlice   (hover/press state → cursor slice)
      └── buildStatusSlice   (level/turn/ap/credits → status slice)
```

Each node is one sentence, one name, one function, one call edge.
`buildFrame` composes five plain slices.

### Counter-example (non-compliant)

One `buildFrame(state)` function of 400 lines that computes board cells, unit
sprites and damage numbers inline, in a file that also exports `formatTelemetry()`
and `clampFont()`, and caches results in a module variable. Four violations at
once: multi-function file, library surface, undecomposed builder, held state.

## 4. References and Edges

References flow **one way: composer → child** (the call edge). `main.js` sits at
the root and may reference everything, because it loads and wires everything.

- **A file references only the pure functions it calls** — its own children in
  the composition tree — and only ever for their one function.
- **A child never references its parent** — not its name, not a registration
  channel, nothing. The load-time registrar handshake (`X._register`) is
  **retired**: files contain no registration call, no loader code, and touch no
  globals. Loading is `main.js`'s act; a file is just its function.
- **Siblings never reference each other.** The composer passes one child's
  output to the next as plain data.
- **Files know only their own children.** A file that reaches for anything else
  — to read it, call it, or name it in a comment — is non-compliant. (A
  filename in a comment is still a reference.)
- **No state, no effects outside `main.js`.** Drawing, playback, listeners,
  timers, storage and loading are effects; computing their plain-data payloads
  is not.
- Data files are referenced only by their owner (the function that calls their
  table function). No circular dependencies. Presentation decisions are data;
  `main.js` renders exactly what it is given.

## 5. File and Folder Layout

The folder tree **is** the ownership tree: every file lives in its parent's
children folder, and the folder names are literal.

```
root/
  index.html
  main.js
  assets/                  (sprite/sound packs)
  dev/                     (all tooling: docs, audit scripts, deploy, serve, README)
  main.js children/        (all of main.js's direct children)
    game.js
    game.js children/      (sits NEXT TO game.js)
      buildFrame.js
      buildFrame.js children/
        buildBoardSlice.js
        ...
    graphics.js
    graphics.js children/
      ...
```

- **Root holds exactly** `index.html`, `main.js`, `main.js children/`,
  `assets/` and `dev/` (plus VCS dotfiles). Nothing else.
- **All of `main.js`'s direct children live in `main.js children/`.**
- **Any file with one or more children has a folder named `<exact filename>
  children`** (e.g. `game.js children`) sitting **next to it** — in the same
  folder — holding its children. This extends downward without exception: the
  depth of the folder tree equals the depth of the call tree.
- **Folder names are literal**: the file's full name (including `.js`), one
  space, then `children` — `buildFrame.js children`.
- **Every file follows its owner**: data files and test files nest under their
  owning caller like any other child.
- **`dev/` holds all tooling** — `docs/`, audit `scripts/`, `deploy/`,
  `serve.sh`, `README.md`. **`assets/`** (root) holds the non-code asset packs.
- The layout restates §4 in path form: a file's folder location IS its parent
  declaration, so the tree can never disagree with the Owner headers.

## 6. File Header Contract

Every file begins with a header that states, in order:

1. **Filename and its single job** — one sentence naming the one function.
2. **Owner** — the composing function's file (or `wiring root` for `main.js`).
3. Nothing else is required; anything beyond the job sentence must not smuggle in
   a second responsibility.

```js
// ============================================================
// buildUnitSlice.js — job: build the render frame's unit slice.
// Owner: buildFrame.js (pure). Holds no state.
// ============================================================
```

## 7. Compliance Measurement

Two instruments, one per kind of rule.

### 7.1 Machine check (exists today)

`dev/scripts/reference_audit.py` machine-checks the encapsulation rules of §4
(direct-parent-only references, no globals). It runs clean before every release
(`--map` prints the reference graph). Structural violations it cannot see are
covered by the review gate below.

### 7.2 Review gate (every change)

Run this checklist against every touched file before calling a version done:

1. Does the header state a single job in one sentence, naming one function?
2. Does the filename state that job?
3. Does the file expose anything besides its one function? (→ collapse or split)
4. Does the file hold anything between calls (state, constants, caches — even
   immutable) or perform effects? (→ move to `main.js`)
5. Does the file build a complex data object in one function body? (→ decompose)
6. Does every private helper serve that one function only?
7. Is its parent the only referrer, and only for that function?
8. Any globals, parent/sibling references, or names of other files outside its
   own header? (→ `reference_audit.py`)
9. **Import direction:** do all of its imports/mentions point downward — only
   itself and its own descendants? Does it name its parent or a
   sibling/cousin/grandparent anywhere in its body? (→ `reference_audit.py`,
   child-names-parent and import-direction checks)
10. **UI scale:** does the diff add a numeric size literal to a renderer, a
    `Math.max(<const>` on UI geometry, a `devicePixelRatio` read outside
    `main.js`, or a rect computed in both a HUD child and the renderer?
    Shared sizes belong in `metrics.ui` (see `dev/docs/gui-scaling-strategy.md`).

### 7.3 Measurement and presumption rules

- Size and complexity are measured; the biggest and most complex files are the
  first split candidates. Concretely: a file over ~300 lines, or exposing more
  than one function, is **presumed multi-job until proven otherwise** — the
  proof is the job tests.
- `dev/scripts/structure_audit.py` machine-checks the checkable structural rules:
  the filename blocklist, the header contract (`— job:` + `Owner:`), the
  size presumptions (printed as warnings), and the **one-function-per-file**
  check (`one-function-per-file` block): every file except `main.js` exposes
  exactly one function/export; two or more is a violation. Pure-data
  `data/*_DATA.js` declarations are exempt (they are one data table, not a
  function).
  `dev/scripts/reference_audit.py` exempts declared header lines.
- **Checker additions (landed, §8.9).** `reference_audit.py` now also reports,
  in separate blocks so the legacy verdict is untouched:
  - `child-names-parent` — a child's body never names its parent file;
  - `doc-window-main-only` — `document.`/`window.` is allowed in `main.js`
    only (no core exemption; effects leave `main.js children/graphics.js`);
  - `import-direction` — references flow parent→child only: a child may name
    only itself and its own descendants, never an ancestor, sibling, cousin or
    grandparent. The §1.1 interface carve-out (`ADJACENT_CORES`) is
    sanctioned; `main.js` is the root and is exempt.
- **Baseline.** The additions are baselined against the v94 tree (commit
  `fa266dc`) in `/tmp/hermes-verify-a01/baseline.json`. That tree predates the
  one-function bar, so the new checks have non-zero counts there; no later
  change may raise them.

## 8. Mechanics and Contracts

The mechanical contracts the refactor executes against — adopted defaults
(decision 3(h)), flip-on-the-user's-word like the others.

- **8.1 Modules — load, wire, reference.** Files are ES modules: each has
  exactly one **default export** (its one function) and `import`s only its own
  children. `import` IS the parent→child edge — the one thing that counts as a
  reference. `main.js` is the entry module: it imports everything and wires the
  call graph. No globals, no registrars, no dynamic `<script>` loading.
- **8.2 Purity contract.** The file's function takes everything it needs as
  arguments and returns data. Banned outside `main.js`: closures over injected
  handles (the `deps => {…}` factory shape is retired), `Math.random` and any
  unseeded randomness, `Date.now`/timers, I/O of any kind, `console.*`, and
  mutation of arguments. Randomness and time enter as values — the seeded RNG
  state and timestamps are passed in by `main.js` (`mulberry32` is the house
  RNG). A transform that consumes randomness returns the advanced RNG state as
  part of its data — the seed threads through like any other value (rng in,
  rng out); `main.js` is what holds it between calls.
- **8.3 Plain-data contract.** Values crossing an edge may be primitives,
  plain objects, arrays, `Map`, `Set` and TypedArrays. A return value must not
  alias its inputs or anything held elsewhere — copying is the returning
  function's job. The receiver freezes what it keeps ("frozen at receipt").
- **8.4 Naming.** The function name IS the filename (`reachableCells.js` →
  `reachableCells`). Transforms are verb-first (`buildBoardSlice`,
  `applyWarpIn`, `computeSyncedMemory`). Folder names follow §5.
- **8.5 Errors and diagnostics.** Pure functions throw on invalid input;
  `main.js` contains, reports and falls back. `console.*` exists only in
  `main.js`. (This replaces the old per-call `guard()` wrappers.)
- **8.6 State schema and apply protocol.** The state container's shape is
  documented on one state-shape page under `dev/docs/` and owned by `main.js`.
  Transforms return **new** state values and never mutate the state they were
  given. `main.js` applies returned state in a defined order per tick:
  input → game transforms → frame → audio commands → effects.
- **8.7 Memoization is state.** Any cache (e.g. the banner memo cache) lives in
  `main.js` or is recomputed; a pure function cannot memoize across calls.
- **8.8 Test contract.** One test file per subject = one pure
  `state → results` function returning plain data in a fixed shape —
  `{ name, pass, detail[] }`. Tests nest under their owner (§5) and run from
  `main.js`'s test entry.
- **8.9 Checker sequencing.** The checker additions of §7.3 have landed ahead
  of the first migration version, so the refactor is machine-guarded from the
  start: the one-function-per-file check in `structure_audit.py`, and
  child-names-parent, doc-window-main-only, and import-direction in
  `reference_audit.py`. Each new check prints its own block and count so the
  legacy verdict stays traceable; the v94 baseline lives in
  `/tmp/hermes-verify-a01/baseline.json` and counts may only fall. The review
  gate (§7.2, question 9) carries the import-direction question.
- **8.10 `main.js` sectioning (soft rule).** The shell keeps named sections —
  loader/wiring, state container, effect drivers, frame loop, test entry — so
  the exempt file stays reviewable.

## 9. Document Map

| Document | Governs |
|---|---|
| `docs/DESIGN.md` | **Behavior** — what the game is and does. |
| `docs/ARCHITECTURE_COMPLIANCE.md` (this file) | **Structure** — what a file may be. |
| `docs/GUIDING_PRINCIPLES.md` | **Philosophy** — why the structure is this way. |

Conflict order for structural questions: this file → `GUIDING_PRINCIPLES.md`.
Behavior questions never resolve here; change `DESIGN.md` instead.

---

## Appendix A — Conformance snapshot (post-v91, re-baselined on the one-pure-function rule)

Where the current tree stands against the clarified bar. "1 fn" = the file
already exposes exactly one function (it still sheds its registrar/factory
shape in the sweep). "Scheduled" = planned work, not an exemption — under this
bar **every file except `main.js` is scheduled** until the re-architecture
lands; the Surface column says how far each file is from the bar.

| File | Role today | Surface today | Work needed |
|---|---|---|---|
| `main.js` | wiring root + frame loop | wiring | **exempt — imperative shell** (grows: state container, hardware, all effects, central loader) |
| `main.js children/game.js` | rules + turn flow + state executors | core | scheduled — logic becomes pure `state → state` files; state + effects → `main.js` |
| `main.js children/game.js children/gameState.js` | state-store operations | 6 fns | scheduled — pure `state → state/data` fns, one per file |
| `main.js children/inputs.js` | hardware → input events | core | scheduled — pure translate fns; listeners → `main.js` |
| `main.js children/game.js children/sectorGenerator.js` | sector/unit generation | 2 fns | scheduled |
| `main.js children/game.js children/themes.js` | theme keys and colour remaps | 5 fns + data | scheduled (surface also carries data, not only functions) |
| `main.js children/game.js children/boardQueries.js` | board geometry/terrain/occupancy | 6 fns | scheduled |
| `main.js children/game.js children/lineOfSight.js` | line-of-sight queries | `hasLineOfSight` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/visionQueries.js` | scan/visibility/spotting queries | 3 fns | scheduled |
| `main.js children/game.js children/actionLegality.js` | action legality | 4 fns | scheduled |
| `main.js children/game.js children/combatMath.js` | combat outcomes | 3 fns | scheduled |
| `main.js children/game.js children/reservePlacement.js` | reserve-entry cells | `getValidWarpCells` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/endgameStatus.js` | endgame detection | `checkEndgameStatus` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/rulesConfig.js` | tactical config values | 10 getters | scheduled |
| `main.js children/game.js children/cameraMath.js` | zoom/viewport geometry | 5 fns | scheduled |
| `main.js children/game.js children/selectionQueries.js` | selection queries | 2 fns | scheduled |
| `main.js children/game.js children/visibilityCache.js` | visibility cache | `computeVisCache` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/frameBoard.js` | board slice builder | `build` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/frameUnits.js` | unit slice builder | `build` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/frameOverlay.js` | overlay slice builder | `build` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/frameCursor.js` | cursor slice builder | `build` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/frameStatus.js` | status slice builder | `build` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/hud.js` | HUD composition parent | 2 fns + load | scheduled — one composing fn; loading → `main.js` |
| `main.js children/game.js children/hud.js children/hudTopBar.js` | top-bar chrome model | 2 fns | scheduled |
| `main.js children/game.js children/hud.js children/hudTelemetry.js` | telemetry-card models | 2 fns | scheduled |
| `main.js children/game.js children/hud.js children/hudModals.js` | modal models | 8 fns | scheduled (largest hud surface) |
| `main.js children/game.js children/hud.js children/hudMenu.js` | dropdown-menu model | `buildMenuModel` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/hud.js children/hudMinimap.js` | minimap rect model | `buildMinimapModel` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/hud.js children/hudBanner.js` | priority-banner model | `buildPriorityBanner` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/hud.js children/hudIntel.js` | intel overlay model | 2 fns | scheduled |
| `main.js children/game.js children/ai.js` | AI entry point + child loading | entry + load | scheduled — loading → `main.js` |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js` | AI turn sequencing | 3 fns | scheduled |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js` | AI composition + env facade | `evaluate` + load | scheduled — one composing fn; loading → `main.js` |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiStateQueries.js` | contact-picture queries | 3 fns | scheduled |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPositionQueries.js` | move-destination queries | 2 fns | scheduled |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatQueries.js` | danger queries | 2 fns | scheduled |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiPreservationQueries.js` | hull-preservation queries | 2 fns | scheduled |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetQueries.js` | fleet queries | 2 fns | scheduled |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiBeliefMemory.js` | next belief map | `computeSyncedMemory` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiInvariantChecks.js` | AI turn invariants | `checkInvariants` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiThreatScorer.js` | scoring surface | 13 fns | scheduled (largest ai surface) |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiUnitPlanner.js` | candidate unit plans | `buildUnitPlan` | 1 fn ✓ — flatten shape |
| `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/aiFleetCommander.js` | flagship reflexes / warp-in | `selectFleetActionPlan` | 1 fn ✓ — flatten shape |
| `main.js children/graphics.js` | canvas + sprite caches + draw | core | scheduled — draw lists become pure; canvas effects → `main.js` |
| `main.js children/graphics.js children/uiRenderer.js` | UI layer drawing | 3 fns | scheduled — pure draw-data fns |
| `main.js children/graphics.js children/objectRenderer.js` | board-object layer | 6 fns | scheduled |
| `main.js children/graphics.js children/backgroundRenderer.js` | background layer | 4 fns | scheduled |
| `main.js children/graphics.js children/terrainTileIndex.js` | terrain-cache tile index | `terrainTileIndex` | 1 fn ✓ |
| `main.js children/graphics.js children/vfx.js` | effects layer | `drawAnimation` | 1 fn ✓ — flatten shape |
| `main.js children/sounds.js` | audio context + sound nodes | core | scheduled — command lists become pure; playback → `main.js` |
| `main.js children/sounds.js children/sfx.js` | one-shot effects | 4 fns | scheduled |
| `main.js children/sounds.js children/music.js` | music/ambience playback | 5 fns | scheduled |
| `main.js children/inputInterface.js` | input event channel | 1 channel | scheduled — one pure boundary fn |
| `main.js children/graphicsInterface.js` | render frame channel | 1 channel | scheduled — one pure boundary fn |
| `main.js children/audioInterface.js` | audio command channel | 1 channel | scheduled — one pure boundary fn |
| `main.js children/game.js children/rules_DATA.js` | tactical rules table | table | scheduled — wrap: one fn returning the frozen table |
| `main.js children/game.js children/ai.js children/aiPriorities_DATA.js` | AI priorities table | table | scheduled — wrap |
| `main.js children/game.js children/beginningGameState_DATA.js` | initial state template | table | scheduled — wrap |
| `main.js children/game.js children/campaign_DATA.js` | campaign/level table | table | scheduled — wrap |
| `main.js children/game.js children/themes_DATA.js` | theme tables | table | scheduled — wrap |
| `main.js children/sounds.js children/audio_DATA.js` | audio clip table | table | scheduled — wrap |
| `main.js children/game.js children/gameTests.js` | game self-tests | bridge mutation | scheduled — pure `state → results` fns; bridge retired |
| `main.js children/graphics.js children/graphicsTests.js` | graphics self-tests | bridge mutation | scheduled — pure fns; bridge retired |

### Standing decisions

1. **Actions executors (superseded).** The earlier decision kept the Actions
   executors in `main.js children/game.js` because mutation is the core's job. The
   one-pure-function rule supersedes it: action logic becomes pure
   `state → state` transforms in the Game domain, and `main.js` applies the
   returned state. The intent — mutations only through the turn-flow logic —
   survives; the stateful home does not.
2. **The render-frame build is decomposed (v89).** `buildFrame` composes the
   per-domain slices from `core/frame*.js`; the frame DTO contract to
   `graphicsInterface`/`graphics` is unchanged and rendering was verified
   identical. The pattern survives the re-architecture; the shapes flatten to
   plain pure functions.
3. **Requirement decisions adopted with the clarification** (flippable on the
   user's word, recorded here so the standard is self-contained):
   (a) `main.js` is the sole imperative shell: it loads every file, owns the
   state container and the hardware, and performs every effect;
   (b) "one function" means one **exposed** pure function — private helpers
   stay in the file; a multi-behavior domain either splits per behavior or
   collapses to one entry function selected by arguments;
   (c) the rule covers **every file except `main.js`** — cores, data files,
   tests and interfaces included (this overrides the earlier cores/data/tests
   exemption); data files become one function returning their frozen table;
   tests become pure `state → results` functions (the mutation bridge is
   retired); interfaces become one pure boundary function each;
   (d) "parent" means the composing function's file (the call edge);
   `main.js` is the central loader; Owner headers name the composer;
   (e) the bar is normative now; the whole-tree re-architecture ships as
   sequential versions on top of v91 (larger than the earlier one-function
   sweep — it touches every subsystem);
   (f) checker additions are proposed in §7.3 and land with the orchestrator,
   not with this document;
   (g) the folder layout (§5) is literal and normative: root holds exactly
   `index.html`, `main.js`, `main.js children/`, `assets/` and `dev/` (all
   tooling nests in `dev/`; asset packs stay at root per the user), and every
   file with children gets a sibling folder `<exact filename> children`. The
   migration to this layout is packaged with (e) — one re-architecture
   program, because the call tree and the folder tree move together;
   (h) the mechanics contracts of §8 (ES modules, purity ban list, plain-data
   rules, naming, errors, state apply protocol, memoization, test shape,
   checker sequencing, `main.js` sectioning) are adopted defaults.

New code built to `docs/DESIGN.md` is compliant on arrival: every new file is
one pure function with one job sentence, `main.js` grows only by wiring and
effects, and every complex builder is born decomposed per §3.
