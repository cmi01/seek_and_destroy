#!/usr/bin/env python3
"""generate_ship_sprites.py — job: generateShipSprite renders one flat
geometric top-down ship sprite (an SVG source tile) from an immutable recipe.

DOCUMENTED DEVIATION (asset provenance): the sprite source art is procedurally
rendered vector art, not image-model output. Every reachable image-generation
source was unusable when this atlas was regenerated: OpenRouter image models
return HTTP 402 (account credits below the >= $1.00 image-output floor), xAI
grok-imagine returns 402 (spending limit), and the free Pollinations FLUX
endpoint stamps a forced "pollinations.ai" watermark on every tile. Per the
operator's steering, procedural vector rendering in the game's flat abstract
geometric style beats watermarked photos. The recipes below follow the shipped
atlas's style language: flat fills, hard crisp edges, a pale 1px rim on top
facets, no glow, no blur. To swap in image-model art later, drop square
>= 256px PNGs into dev/art/sprites/ using the same <row>-<Ship> names and
re-run the pipeline documented in dev/docs/sprite_design.md.

Usage:

    python3 dev/scripts/generate_ship_sprites.py [out_dir]

Writes one SVG per atlas row into out_dir (default dev/art/sprites):
<RR>-<Ship>.svg, rows 0-20 per themes_DATA.js spriteAtlas (rows 18-20 are the
"marines sent" variants of Boarding APC / Missile Battleship / Battleship).

Compliance: module level holds imports, immutable constants and recipes only;
generateShipSprite is the file's one pure function (recipe in -> SVG text out).
The _main shell owns argv/paths and performs every effect.

Recipe DSL (tuple shapes, drawn back to front; y axis is symmetric about 128,
ships point RIGHT):
  ("H", fill, outline, x0,dy0, x1,dy1, ...)  mirrored hull polygon (outline
      pairs each top-edge point with its bottom mirror)
  ("F", fill, x0,dy0, ...)                   mirrored fill-only polygon (facets)
  ("P", fill, outline, x0,y0, x1,y1, ...)    plain polygon
  ("R", fill, outline, x, y, w, h)           plain rect
  ("C", fill, outline, cx, cy, r)            plain circle
  ("MS", fill, outline, x, dy, w, h)         mirrored rects at y = 128 +- dy
  ("MC", fill, outline, cx, dy, r)           mirrored circles at y = 128 +- dy
outline may be None (no stroke).
"""

import os
import sys

_OUTLINE = "#2b313a"
_HULL = "#8b949f"
_HULL_LIGHT = "#b9c1c9"
_RIM = "#dfe5ea"
_DARK = "#14171c"
_GOLD = "#f0c24a"
_RED = "#d8433f"
_FLAME = "#ff9a3c"
_WHITE = "#eef2f6"
_CENTER = 128.0


def generateShipSprite(recipe):
    """Render one (name, shapes) recipe as SVG text for a 256x256 tile."""
    _name, shapes = recipe
    body = []
    for shape in shapes:
        kind = shape[0]
        if kind == "H":
            _appendHull(body, shape[1], shape[2], shape[3:])
        elif kind == "F":
            _appendHull(body, shape[1], None, shape[2:])
        elif kind == "P":
            pts = " ".join("%g,%g" % (shape[3 + i], shape[4 + i])
                           for i in range(0, len(shape) - 3, 2))
            _appendPolygon(body, pts, shape[1], shape[2])
        elif kind == "R":
            _appendRect(body, shape[3], shape[4], shape[5], shape[6],
                        shape[1], shape[2])
        elif kind == "C":
            body.append('<circle cx="%g" cy="%g" r="%g" fill="%s"%s/>'
                        % (shape[3], shape[4], shape[5], shape[1],
                           _stroke(shape[2])))
        elif kind == "MS":
            _appendRect(body, shape[3], _CENTER - shape[4] - shape[6] / 2.0,
                        shape[5], shape[6], shape[1], shape[2])
            _appendRect(body, shape[3], _CENTER + shape[4] - shape[6] / 2.0,
                        shape[5], shape[6], shape[1], shape[2])
        elif kind == "MC":
            body.append('<circle cx="%g" cy="%g" r="%g" fill="%s"%s/>'
                        % (shape[3], _CENTER - shape[4], shape[5], shape[1],
                           _stroke(shape[2])))
            body.append('<circle cx="%g" cy="%g" r="%g" fill="%s"%s/>'
                        % (shape[3], _CENTER + shape[4], shape[5], shape[1],
                           _stroke(shape[2])))
        else:
            raise ValueError("unknown shape kind %r" % (kind,))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
            + "".join(body) + "</svg>")


