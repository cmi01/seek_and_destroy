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

## Appendix A — Conformance snapshot (v82 + working tree)

Where the current tree stands against this standard. Remediation is planned work;
this appendix is a baseline, not an exemption.

| File | Job today | Status |
|---|---|---|
| `main.js` | wiring root | compliant |
| `core/game.js` | owns state — but bundles MathGrid, Selection, Visibility, Actions executors and the render-frame build | **multi-job**; largest split candidate; frame build is an undecomposed complex builder |
| `core/rules.js` | tactical rules queries | **library shape** — 25 exports spanning movement, LOS, visibility, combat math, endgame; split into single-job children |
| `core/hud.js` | builds the HUD widget model | **undecomposed builder** — split per widget domain (top bar, telemetry, bridge modal, help) |
| `core/inputs.js` | hardware → input events | compliant |
| `core/gameState.js` | state store child | compliant |
| `core/sectorGenerator.js` | sector/unit generation | compliant (single domain) |
| `core/themes.js` | theme colour remap | compliant |
| `graphics/graphics.js` | canvas + sprite caches + draw | compliant core; layers are domain children |
| `graphics/uiRenderer.js`, `objectRenderer.js`, `backgroundRenderer.js`, `vfx.js` | one draw domain each | compliant |
| `audio/sounds.js`, `sfx.js`, `music.js` | one audio domain each | compliant |
| `ai/*` | one planning concern each; `aiLogic` composes | compliant; `aiStateQueries.js` is a multi-query surface to watch under the caller-domain test |
| `interfaces/*` | one channel each | compliant |
| `data/*` | one declarative table each | compliant |
| `tests/*` | one owner's tests each | compliant |

New code built to `docs/DESIGN.md` is compliant on arrival: every new file names
its job, and every complex builder (campaign map frames, station UI, dialogue
trees, market snapshots) is born decomposed per §3.
