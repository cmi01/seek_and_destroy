# Sprite Design — Seek & Destroy (v70, atlas regenerated at 256px tiles)

*Source: `main.js children/graphics.js children/objectRenderer.js`, `main.js children/game.js children/themes_DATA.js`, `main.js children/game.js children/rules_DATA.js`.*

## Baked atlas

Ships are drawn from a pre-baked sprite atlas (one PNG per theme: `sprites_default.png`, `sprites_retro.png`, `sprites_alien.png`), loaded at runtime out of `assets/graphics.pak`. Each cell is **`tilePx` × `tilePx` px** — one named value, `SPRITE_ATLAS_TILE_PX` in `themes_DATA.js` (the shipped atlas bakes **256px** tiles; regenerate + update that constant for a different-resolution atlas). On the board a sprite is blitted at **2.2× the logical cell size**, so ships overhang their tile for readability.

**Rows (one per ship type, fixed order):** Shuttle, Fighter, Probe, Bomber, Boarding APC, Attack Frigate, Missile Frigate, Attack Destroyer, Railgun Destroyer, Missile Destroyer, Light Cruiser, Railgun Cruiser, Heavy Cruiser, Missile Cruiser, Battlecruiser, Missile Battleship, Battleship, Flagship Battlecruiser. Three extra rows (18–20) hold the "marines deployed" variants for Boarding APC, Missile Battleship, and Battleship.

**Columns bit-pack the ship's state** into the atlas:
`col = (team2 ? 4 : 0) | (-moved ? 2 : 0) | (-attacked ? 1 : 0)`. So a ship's team ownership and whether it has spent its move/attack this turn are all baked as pre-rendered frames — no runtime tinting of the hull. Slices are cached by `spriteKey` (theme + type + team + flags + cell size).

## Source art and regeneration pipeline

The atlas is a build product. Source art lives in `dev/art/sprites/` — one square
SVG (or PNG) base sprite per atlas row, named `<RR>-<Ship>.svg` (rows 0–20 above).
Regeneration (deterministic; identical inputs give byte-identical output):

```
python3 dev/scripts/generate_ship_sprites.py dev/art/sprites       # base sprites
python3 dev/scripts/compose_state_frames.py dev/art/sprites \
    --out-dir <staging> --team1 "<dark>:<lit>" --team2 "<dark>:<lit>"
python3 dev/scripts/generate_atlas.py <staging> --tile-size 256 \
    --columns 8 --out assets/sprites_<theme>.png \
    --manifest assets/sprites_<theme>.json
```

then re-embed the three PNGs as data URLs in `assets/graphics.pak`
(`Graphics._registerLayer("assets", {...})`) and set `SPRITE_ATLAS_TILE_PX`.
The `<dark>:<lit>` pairs are `palettes.<theme>.hull[1|2]` from `themes_DATA.js`,
so board sprites and the minimap share one colour ramp per theme/team.

**State-frame derivation** (`compose_state_frames.py`, one pure function):
team 1 (cols 0–3) is the base duotoned into the team-1 hull ramp; team 2
(cols 4–7) is the base rotated 180° (above) duotoned into the team-2 ramp;
`-moved` scales luminance ×0.82 and `-attacked` ×0.90 (compound) so spent ships
read dimmer. Gold/red/orange accents (hue 12–70°/≥335°, saturated) and near-white
/ near-black details pass through unremapped — their gameplay meaning is
constant across themes. The near-black band covers the recipe palette's
hardware colours (`#14171c` guns/windows, value 0.110) and the `#2b313a`
hardware outlines (within a small tolerance), so weapon hardware is
faction-neutral gunmetal in both team frames (`graphicsTests` B-7).
`-moved` frames (cols 2/3/6/7) additionally carry the classic spent outline:
a `#aab4bd` rim on the silhouette edge, matching the pre-regeneration atlas
(`graphicsTests` B-8) — the rim is what makes the exhausted state read at a
glance, especially on short theme ramps where the ×0.82 mean-luminance drop
alone compresses below 2%.

**Provenance (documented deviation):** the base sprites are procedurally
rendered vector art (`generate_ship_sprites.py`), not image-model output. Every
reachable image-generation source was unusable at regeneration time: OpenRouter
image models returned HTTP 402 (credits below the ≥$1 image-output floor, both
the `images/generations` and `modalities:["image"]` routes), xAI
`grok-imagine-image-2.0` returned 402 (spending limit), and the free
Pollinations FLUX endpoint stamped a forced `pollinations.ai` watermark on
every probe (4/4, `nologo=true`, including the operator's flat-geometric prompt
set). The recipes follow the game's flat abstract geometric style (hard crisp
edges, flat fills, pale rim, no glow/blur). To swap in image-model art later:
drop square ≥256px PNGs into `dev/art/sprites/` under the same `<RR>-<Ship>`
names and re-run the pipeline above — no game code changes.

## Dynamic overlays (drawn in code, not baked)

On top of the static sprite the renderer draws animated subsystems each frame, scaled to the ship's spec and theme palette:

- **D1 — Engine plumes:** gradient-filled triangles at each nozzle in `spec.plumes`, with per-frame flicker and length wobble. Suppressed when the ship is `-moved` (helm exhausted).
- **D2 — Railgun pulse:** a travelling hot/glow bar along the spinal mount for ships with `railgunTier > 0`; two tier sizes. Only drawn at LOD ≥ 28 px and when not `-attacked`.
- **D3 — Shield bubble:** an animated octagon-style bubble for `+shield` ships — radial-gradient fill plus a wobbling, slowly rotating vertex ring with node dots. Vertex count differs by theme (8 default / 6 retro / 12 alien).
- **D4 — HP badge:** a small monospace HP readout (healthy vs. damaged colour) drawn at LOD ≥ 18 px for ships with `maxHp > 1`.
- **D5 — Flagship insignia:** a dashed gold command ring plus a top-left crown/star badge for `!flagship` units.

Team 2 sprites are rotated 180°. On the minimap, flagships render as a gold-edged diamond and all other ships as small filled circles, coloured by the team hull palette.

## Themes

Three themes — **default, retro, alien** — each supply a full board palette (background, grid, nebula, rock, sensor, per-team hull, plume, rail, shield, HP-badge colours). A `colorRemap` re-tints UI/VFX colours for retro (phosphor green) and alien (teal + fuchsia). Faction red/orange, gold, white and black are deliberately **not** remapped so their gameplay meaning stays constant across themes. The sprite themes are derived from one base set by the per-theme hull ramps (palette-shift derivation), matching the minimap coding.