def _stroke(outline):
    return ' stroke="%s" stroke-width="2" stroke-linejoin="miter"' % outline \
        if outline else ""


def _appendPolygon(body, points, fill, outline):
    body.append('<polygon points="%s" fill="%s"%s/>'
                % (points, fill, _stroke(outline)))


def _appendRect(body, x, y, w, h, fill, outline):
    body.append('<rect x="%g" y="%g" width="%g" height="%g" fill="%s"%s/>'
                % (x, y, w, h, fill, _stroke(outline)))


def _appendHull(body, fill, outline, flat):
    top = [(flat[i], _CENTER - flat[i + 1]) for i in range(0, len(flat), 2)]
    bottom = [(x, _CENTER + ( _CENTER - y)) for x, y in reversed(top)]
    pts = " ".join("%g,%g" % p for p in top + bottom)
    _appendPolygon(body, pts, fill, outline)


# Recipes: one per atlas row (index = row). Immutable tuples.
_SHIP_RECIPES = (
    ("Shuttle", (
        ("MS", _HULL, _OUTLINE, 98, 33, 62, 16),
        ("H", _HULL, _OUTLINE, 216, 7, 192, 22, 112, 22, 96, 29, 82, 22, 82, 9),
        ("F", _HULL_LIGHT, 205, 5, 188, 15, 118, 15, 104, 21),
        ("MC", _DARK, None, 150, 13, 5),
        ("MS", _DARK, None, 86, 12, 12, 11),
        ("MS", _FLAME, None, 70, 12, 14, 8),
        ("R", _GOLD, None, 176, 124, 22, 8),
    )),
    ("Fighter", (
        ("H", _HULL, _OUTLINE, 222, 3, 150, 20, 118, 33, 100, 33, 112, 15, 84, 15, 84, 5),
        ("F", _HULL_LIGHT, 214, 2, 152, 13, 122, 25, 110, 25),
        ("R", _DARK, None, 160, 122, 34, 12),
        ("MS", _DARK, None, 90, 9, 14, 10),
        ("MS", _FLAME, None, 74, 9, 14, 7),
        ("R", _RED, None, 196, 124, 16, 8),
    )),
    ("Probe", (
        ("MC", _HULL, _OUTLINE, 150, 30, 13),
        ("MC", _HULL, None, 128, 38, 13),
        ("MC", _HULL, None, 106, 30, 13),
        ("H", _HULL_LIGHT, _OUTLINE, 196, 4, 172, 18, 122, 18, 96, 4),
        ("MC", _DARK, None, 150, 30, 5),
        ("R", _DARK, None, 186, 122, 16, 12),
        ("MC", _GOLD, None, 128, 38, 5),
        ("MS", _FLAME, None, 78, 16, 12, 7),
    )),
    ("Bomber", (
        ("MS", _HULL, _OUTLINE, 108, 40, 78, 18),
        ("H", _HULL, _OUTLINE, 214, 6, 178, 24, 116, 24, 92, 32, 78, 24, 78, 8),
        ("F", _HULL_LIGHT, 204, 4, 172, 15, 124, 15, 104, 23),
        ("MS", _RED, _OUTLINE, 120, 41, 34, 12),
        ("MS", _DARK, None, 84, 13, 14, 12),
        ("MS", _FLAME, None, 68, 13, 14, 8),
        ("R", _DARK, None, 150, 122, 30, 12),
    )),
    ("Boarding APC", (
        ("MS", _HULL, _OUTLINE, 112, 38, 84, 20),
        ("H", _HULL, _OUTLINE, 218, 10, 196, 26, 120, 26, 100, 34, 84, 26, 84, 12),
        ("F", _HULL_LIGHT, 208, 8, 190, 17, 128, 17, 110, 25),
        ("P", _DARK, _OUTLINE, 218, 112, 226, 118, 226, 138, 218, 144),
        ("MS", _GOLD, None, 150, 38, 12, 12),
        ("R", _DARK, None, 160, 120, 36, 16),
        ("MS", _DARK, None, 90, 15, 14, 13),
        ("MS", _FLAME, None, 72, 15, 16, 9),
    )),
    ("Attack Frigate", (
        ("H", _HULL, _OUTLINE, 222, 6, 186, 20, 150, 30, 100, 30, 82, 22, 82, 7),
        ("F", _HULL_LIGHT, 214, 4, 182, 12, 152, 21, 106, 21),
        ("C", _HULL_LIGHT, _OUTLINE, 176, 128, 12),
        ("R", _DARK, _OUTLINE, 188, 124, 28, 8),
        ("MS", _DARK, None, 112, 31, 22, 8),
        ("MS", _DARK, None, 88, 11, 14, 11),
        ("MS", _FLAME, None, 70, 11, 16, 8),
        ("R", _RED, None, 132, 125, 14, 6),
    )),
    ("Missile Frigate", (
        ("MS", _HULL, _OUTLINE, 118, 36, 62, 18),
        ("H", _HULL, _OUTLINE, 218, 8, 182, 22, 130, 22, 104, 30, 84, 22, 84, 8),
        ("F", _HULL_LIGHT, 208, 6, 176, 13, 136, 13, 112, 21),
        ("MS", _DARK, _OUTLINE, 130, 37, 40, 15),
        ("MC", _RED, None, 140, 37, 4),
        ("MC", _RED, None, 154, 37, 4),
        ("MS", _DARK, None, 90, 11, 14, 11),
        ("MS", _FLAME, None, 72, 11, 16, 8),
    )),
    ("Attack Destroyer", (
        ("H", _HULL, _OUTLINE, 226, 5, 180, 18, 146, 30, 96, 30, 78, 21, 78, 6),
        ("F", _HULL_LIGHT, 218, 3, 176, 10, 150, 21, 102, 21),
        ("R", _DARK, _OUTLINE, 196, 121, 30, 8),
        ("R", _DARK, _OUTLINE, 196, 132, 30, 8),
        ("MS", _GOLD, None, 128, 31, 22, 7),
        ("MS", _DARK, None, 84, 10, 16, 12),
        ("MS", _FLAME, None, 66, 10, 16, 8),
    )),
    ("Railgun Destroyer", (
        ("H", _HULL, _OUTLINE, 228, 4, 188, 15, 150, 26, 92, 26, 74, 17, 74, 5),
        ("F", _HULL_LIGHT, 220, 2, 184, 8, 154, 18, 98, 18),
        ("R", _DARK, _OUTLINE, 120, 124, 100, 8),
        ("R", _HULL_LIGHT, None, 130, 125, 80, 6),
        ("C", _DARK, _OUTLINE, 108, 128, 11),
        ("MS", _DARK, None, 80, 8, 14, 11),
        ("MS", _FLAME, None, 62, 8, 16, 7),
    )),
    ("Missile Destroyer", (
        ("MS", _HULL, _OUTLINE, 122, 33, 68, 17),
        ("H", _HULL, _OUTLINE, 222, 7, 186, 20, 138, 20, 110, 28, 86, 20, 86, 7),
        ("F", _HULL_LIGHT, 212, 5, 180, 12, 144, 12, 118, 19),
        ("MS", _DARK, _OUTLINE, 138, 34, 46, 14),
        ("MC", _RED, None, 148, 34, 4),
        ("MC", _RED, None, 162, 34, 4),
        ("MC", _RED, None, 176, 34, 4),
        ("R", _DARK, None, 168, 123, 26, 10),
        ("MS", _DARK, None, 92, 10, 14, 11),
        ("MS", _FLAME, None, 74, 10, 16, 8),
    )),
    ("Light Cruiser", (
        ("H", _HULL, _OUTLINE, 226, 8, 184, 22, 152, 34, 98, 34, 76, 24, 76, 8),
        ("F", _HULL_LIGHT, 218, 5, 180, 13, 156, 24, 104, 24),
        ("C", _HULL_LIGHT, _OUTLINE, 180, 128, 13),
        ("R", _DARK, _OUTLINE, 192, 123, 30, 10),
        ("C", _HULL_LIGHT, _OUTLINE, 118, 128, 13),
        ("R", _DARK, _OUTLINE, 130, 123, 30, 10),
        ("MS", _DARK, None, 112, 35, 26, 8),
        ("MS", _DARK, None, 82, 11, 18, 13),
        ("MS", _FLAME, None, 62, 11, 18, 9),
        ("R", _GOLD, None, 148, 125, 12, 6),
    )),
    ("Railgun Cruiser", (
        ("H", _HULL, _OUTLINE, 228, 7, 190, 19, 156, 31, 100, 31, 78, 22, 78, 7),
        ("F", _HULL_LIGHT, 220, 4, 186, 11, 160, 22, 106, 22),
        ("R", _DARK, _OUTLINE, 112, 123, 112, 10),
        ("R", _HULL_LIGHT, None, 122, 125, 92, 6),
        ("C", _DARK, _OUTLINE, 100, 128, 13),
        ("MS", _GOLD, None, 166, 32, 16, 7),
        ("MS", _DARK, None, 84, 10, 18, 12),
        ("MS", _FLAME, None, 64, 10, 18, 8),
    )),
    ("Heavy Cruiser", (
        ("MS", _HULL, _OUTLINE, 120, 44, 74, 22),
        ("H", _HULL, _OUTLINE, 228, 10, 190, 28, 154, 38, 96, 38, 72, 27, 72, 10),
        ("F", _HULL_LIGHT, 218, 6, 186, 17, 158, 27, 104, 27),
        ("C", _HULL_LIGHT, _OUTLINE, 186, 128, 14),
        ("R", _DARK, _OUTLINE, 198, 122, 32, 12),
        ("C", _HULL_LIGHT, _OUTLINE, 136, 128, 14),
        ("R", _DARK, _OUTLINE, 148, 122, 32, 12),
        ("C", _HULL_LIGHT, _OUTLINE, 94, 128, 12),
        ("MS", _DARK, None, 78, 12, 18, 14),
        ("MS", _FLAME, None, 58, 12, 18, 10),
    )),
    ("Missile Cruiser", (
        ("MS", _HULL, _OUTLINE, 122, 42, 78, 21),
        ("H", _HULL, _OUTLINE, 226, 9, 188, 26, 150, 36, 98, 36, 74, 25, 74, 9),
        ("F", _HULL_LIGHT, 216, 6, 182, 15, 154, 25, 106, 25),
        ("MS", _DARK, _OUTLINE, 132, 43, 58, 18),
        ("MC", _RED, None, 142, 43, 5),
        ("MC", _RED, None, 158, 43, 5),
        ("MC", _RED, None, 174, 43, 5),
        ("R", _DARK, _OUTLINE, 178, 121, 34, 14),
        ("MS", _DARK, None, 80, 11, 18, 13),
        ("MS", _FLAME, None, 60, 11, 18, 9),
    )),
    ("Battlecruiser", (
        ("H", _HULL, _OUTLINE, 230, 10, 192, 26, 158, 40, 96, 40, 68, 28, 68, 10),
        ("F", _HULL_LIGHT, 222, 6, 188, 15, 162, 28, 104, 28),
        ("C", _HULL_LIGHT, _OUTLINE, 192, 128, 15),
        ("R", _DARK, _OUTLINE, 204, 121, 32, 14),
        ("C", _HULL_LIGHT, _OUTLINE, 128, 128, 15),
        ("R", _DARK, _OUTLINE, 140, 121, 32, 14),
        ("MS", _GOLD, None, 108, 41, 30, 8),
        ("MS", _DARK, None, 74, 11, 20, 15),
        ("MS", _FLAME, None, 52, 11, 20, 10),
    )),
    ("Missile Battleship", (
        ("MS", _HULL, _OUTLINE, 118, 52, 84, 26),
        ("H", _HULL, _OUTLINE, 232, 12, 196, 32, 158, 46, 92, 46, 64, 33, 64, 12),
        ("F", _HULL_LIGHT, 222, 7, 192, 19, 162, 32, 102, 32),
        ("MS", _DARK, _OUTLINE, 132, 53, 70, 22),
        ("MS", _RED, None, 142, 53, 42, 6),
        ("MC", _GOLD, None, 120, 53, 5),
        ("R", _DARK, _OUTLINE, 184, 119, 38, 18),
        ("R", _RED, None, 192, 124, 22, 8),
        ("MS", _DARK, None, 70, 13, 22, 17),
        ("MS", _FLAME, None, 46, 13, 22, 11),
    )),
    ("Battleship", (
        ("MS", _HULL, _OUTLINE, 124, 55, 78, 28),
        ("H", _HULL, _OUTLINE, 234, 13, 198, 35, 160, 50, 90, 50, 60, 35, 60, 13),
        ("F", _HULL_LIGHT, 224, 8, 194, 21, 164, 35, 100, 35),
        ("P", _GOLD, None, 152, 128, 178, 114, 190, 114, 164, 128, 190, 142, 178, 142),
        ("C", _HULL_LIGHT, _OUTLINE, 132, 128, 15),
        ("R", _DARK, _OUTLINE, 144, 121, 34, 14),
        ("C", _HULL_LIGHT, _OUTLINE, 88, 128, 13),
        ("MS", _DARK, None, 66, 14, 22, 18),
        ("MS", _FLAME, None, 42, 14, 22, 12),
    )),
    ("Flagship Battlecruiser", (
        ("H", _HULL, _OUTLINE, 234, 11, 198, 30, 162, 46, 92, 46, 62, 31, 62, 11),
        ("F", _HULL_LIGHT, 224, 6, 194, 18, 166, 31, 102, 31),
        ("MS", _GOLD, _OUTLINE, 132, 47, 64, 12),
        ("P", _GOLD, None, 148, 128, 162, 108, 176, 108, 176, 116, 168, 116, 168, 128, 188, 128, 188, 116, 180, 116, 180, 108, 194, 108, 208, 128),
        ("C", _HULL_LIGHT, _OUTLINE, 122, 128, 15),
        ("R", _DARK, _OUTLINE, 134, 121, 34, 14),
        ("R", _RED, None, 104, 124, 16, 8),
        ("MS", _DARK, None, 68, 12, 22, 16),
        ("MS", _FLAME, None, 44, 12, 22, 10),
    )),
    ("Boarding APC-marines-sent", (
        ("MS", _HULL, _OUTLINE, 112, 38, 84, 20),
        ("H", _HULL, _OUTLINE, 218, 10, 196, 26, 120, 26, 100, 34, 84, 26, 84, 12),
        ("F", _HULL_LIGHT, 208, 8, 190, 17, 128, 17, 110, 25),
        ("P", _DARK, _OUTLINE, 218, 112, 226, 118, 226, 138, 218, 144),
        ("R", _DARK, _OUTLINE, 132, 108, 44, 40),
        ("MS", _WHITE, None, 144, 24, 20, 5),
        ("R", _RED, None, 188, 124, 14, 8),
        ("MS", _DARK, None, 90, 15, 14, 13),
        ("MS", _FLAME, None, 72, 15, 16, 9),
    )),
    ("Missile Battleship-marines-sent", (
        ("MS", _HULL, _OUTLINE, 118, 52, 84, 26),
        ("H", _HULL, _OUTLINE, 232, 12, 196, 32, 158, 46, 92, 46, 64, 33, 64, 12),
        ("F", _HULL_LIGHT, 222, 7, 192, 19, 162, 32, 102, 32),
        ("MS", _DARK, _OUTLINE, 132, 53, 70, 22),
        ("MS", _WHITE, None, 142, 53, 42, 6),
        ("MC", _RED, None, 120, 53, 5),
        ("R", _DARK, _OUTLINE, 184, 119, 38, 18),
        ("R", _WHITE, None, 192, 124, 22, 8),
        ("MS", _DARK, None, 70, 13, 22, 17),
        ("MS", _FLAME, None, 46, 13, 22, 11),
    )),
    ("Battleship-marines-sent", (
        ("MS", _HULL, _OUTLINE, 124, 55, 78, 28),
        ("H", _HULL, _OUTLINE, 234, 13, 198, 35, 160, 50, 90, 50, 60, 35, 60, 13),
        ("F", _HULL_LIGHT, 224, 8, 194, 21, 164, 35, 100, 35),
        ("MS", _RED, _OUTLINE, 148, 42, 62, 10),
        ("C", _HULL_LIGHT, _OUTLINE, 132, 128, 15),
        ("R", _DARK, _OUTLINE, 144, 121, 34, 14),
        ("R", _WHITE, None, 96, 123, 18, 10),
        ("MS", _DARK, None, 66, 14, 22, 18),
        ("MS", _FLAME, None, 42, 14, 22, 12),
    )),
)


# ---------------------------------------------------------------------------
# _main — the dev tool's main.js: the only state and the only effects
# ---------------------------------------------------------------------------

def _main(argv):
    out_dir = argv[0] if argv else os.path.join("dev", "art", "sprites")
    names = ["%02d-%s.svg" % (row, recipe[0])
             for row, recipe in enumerate(_SHIP_RECIPES)]
    os.makedirs(out_dir, exist_ok=True)
    for recipe, file_name in zip(_SHIP_RECIPES, names):
        with open(os.path.join(out_dir, file_name), "w") as handle:
            handle.write(generateShipSprite(recipe))
            handle.write("\n")
    print("wrote %d ship sprites to %s" % (len(names), out_dir))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
