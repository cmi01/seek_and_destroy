# Data Model — Seek & Destroy V69

*Source: `core/gameState.js`, `data/beginningGameState_DATA.js`.*

## Single authoritative state

The whole game is one flat state object, declared once as a template in `beginningGameStateData.initialState` and materialized into the live store. Game code reads a thin view (`Game.State`) and never mutates the object directly — all writes go through `TryPatchGameState`, which validates a delta before applying it.

## Validated deltas

`isValidDelta` enforces per-key type and range rules, so an illegal write is rejected rather than corrupting state. Examples: `activeTeam` must be `1` or `2`; `viewSpan` must be 5–32; `ap` ≥ 0; `turnNumber`/`nextUnitId` ≥ 1; `credits`/`income`/`aiPlan` must be objects; `terrain`, `units`, `animations`, etc. must be arrays; `lastSeenEnemies` must be a `Map`; `completedLevels`/`keysDown` must be `Set`s. Only keys present in the template are writable.

## Lifetimes

Every key belongs to exactly one **lifetime**, which controls when it resets (a startup sanity check logs any key that isn't mapped to exactly one):

| Lifetime | Resets | Example keys |
|---|---|---|
| **profile** | never (survives sector change) | `completedLevels`, `theme`, `audioSettings`, `rng`, `rngSeed` |
| **match** | each sector / battle | `levelId`, `turnNumber`, `activeTeam`, `ap`, `credits`, `income`, `terrain`, `units`, `aiDoctrine`, `gameOver` |
| **ai** | each battle | `lastSeenEnemies`, `aiPlan`, `aiScoreTrace`, `aiEmergencyMode` |
| **camera** | each battle | `viewX`, `viewY`, `viewSpan`, `zoomAnim` |
| **input** | each battle | `selectedUnitId`, `selectedCell`, `mousePx`, `inspectMode`, `keysDown` |
| **runtime** | never serialized | `animations`, `aiTimers`, `audioTimers`, caches, `visDirty` |

`InitializeGameState` can preserve chosen lifetimes (e.g. keep `profile` when starting the next sector).

## Collections

Two keys and one nested path are materialized from template arrays into runtime `Map`s (`lastSeenEnemies`, `aiPlan.reservations`) and `Set`s (`completedLevels`, `keysDown`), via the `collections` manifest.

## Serialization

Only the persistent lifetimes (**profile + match + ai + camera**) are serialized. The live `rng` closure is skipped and rebuilt from `rngSeed`; runtime/input plumbing is rebuilt fresh. `Map`/`Set` values are tagged with `__map` / `__set` wrappers so they round-trip. Loads are validated against the schema string `seek-and-destroy.beginning-game-state` and ignore unknown keys.
