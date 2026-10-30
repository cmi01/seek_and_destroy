# Sprite Design — Seek & Destroy V69

*Source: `graphics/objectRenderer.js`, `data/themes_DATA.js`, `data/rules_DATA.js`.*

## Baked atlas

Ships are drawn from a pre-baked sprite atlas (one PNG per theme: `sprites_default.png`, `sprites_retro.png`, `sprites_alien.png`), loaded at runtime out of `assets/graphics.pak`. Each cell is **106×106 px** (`tilePx`). On the board a sprite is blitted at **2.2× the logical cell size**, so ships overhang their tile for readability.

**Rows (one per ship type, fixed order):** Shuttle, Fighter, Probe, Bomber, Boarding APC, Attack Frigate, Missile Frigate, Attack Destroyer, Railgun Destroyer, Missile Destroyer, Light Cruiser, Railgun Cruiser, Heavy Cruiser, Missile Cruiser, Battlecruiser, Missile Battleship, Battleship, Flagship Battlecruiser. Three extra rows (18–20) hold the "marines deployed" variants for Boarding APC, Missile Battleship, and Battleship.

**Columns bit-pack the ship's state** into the atlas:
`col = (team2 ? 4 : 0) | (-moved ? 2 : 0) | (-attacked ? 1 : 0)`. So a ship's team ownership and whether it has spent its move/attack this turn are all baked as pre-rendered frames — no runtime tinting of the hull. Slices are cached by `spriteKey` (theme + type + team + flags + cell size).

## Dynamic overlays (drawn in code, not baked)

On top of the static sprite the renderer draws animated subsystems each frame, scaled to the ship's spec and theme palette:

- **D1 — Engine plumes:** gradient-filled triangles at each nozzle in `spec.plumes`, with per-frame flicker and length wobble. Suppressed when the ship is `-moved` (helm exhausted).
- **D2 — Railgun pulse:** a travelling hot/glow bar along the spinal mount for ships with `railgunTier > 0`; two tier sizes. Only drawn at LOD ≥ 28 px and when not `-attacked`.
- **D3 — Shield bubble:** an animated octagon-style bubble for `+shield` ships — radial-gradient fill plus a wobbling, slowly rotating vertex ring with node dots. Vertex count differs by theme (8 default / 6 retro / 12 alien).
- **D4 — HP badge:** a small monospace HP readout (healthy vs. damaged colour) drawn at LOD ≥ 18 px for ships with `maxHp > 1`.
- **D5 — Flagship insignia:** a dashed gold command ring plus a top-left crown/star badge for `!flagship` units.

Team 2 sprites are rotated 180°. On the minimap, flagships render as a gold-edged diamond and all other ships as small filled circles, coloured by the team hull palette.

## Themes

Three themes — **default, retro, alien** — each supply a full board palette (background, grid, nebula, rock, sensor, per-team hull, plume, rail, shield, HP-badge colours). A `colorRemap` re-tints UI/VFX colours for retro (phosphor green) and alien (teal + fuchsia). Faction red/orange, gold, white and black are deliberately **not** remapped so their gameplay meaning stays constant across themes.
