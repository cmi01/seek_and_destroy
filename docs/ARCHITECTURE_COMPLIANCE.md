# Seek & Destroy — Architecture Compliance

Status: the structural compliance standard for every file in the repository.
Scope: **structure only**. What the game does lives in `docs/DESIGN.md`; why the
architecture looks the way it does lives in `docs/GUIDING_PRINCIPLES.md`. Where
this document and `GUIDING_PRINCIPLES.md` disagree about structure, **this document
wins** — it refines §3 of the principles: where that section calls a child a "pure
function library", a child is in fact a **single-job pure unit and never a library**.

Three rules carry the standard:

1. **One job per file.**
2. **A file is not a library.**
3. **A complex data-object builder decomposes into per-domain pure children.**

Everything else in this document defines those rules, states the compliance tests,
and records how compliance is measured.

---

## 1. One Job Per File

Every file in the repository does **exactly one job**.

- **The job is stated in one sentence in the file's header comment**, immediately
  after the filename. A file without a job sentence is non-compliant.
- **The filename states the job.** If naming a file honestly would require "and"
  (e.g. `movementAndCombat.js`), it has two jobs — split it.
- **Cores included.** A core's job is exactly its row in the cores table
  (`GUIDING_PRINCIPLES.md` §2). Anything else a core needs must live in its
  children. A core that accumulates unrelated subsystems is non-compliant even
  though it is allowed to own state.
- **Children included.** A pure function child has one job in one domain. A child
  that answers questions from several unrelated domains has several jobs — split it.
- **Data files included.** A data file holds exactly one declarative table's worth
  of content (one subject: rules, campaign, themes, …), has exactly one owner, and
  references nothing.
- **Tests included.** Tests are split by ownership and loaded on demand by the
  core they test (existing rule), one subject per test file.

### The job tests

A file is single-job when all three hold:

1. **Sentence test** — its job fits one sentence without joining unrelated duties
   with "and".
2. **Name test** — the name says what that sentence says.
3. **Caller-domain test** — every caller uses the file for that one job. If two
   callers reach into the same file for unrelated reasons, the file is a library
   wearing a job's name — split it.

## 2. A File Is Not a Library

A file is a **unit of work**, not a bag of helpers.

- **Banned shapes:** `utils.js`, `helpers.js`, `common.js`, `shared.js`, `misc.js`
  — and any file whose export surface is a grab-bag of unrelated functions that
  merely happen to be convenient. Convenience grouping is the failure mode, not
  an exception.
- **The surface test:** if a caller needs several different functions from one
  file for several different purposes, question the file before accepting the
  surface (`GUIDING_PRINCIPLES.md` §4). Narrow surfaces and single jobs are the
  same discipline seen from two sides.
- **A file of pure predicates can still be a library.** Twenty queries spanning
  movement, line of sight, visibility, combat math and endgame detection in one
  export list is a library no matter how pure each function is. Group by job,
  not by "these are all rules".
- **Allowed aggregation:** one job often needs several small private helpers.
  Helpers that serve only the file's own job are fine and should stay private;
  the moment a helper serves a second job, it belongs to a third, single-job file
  (or the job boundary is wrong and must be redrawn).
- **Composition parents are not libraries.** A file whose job is *composing* its
  children (§3) may expose one function — the composition entry point. It must
  not re-export its children's functions as a convenience surface.

## 3. Complex Data-Object Builders Decompose Into Per-Domain Children

When a pure function child's job is to **convert inputs into a complex data
object** (a render frame, an AI plan, a HUD model, a market snapshot, a
telemetry report), the builder may **not** construct that object in one
monolithic body. It must have **pure function children, one per domain of the
processing**, and its own body only composes their results.

- **A domain of the processing** is one independently changing part of the
  transformation — a slice that changes for its own reasons and can be tested on
  its own (for a render frame: board geometry, unit presentation, HUD model,
  overlay model, cursor/presentation decisions, audio cue derivation).
- **One child per domain.** Each domain child receives only what its domain needs
  (passed in by the parent), is pure and stateless, and returns exactly its slice
  of the data object as plain data.
- **The parent's assembly is trivial.** Assigning the children's slices into the
  final object is the parent's whole logic. If assembly needs real logic, that
  logic is itself a domain and gets its own child.
- **The rule recurses.** If a domain child's job is itself a complex transform,
  it decomposes further. The recursion stops at leaves that each do one job.
- **Split signals** (any one means "split"):
  - the function body has sections that change for different reasons;
  - two parts of the output would be tested separately;
  - the object literal being returned has groups of fields assembled by
    unrelated code paths;
  - the file would fail the caller-domain test because different consumers read
    unrelated slices of its output (that is two jobs wearing one object).

