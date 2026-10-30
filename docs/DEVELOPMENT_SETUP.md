# Seek & Destroy — Development Setup

A browser-based tactical fleet-strategy game. Vanilla JavaScript + HTML5 Canvas, **no build step and no framework**. Current version: the newest `vNN` tag (see `git tag`).

## Repository

- **Location on this machine:** `/home/ubuntu/seek-and-destroy/`
- **Remote:** `https://github.com/cmi01/seek_and_destroy.git` (private), branch `main`.
- **Versioning:** plain git tags, one per release (`v69` is the baseline import, then `v70`, `v71`, …; the newest tag is the current version). **Every change lands on `main`**: release commits are pushed to `main` as well as their `vNN` branch/tag, so `main` always carries the newest release. Commit author is `Seek and Destroy Dev <dev@localhost>`.

## How it runs (must be served over HTTP)

The game **cannot** run from `file://`. It uses dynamic `<script>` loaders and `fetch()` to pull binary `.pak` asset bundles at runtime, both of which require an HTTP origin.

- **Local dev:** from the repo root run `./serve.sh` (or `python3 -m http.server 8000`) and open `http://localhost:8000/`.
- **Self-test harness:** append `?test` to the URL (`http://localhost:8000/index.html?test`). Results print to the console and `window.SD`. All changes must keep these passing (currently 16/16).
- **Debug handle:** `window.SD` exposes the live subsystems in the console.

## Architecture

`index.html` → `main.js` (supervisor), which loads three interface servers (`interfaces/*.js`) and four core processes: `core/game.js`, `graphics/graphics.js`, `core/inputs.js`, `audio/sounds.js`. Each parent script inline-loads its own children in order (`document.createElement("script")`, `async=false`).

- **No globals.** Modules self-register with a registry: core modules call `Game._registerModule(...)`, audio modules `SoundEngine._registerModule(...)`, graphics layers `Graphics._registerLayer(...)`.
- **State:** one authoritative, flat state object (`data/beginningGameState_DATA.js` template + `core/gameState.js` store). All writes go through the validated `TryPatchGameState`; keys are partitioned into lifetimes (profile / match / ai / camera / input / runtime). See `docs/data_model.md`.
- **Data-driven:** rules, ships, campaign levels, themes, and audio clips live as declarative `data/*_DATA.js` modules.
- **Assets:** `assets/graphics.pak` and `assets/audio.pak` are fetched and decoded at boot (sprite atlases per theme; one baked audio buffer per theme).

Design references: `docs/sprite_design.md`, `docs/ui_sound_design.md`, `docs/sfx_design.md`, `docs/data_model.md`, `docs/game_balance.md`.

## Deployment (live test URL)

Served **statically by nginx** on this supercomputer. The public site is a set of **versioned snapshots**: `/` 302-redirects to the newest `/vNN/`, which `deploy/snapshot_versions.sh` builds from the `vNN` git tag into `/home/ubuntu/snd-versions/vNN/`. Editing the working tree does **not** change what visitors see — a change only reaches the public URL when its version is tagged **and released** (see the release checklist step 5).

- **Public URL:** `https://seek-and-destroy.abacusai.cloud`
- **Vhost:** `deploy/seek-and-destroy.conf`, symlinked into `/etc/nginx/conf.d/`, `server_name seek-and-destroy.vm.internal`. Dotfiles, `deploy/`, `README.md` and `serve.sh` are 404-blocked.
- **Reload after vhost edits:** `sudo nginx -t && sudo systemctl reload nginx`.
- **Platform gate:** the public URL only serves when *public URL access* is enabled for this computer in the Abacus platform (SuperComputer settings). If it is off, the hostname returns 404 even though nginx serves correctly inside the VM — this is a platform toggle, not a code issue.

## Release checklist (per new version)

1. Make the change; keep `?test` self-tests green.
2. Smoke-check the origin working tree (not yet what visitors see): `curl -s -H 'Host: seek-and-destroy.vm.internal' http://localhost/index.html`.
3. `git add -A && git commit`, `git tag vNN`.
4. **Always get the new changes into `main`** — `main` must never be left behind at an older release. From the `vNN` branch: `git push origin HEAD:main`, then `git push origin refs/heads/vNN && git push origin refs/tags/vNN`. (Use explicit refs — a bare `git push origin vNN` is ambiguous when the branch and tag share a name.)
5. **Always release the new version to the Abacus supercomputer public URL** (`https://seek-and-destroy.abacusai.cloud`) — run `bash deploy/snapshot_versions.sh`, then `sudo nginx -t && sudo systemctl reload nginx`. The script builds `/home/ubuntu/snd-versions/vNN/` from the tag and repoints the `/` → newest `/vNN/` redirect. A tag that is only committed/pushed is **not** live: nothing reaches the public URL until this step runs.
6. Confirm the release: `curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://seek-and-destroy.abacusai.cloud/` must answer `302` to `/vNN/` — the version just tagged — and that version's files must be served under `/vNN/`. Caveat: the Abacus edge caches for up to 4 h (including 404s) and ignores origin `no-cache`, so a path probed **before** its snapshot existed can serve a stale 404 afterwards; re-check with a `?<random>` query string to force a fresh fetch (the origin always serves the truth).

> Note: the repo must **not** contain `.github/workflows/*` — the connected GitHub App lacks `workflows` permission and the push is rejected. Deployment is via nginx, not GitHub Pages.

## What changed in v70

The pre-battle **campaign/level-select screen was replaced with an interactive starmap**: one node per sector (ids 101, 1, 2, 3) on a connected route; secured sectors are marked, the next objective is highlighted, and clicking a node launches that sector through the existing `LEVEL_SELECT:<id>` button-id contract. Only `core/hud.js` (layout/hit-regions) and `graphics/uiRenderer.js` (rendering) changed; the state machine and input router are untouched.
