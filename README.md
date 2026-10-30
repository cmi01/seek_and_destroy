# Seek & Destroy

A browser-based tactical fleet-strategy game (vanilla JavaScript + HTML5 Canvas).
This repository is the working home for the game; versions are tracked with git
tags (baseline: **v69**).

## Running locally

The game loads its modules via dynamic `<script>` tags and fetches binary `.pak`
assets over HTTP, so it **must be served** — opening `index.html` directly as a
`file://` URL will not work.

```bash
./serve.sh            # http://localhost:8000
./serve.sh 8080       # custom port
```

Then open:

- `http://localhost:8000/`       — play the game
- `http://localhost:8000/?test`  — boot and run the built-in test harness

## Architecture

The entry point is `index.html`, which loads `main.js`. `main.js` is the
supervisor/wiring root: it sets up three unidirectional interface servers and
four core system processes, then drives the frame loop. Each parent module
loads its own children via an inline script loader, so there is no bundler.

| Folder | Responsibility |
|---|---|
| `core/` | Game state, rules, turn logic, HUD, input handling, sector generation (`game.js` is the hub) |
| `ai/` | Enemy AI — fleet command, threat scoring, unit planning, turn workflow |
| `graphics/` | Canvas rendering — background, objects, UI, VFX |
| `audio/` | Sound engine, SFX, music |
| `interfaces/` | Unidirectional channels wiring input, graphics and audio to the core |
| `data/` | `*_DATA.js` tuning/config tables (rules, campaign, themes, AI priorities, audio) |
| `assets/` | Binary asset packs (`graphics.pak`, `audio.pak`) fetched at runtime |
| `tests/` | Built-in game and graphics test suites (run via `?test`) |

### Load order (from `main.js`)

1. Interface servers: `interfaces/inputInterface.js`, `graphicsInterface.js`, `audioInterface.js`
2. Core processes: `core/game.js`, `graphics/graphics.js`, `core/inputs.js`, `audio/sounds.js`
3. Each core then privately loads its own `data/*_DATA.js` and sub-modules.

Debug handle is exposed as `window.SD` in the browser console (includes
`SD.runTests()`).

## Working on a new version

```bash
# 1. Start from a clean tree on a new branch
git checkout -b vNN

# 2. Make changes, test in the browser (./serve.sh, then /?test)

# 3. Commit and tag the release
git add -A
git commit -m "vNN: <summary of changes>"
git tag vNN

# 4. Compare against the previous version any time
git diff v69 vNN
```

Tags mark each shipped version so you can diff, roll back, or branch from any
prior release. `git tag` lists all versions.