### Worked example (compliant)

```
Game (core, owns state)
 └── frameBuilder (job: turn game state into a render frame)
      ├── boardLayer     (job: board geometry + terrain cells → frame slice)
      ├── unitLayer      (job: units + flags + effects → frame slice)
      ├── hudModel       (job: HUD widget tree → frame slice)
      ├── overlayModel   (job: damage numbers, badges, highlights → frame slice)
      └── cursorModel    (job: hover/press state → cursor presentation slice)
```

Each node is one sentence, one name, one caller domain. `frameBuilder` composes
five plain slices and exposes one function.

### Counter-example (non-compliant)

One `buildFrame(state)` function of 400 lines that computes board cells, unit
sprites, HUD text, damage numbers and cursor style inline, in one file that also
exports `formatTelemetry()` and `clampFont()` for the HUD core to import. Three
violations at once: multi-job file, library surface, undecomposed builder.

## 4. State, Purity and Data (unchanged, restated for the checklist)

- State lives **only in the owning core**; every mutation goes through the core's
  executors; children hold no state and never modify state. The test bridge is
  the single sanctioned exception.
- Children expose only pure functions returning plain data. No live references.
- Siblings never call each other; the parent orchestrates them as a pipeline.
- Files know only their direct parent and their own children; cores never know
  each other; core-to-core traffic flows through dedicated one-way interfaces
  carrying plain data only.
- Data files are declarative, single-owner, reference-free, frozen at receipt.
- Presentation decisions are made by Game and delivered as data; Graphics draws
  exactly what it is given.
- No circular dependencies. No globals. Registrars are transient load-time-only.

## 5. File Header Contract

Every file begins with a header that states, in order:

1. **Filename and its single job** — one sentence.
2. **Owner** — the direct parent (or `core` / `wiring root` / `interface`).
3. Nothing else is required; anything beyond the job sentence must not smuggle in
   a second responsibility.

```js
// ============================================================
// frameBuilder — job: compose the render frame from per-domain slices.
// Owner: core/game.js (pure child). Holds no state.
// ============================================================
```

## 6. Compliance Measurement

Two instruments, one per kind of rule.

### 6.1 Machine check (exists today)

`scripts/reference_audit.py` machine-checks the encapsulation rules of §4
(direct-parent-only references, no globals, pure-child surface rules). It runs
clean before every release (`--map` prints the reference graph). Structural
violations it cannot see are covered by the review gate below.

### 6.2 Review gate (every change)

Run this checklist against every touched file before calling a version done:

1. Does the header state a single job in one sentence?
2. Does the filename state that job?
3. Would any caller use this file for a second, unrelated purpose? (→ split)
4. Does the file build a complex data object in one function body? (→ decompose
   into per-domain children)
5. Does every non-trivial function in the file serve the stated job only?
6. Is the export surface the minimum for that job (ideally one entry point)?
7. Any state, globals, sibling calls, or references outside parent/children?
   (→ `reference_audit.py`)
8. New children registered privately with their parent? New data files frozen?

### 6.3 Measurement and presumption rules

- Size and complexity are measured; the biggest and most complex files are the
  first split candidates (`GUIDING_PRINCIPLES.md` §5). Concretely: a procedural
  file over ~300 lines, or exposing more than ~8 functions, is **presumed
  multi-job or a library until proven otherwise** — the proof is the job tests.
- `scripts/structure_audit.py` machine-checks the checkable structural rules:
  the filename blocklist (`utils|helpers|common|shared|misc`), the header
  contract (`— job:` + `Owner:` declarations), and the size/export presumptions
  (printed as warnings; the job tests decide). `scripts/reference_audit.py`
  exempts declared header lines (they name files on purpose and are ownership
  declarations, not code references).

## 7. Document Map

| Document | Governs |
|---|---|
| `docs/DESIGN.md` | **Behavior** — what the game is and does. |
| `docs/ARCHITECTURE_COMPLIANCE.md` (this file) | **Structure** — what a file may be. |
| `docs/GUIDING_PRINCIPLES.md` | **Philosophy** — why the structure is this way. |

Conflict order for structural questions: this file → `GUIDING_PRINCIPLES.md`.
Behavior questions never resolve here; change `DESIGN.md` instead.

---

## Appendix A — Conformance snapshot (post-v88 tree, v90 sweep)

Where the current tree stands against this standard. Every row is a file as it
exists in the tree; remediation that already shipped is marked with its version
(v85 header contract, v86 `rules.js` split, v87 pure-inner extraction, v88 HUD
decomposition, v90 AI query split). This appendix is a baseline, not an
exemption.

### Root

| File | Job today | Status |
|---|---|---|
| `main.js` | create the cores and interfaces, wire them together, run the frame loop | compliant (wiring root) |

