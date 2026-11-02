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
```

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
