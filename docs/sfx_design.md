# SFX Design — Seek & Destroy (v70)

*Source: `audio/sfx.js`, `data/audio_DATA.js`, `audio/sounds.js`.*

## One buffer, many slices

Every effect is a `{offset, duration}` slice into a single baked theme buffer (22 kHz, 28 s), one buffer per theme (`sounds_default/retro/alien.wav` from `assets/audio.pak`). Combat effects play on the **COMBAT** bus (level 0.95, 8 voices), ship actions on **SYSTEMS** (0.80, 6 voices).

## Spatialisation

Clips flagged `spatial` are positioned relative to the viewport, not the world: the renderer computes a stereo pan from the cell's horizontal offset from screen centre (clamped to **±0.65**) plus distance attenuation for off-screen events (gain floors at **0.35**). This keeps on-screen action centred while off-screen fire is quieter and panned toward its edge. Non-spatial clips use a fixed `pan`.

## Combat routing

The event router (`dispatchEvent`) turns semantic events into chronologically scheduled clips on the WebAudio clock so a single exchange reads correctly:

- **`weapon.fire`** → `laserShoot` / `railgunShoot` / `missileShoot` by weapon type, fired with a per-team lead (player 0.09 s, enemy 0.10 s).
- **`weapon.impact`** → `combat.impact.shield` or `combat.impact.hull` at ~0.17 s.
- **`unit.destroy`** → `hullDestroy` plus a `combat.destroy.<tier>` at ~0.24 s.
- **`weapon.shieldStrip`** → `shieldDrop`.

**Destruction tier** scales with ship category: Fighter/Bomber/Shuttle/Probe → *light*; Frigate/Destroyer/Boarding APC → *medium*; Cruiser → *heavy*; everything larger → *capital* (longest clip, ~1.0 s).

## Ship-action and scheduled cues

`SCHEDULED_ACTION_CLIPS` maps movement and systems events to SYSTEMS-bus clips located at a board cell: `unit.move → moveAction`, `unit.move.collision → blindCollision`, `unit.capture → captureAction`, `unit.shieldUp → shieldRegen`, `unit.warpIn → warpIn`.

## Fog of war

Actions by a hidden team-2 ship (not visible to the player) are suppressed or replaced by the muffled `unknownEnemyAction` cue, so the soundtrack never leaks the position of ships the player hasn't spotted. Most action clips also open a `radioMs` radio-filter window for a comms feel.

## Looping beds

None — all audio is one-shot clips now. Two background loops once ran under everything: the low 55 Hz `ambience.base` drone bed was removed in v71 because it read as an idle-machine/refrigerator hum under play, and the last bed, the `music.pad0` ambient pad (MUSIC bus, gain 0.55), was removed in v73. The dead MUSIC bus went with it. `audio/music.js` keeps the generic loop machinery (clip manifest plus `startBackgroundLoops`/`stopBackgroundLoops`, still stopped at the victory/defeat stingers) with an empty `backgroundLoops` list.