### core/

| File | Job today | Status |
|---|---|---|
| `core/game.js` | own all authoritative state, rules and turn flow — Actions executors included (see Standing decisions) | compliant core |
| `core/frameBoard.js`, `core/frameUnits.js`, `core/frameOverlay.js`, `core/frameCursor.js`, `core/frameStatus.js` | build the render frame's per-domain slices (§3) | compliant (v89) |
| `core/gameState.js` | operate the state store container passed in by its parent | compliant |
| `core/inputs.js` | translate raw hardware events into plain input events | compliant |
| `core/sectorGenerator.js` | generate a level's sector data (terrain, spawns, formation) | compliant |
| `core/themes.js` | resolve theme keys and colour remaps | compliant |
| `core/boardQueries.js` | answer board geometry, terrain and occupancy queries | compliant (v86 split of `rules.js`) |
| `core/lineOfSight.js` | answer line-of-sight queries | compliant (v86) |
| `core/visionQueries.js` | answer scan, visibility and spotting queries | compliant (v86) |
| `core/actionLegality.js` | decide action legality from evidence | compliant (v86) |
| `core/combatMath.js` | compute combat outcomes | compliant (v86) |
| `core/reservePlacement.js` | choose valid reserve-entry cells | compliant (v86) |
| `core/endgameStatus.js` | detect endgame from the unit list | compliant (v86) |
| `core/rulesConfig.js` | expose the tactical config values from the rules data table | compliant (v86) |
| `core/cameraMath.js` | resolve zoom and viewport geometry | compliant (v87) |
| `core/selectionQueries.js` | answer selection queries over the unit list | compliant (v87) |
| `core/visibilityCache.js` | compute the visibility cache over units and terrain | compliant (v87) |
| `core/hud.js` | compose the HUD widget model and button list from per-domain pure children | compliant (v88 composition parent) |
| `core/hudTopBar.js` | build the top-bar chrome model | compliant (v88) |
| `core/hudTelemetry.js` | build the telemetry-card models and card rects | compliant (v88) |
| `core/hudModals.js` | build the modal models (bridge shop, HELP, campaign starmap, endgame) | compliant (v88) |
| `core/hudMenu.js` | build the dropdown-menu model | compliant (v88) |
| `core/hudMinimap.js` | build the minimap panel rect model | compliant (v88) |
| `core/hudBanner.js` | build the priority-hint banner model | compliant (v88) |
| `core/hudIntel.js` | build the intel/turn-report overlay model | compliant (v88) |

### ai/

| File | Job today | Status |
|---|---|---|
| `ai/ai.js` | expose the single AI decision entry point and load its children | compliant |
| `ai/aiTurnWorkflow.js` | sequence the AI turn's action beats | compliant |
| `ai/aiLogic.js` | orchestrate the AI children into one decision (env facade) | compliant |
| `ai/aiStateQueries.js` | answer the AI's contact-picture state queries (own units, spotted enemies, active beliefs) | compliant — **narrowed in v90**; the old multi-query surface failed the caller-domain test (see Notes) |
| `ai/aiPositionQueries.js` | answer the AI's move-destination queries | compliant (v90 split) |
| `ai/aiThreatQueries.js` | answer the AI's danger queries over spotted enemies | compliant (v90 split) |
| `ai/aiPreservationQueries.js` | answer the AI's hull-preservation queries | compliant (v90 split) |
| `ai/aiFleetQueries.js` | answer the AI's fleet queries (capability gaps, warp-in loci) | compliant (v90 split) |
| `ai/aiBeliefMemory.js` | compute the AI's next belief map (sighting sync and decay) | compliant (v90 split) |
| `ai/aiInvariantChecks.js` | check the AI turn state's invariants | compliant (v90 split) |
| `ai/aiThreatScorer.js` | score threats and candidate moves and shots | compliant (one scoring domain) |
| `ai/aiUnitPlanner.js` | generate candidate unit plans | compliant |
| `ai/aiFleetCommander.js` | decide flagship survival reflexes and warp-in actions | compliant |

### graphics/, audio/, interfaces/

| File | Job today | Status |
|---|---|---|
| `graphics/graphics.js` | own the canvas and sprite caches and draw each frame | compliant core (state allowed); layer renderers are its children |
| `graphics/uiRenderer.js` | draw the frame's UI layer | compliant |
| `graphics/objectRenderer.js` | draw the frame's board-object layer | compliant |
| `graphics/backgroundRenderer.js` | draw the frame's background layer | compliant |
| `graphics/vfx.js` | draw the frame's effects layer | compliant |
| `audio/sounds.js` | own the audio context and active sound nodes | compliant core (state allowed) |
| `audio/sfx.js` | play one-shot sound effects from audio commands | compliant |
| `audio/music.js` | manage music and ambience playback | compliant |
| `interfaces/inputInterface.js` | carry plain input events from Inputs to Game | compliant |
| `interfaces/graphicsInterface.js` | carry plain render frames from Game to Graphics | compliant |
| `interfaces/audioInterface.js` | carry plain audio commands from Game to Audio | compliant |

