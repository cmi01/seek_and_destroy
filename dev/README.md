# Seek & Destroy

A browser-based tactical fleet-strategy game (vanilla JavaScript + HTML5 Canvas).
This repository is the working home for the game; versions are tracked with git
tags (baseline: **v69**).

## Running locally

The game loads its modules via dynamic `<script>` tags and fetches binary `.pak`
assets over HTTP, so it **must be served** — opening `index.html` directly as a
`file://` URL will not work.

```bash
dev/serve.sh            # http://localhost:8000
dev/serve.sh 8080       # custom port
```

Then open:

- `http://localhost:8000/`       — play the game
- `http://localhost:8000/?test`  — boot and run the built-in test harness

## Architecture

The entry point is `index.html`, which loads `main.js`. `main.js` is the
supervisor/wiring root: it sets up three unidirectional interface servers and
four core system processes, then drives the frame loop. Each parent module
loads its own children via an inline script loader, so there is no bundler.

The folder tree **is** the ownership tree (`docs/ARCHITECTURE_COMPLIANCE.md`
§5): every file lives in a folder named `<exact filename> children` owned by
its parent, and the depth of the folder tree equals the depth of the call tree.

```
index.html
main.js
assets/                              binary asset packs (.pak)
dev/                                 docs, audit scripts, deploy, serve.sh, README
main.js children/
  inputInterface.js                  unidirectional channels
  graphicsInterface.js
  audioInterface.js
  game.js                            core hub
  graphics.js                        canvas core
  inputs.js                          input core
  sounds.js                          audio core
  game.js children/                  game.js's direct children (data, rules, AI hub, tests)
    rules_DATA.js … campaign_DATA.js … themes_DATA.js
    gameState.js … frameBoard.js … sectorGenerator.js
    ai.js
    ai.js children/
      aiPriorities_DATA.js
      aiTurnWorkflow.js
      aiTurnWorkflow.js children/
        aiLogic.js
        aiLogic.js children/         the ten AI leaf modules
    hud.js
    hud.js children/                 hudBanner … hudTopBar
    gameTests.js
  graphics.js children/              backgroundRenderer … uiRenderer, graphicsTests.js
  sounds.js children/                audio_DATA.js, sfx.js, music.js
```

Debug handle is exposed as `window.SD` in the browser console (includes
`SD.runTests()`).

### Verification

```bash
python3 dev/scripts/structure_audit.py
python3 dev/scripts/reference_audit.py
node dev/scripts/gui_scale_layout_check.js
```

The layout check is the no-browser HUD geometry regression at 100/125/150/200/250% plus the 200px minimum canvas (GS-04 through GS-11, GS-13 stroke tokens). It is the command to run in CI or before a scaling-related release.

Live DPI (GS-01 content box, GS-02 uncapped backing store, GS-03 DPR-without-resize, drawn labels without ellipsis) needs Chromium and playwright:

```bash
python3 dev/scripts/gui_scale_browser_check.py
```

Screenshots land in `dev/docs/gui-scaling-audit-screenshots/v108/`. Procedure and pass/fail table: `dev/docs/gui-scaling-audit.md` (Verification section). A GitHub Actions workflow for the layout check is not in tree yet — the deploy credential cannot push `.github/workflows/` (`workflows` scope); same constraint as `reference-policy.yml`.

### Reference-policy check (CI gate)

Every pull request and every push to `main` runs the reference-policy gate
(`.github/workflows/reference-policy.yml`); the `reference-policy` check is a
required status check, so a violating change cannot merge. Run it locally
before pushing:

```bash
python3 dev/scripts/reference_policy_gate.py
```

On failure it lists each violating file, the files referencing it, the
violated rule and the approved remedy.

**Reference policy:** the rule (one pure function per file, state only in
`main.js`, exactly one referrer per file), why it holds, how to run the check
locally, what CI enforces, and the approved remedies are documented for
contributors in [`dev/docs/REFERENCE_POLICY_CI.md`](docs/REFERENCE_POLICY_CI.md).

### Reference-graph analyzer (`dev/scripts/reference_graph.py`)

Computes, for every file in the repo, the files that reference it (inbound)
and the files it references (outbound). Emits a JSON graph — nodes tagged
`inside-game-dir` / `inside-dev-dir` / `other`, edges as `(from, to, kind)`
with per-file `inbound`/`outbound` counts — plus a summary table sorted by
inbound count descending. Non-code references are covered too: asset paths,
resource UIDs (`uid://`), scene/prefab links (`res://`), and path literals in
build manifests, configs, scripts and docs.

```bash
python3 dev/scripts/reference_graph.py
#   -> JSON graph in dev/reference_graph.json, summary table on stdout
python3 dev/scripts/reference_graph.py --json-out - --summary-out out.txt
python3 dev/scripts/reference_graph.py --root /path/to/repo --fail-on-unresolved
```

Flags: `--root`, `--json-out`, `--summary-out` (either may be `-` for stdout),
`--dev-dir` (tag root, default `dev`), `--exclude GLOB` (repeatable extra
skip), `--allowlist FILE` (fnmatch patterns for accepted unresolved
specifiers), `--fail-on-unresolved` (exit 2 — CI gate), `--quiet`.

Extractors are per language: ES `import`/`require`, dynamic script-loader
path literals (this project's parent→child loads), HTML `src`/`href`, CSS
`url()`/`@import`, C `#include`, Python imports, Lua `require` and GDScript
`preload`/`load`. Unresolved references warn unless they match the built-in
allowlist — external URLs and data URIs, node builtins, bare module
specifiers (scoped npm packages `@scope/name` and their subpath imports
included; REFERENCE_POLICY.md §4.10), system `#include` — or a
`--allowlist` pattern. Generic string
literals (`path-literal`, `manifest-entry`, `doc-mention`) only record
resolved hits and never warn.

**Adding a new file type:** write an extractor returning
`(spec, kind, line)` triples and register it in `EXTRACTORS` by extension.
If the type needs its own resolution scheme (a path prefix or ID type),
teach `Resolver.resolve()` about it. Unregistered types still get generic
string-literal scanning, so most path references work before any code
change.

## Working on a new version

```bash
# 1. Start from a clean tree on a new branch
git checkout -b vNN

# 2. Make changes, test in the browser (dev/serve.sh, then /?test)

# 3. Commit and tag the release
git add -A
git commit -m "vNN: <summary of changes>"
git tag vNN

# 4. Compare against the previous version any time
git diff v69 vNN
```

Tags mark each shipped version so you can diff, roll back, or branch from any
prior release. `git tag` lists all versions.
