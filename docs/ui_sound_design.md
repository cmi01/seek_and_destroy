# UI Sound Design — Seek & Destroy (v70)

*Source: `audio/sounds.js`, `audio/sfx.js`, `data/audio_DATA.js`.*

## Buses and mix

All audio runs through a single WebAudio `AudioContext` into a bus graph, then a master `DynamicsCompressor` and analyser. UI sounds use the **UI** bus and the lower-priority **TELEMETRY** bus, so they sit beneath combat. Default bus levels:

| Bus | Level | Voice cap |
|---|---:|---:|
| UI | 0.40 | 4 |
| TELEMETRY | 0.65 | 4 |
| SYSTEMS | 0.80 | 6 |
| COMBAT | 0.95 | 8 |
| AMBIENCE | 0.55 | — |
| MUSIC | 0.22 | — |

Master defaults to 0.75. Settings persist to `localStorage` under `sd.audio.settings.v2`. Audio needs a user gesture to unlock the context (handled by the enable-audio control), which plays `ui.enableAudio`.

## UI-bus clips

Every UI clip is a `{offset, duration}` slice into the one baked theme buffer. UI sounds are short and mostly centre-panned or lightly fixed-panned (not spatialised to the board):

- **Selection / navigation:** `selectUnit` (also mapped from `ui.select`, `ui.buttonClick`), `hoverCell`, `hoverHostile`. Hover is spatialised and debounced to **90 ms** so sweeping the cursor doesn't spam voices.
- **Panels / modals:** `commandBridgeOpen` / `commandBridgeClose` (modal open/close), `inspectorToggle` (inspect mode), `minimapZoom` (zoom notches).
- **Feedback:** `invalidAction` for a rejected input.

## TELEMETRY (turn / status cues)

Status chatter lives on TELEMETRY: `playerAction` / `enemyAction` / `unknownEnemyAction` (a muffled cue when an unseen enemy acts), `playerTurnEnd` / `enemyTurnEnd`, `contactSpotted`, and the `victoryStinger` / `defeatStinger` end-of-match cues.

## Radio treatment

Many UI/telemetry clips carry a `radioMs` value that opens a short "radio filter" window (e.g. `selectUnit` 75 ms, `commandBridgeOpen` 90 ms, stingers ~400 ms), giving the interface a comms-channel character. Clips are routed semantically through `DIRECT_EVENT_CLIPS` (e.g. `ui.modal.open → commandBridgeOpen`), so game code emits events like `ui.inspect` rather than clip names.