### data/ (one declarative table each) and tests/ (one owner's tests each)

| File | Job today | Status |
|---|---|---|
| `data/rules_DATA.js` | tactical rules table | compliant (owner `core/game.js`) |
| `data/aiPriorities_DATA.js` | AI priorities table | compliant (owner `ai/ai.js`) |
| `data/beginningGameState_DATA.js` | initial state template | compliant (owner `core/game.js`) |
| `data/campaign_DATA.js` | campaign and level table | compliant (owner `core/game.js`) |
| `data/themes_DATA.js` | theme tables | compliant (owner `core/game.js`) |
| `data/audio_DATA.js` | audio clip table | compliant (owner `audio/sounds.js`) |
| `tests/gameTests.js` | game-side self-tests through the test bridge | compliant (owner `core/game.js`, loaded on demand) |
| `tests/graphicsTests.js` | graphics self-tests through the test bridge | compliant (owner `graphics/graphics.js`, loaded on demand) |

### Standing decisions

1. **Actions executors remain in `core/game.js`.** State mutation and turn flow
   is the core's job; the state rules (§4) forbid stateful children, so an
   extracted Actions module would either own state (forbidden) or route every
   mutation back through the core anyway. This supersedes the earlier
   snapshot's note about extracting Actions from `game.js`.
2. **The render-frame build is decomposed (v89).** `buildFrame` composes the
   per-domain slices from `core/frame*.js` (§3 applied to the frame builder);
   the frame DTO contract to `graphicsInterface`/`graphics` is unchanged and
   rendering was verified identical.

### Notes

- **v90 caller-domain disposition (`ai/aiStateQueries.js`).** The former
  13-export surface failed §1's caller-domain test: `aiUnitPlanner` reached in
  for movement search, `aiThreatScorer` for threat/preservation inputs,
  `aiFleetCommander` for reinforcement queries, and `aiLogic` for turn
  bookkeeping — four unrelated caller domains behind one export list. The file
  was split by real domain (contact picture stays; position, threat,
  preservation, fleet queries, belief memory and invariant checks each get one
  single-job file) with behavior proven identical before/after. `moveHeuristic`
  and `shouldRetreat` have no external callers today; each is kept as the
  natural second query of its domain file. Ownership-map rows for the six new
  children are pending in `scripts/reference_audit.py` (orchestrator-owned).
- **Presumption dispositions** (`structure_audit.py` size/export warnings — the
  presumptions stand rebutted by the job tests, one line each):
  - `ai/ai.js` (9 fns): one entry point; the rest is its priorities-normalization plumbing and child loader.
  - `ai/aiThreatScorer.js` (377 lines, 13 fns): one scoring domain; the 13 exports are one scoring surface consumed through `aiLogic`'s env.
  - `audio/sfx.js` (10 fns): one job (one-shot effect dispatch); the functions are its dispatch pipeline.
  - `audio/sounds.js` (656 lines, 40 fns): core; owns the audio context and live sound nodes, so its bulk is state operations.
  - `core/game.js` (>300 lines, >8 fns): **scheduled** — v89 frame decomposition in flight (counts also fluctuate while that work lands).
  - `core/gameState.js` (13 fns): one job (operate the state store); the surface is the store API incl. serialization.
  - `core/hud.js` (579 lines, 22 fns): composition parent (v88); the bulk is the parent's (view, input) → result ops that dispatch into its seven widget children.
  - `core/hudModals.js` (334 lines, 10 fns): one widget domain (modal models) per the v88 decomposition; four modal builders share one modal surface.
  - `core/rulesConfig.js` (11 fns): one job (config getters); one one-line getter per config key.
  - `data/aiPriorities_DATA.js` (507 lines): declarative table — the presumption measures code, not data rows.
  - `graphics/graphics.js` (1038 lines, 39 fns): core; owns canvas and sprite caches, layers are children.
  - `graphics/uiRenderer.js` (996 lines, 17 fns): one job (draw the UI layer); length is per-widget draw code inside that single domain.
  - `main.js` (368 lines, 15 fns): wiring root; boot, wiring and the frame loop are its single job.

New code built to `docs/DESIGN.md` is compliant on arrival: every new file names
its job, and every complex builder (campaign map frames, station UI, dialogue
trees, market snapshots) is born decomposed per §3.
