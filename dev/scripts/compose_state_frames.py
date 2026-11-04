#!/usr/bin/env python3
"""compose_state_frames.py — job: composeStateFrames derives the 8 state-packed
atlas tiles of one ship row from a single base sprite.

The baked atlas packs state into columns (sprite_design.md):
    col = (team2 ? 4 : 0) | (-moved ? 2 : 0) | (-attacked ? 1 : 0)
This tool derives those frames deterministically from one >= 256px base
sprite per row (rows 0-20; rows 18-20 are the "marines sent" variants):

  - team 1 (cols 0-3): the base, duotoned into the theme's team-1 hull ramp
    (themes_DATA.js palettes.<theme>.hull[1].dark/lit — the same ramp that
    colours the minimap, so board sprites and minimap agree).
  - team 2 (cols 4-7): the base rotated 180 degrees (sprite_design.md: "Team 2
    sprites are rotated 180 degrees"), duotoned into the team-2 hull ramp.
  - spent states scale luminance before the ramp: -moved x0.82, -attacked
    x0.90 (both compound), so a spent ship reads dimmer at a glance.
  - gameplay-constant accent colours pass through unrotated in hue: gold /
    red / orange (hue 12-70 or >= 335 deg, saturated), plus near-white and
    near-black details — per sprite_design.md these are deliberately not
    theme-remapped.

The result feeds generate_atlas.py (state tiles named "<base>.<col>"):

    python3 dev/scripts/compose_state_frames.py dev/art/sprites \
        --out-dir <staging> --team1 "#3a4149:#c2c9d0" \
        --team2 "#42290f:#c9924f"

Compliance: module level holds imports and immutable constants only;
composeStateFrames is the file's one pure function (decoded RGBA tiles in ->
decoded RGBA tiles out). The _main shell owns argv/paths and every effect.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_atlas as _ga

_DIM_MOVED = 0.82
_DIM_ATTACKED = 0.90
_WHITE_KEEP = 0.92
_BLACK_KEEP = 0.10
_ACCENT_SAT = 0.35
_ACCENT_VAL = 0.30


def composeStateFrames(bases, team1Ramp, team2Ramp):
    """Derive the 8 state-packed tiles per base sprite.

    bases: iterable of {"name", "pixels", "width", "height"} square RGBA.
    team1Ramp / team2Ramp: ((dr, dg, db), (lr, lg, lb)) dark->lit hull ramps.
    Returns the 8 x len(bases) derived tiles in the same dict shape, named
    "<base>.<col>". Pure: same inputs, same bytes.
    """
    tiles = []
    for base in sorted(bases, key=lambda s: s["name"]):
        size = base["width"]
        if size != base["height"]:
            raise ValueError("base %r is %dx%d - bases must be square"
                             % (base["name"], base["width"], base["height"]))
        rotated = _rotate180(base["pixels"], size)
        for col in range(8):
            team2 = bool(col & 4)
            dim = 1.0
            if col & 2:
                dim *= _DIM_MOVED
            if col & 1:
                dim *= _DIM_ATTACKED
            pixels = _duotone(rotated if team2 else base["pixels"], size,
                              team2Ramp if team2 else team1Ramp, dim)
            tiles.append({"name": "%s.%d" % (base["name"], col),
                          "pixels": pixels, "width": size, "height": size})
    return tiles


def _rotate180(pixels, size):
    out = bytearray(len(pixels))
    for y in range(size):
        for x in range(size):
            src = (y * size + x) * 4
            dst = ((size - 1 - y) * size + (size - 1 - x)) * 4
            out[dst:dst + 4] = pixels[src:src + 4]
    return bytes(out)


def _duotone(pixels, size, ramp, dim):
    (dr, dg, db), (lr, lg, lb) = ramp
    out = bytearray(len(pixels))
    for i in range(size * size):
        base = i * 4
        r, g, b, a = pixels[base:base + 4]
        if a == 0:
            continue
        r, g, b = r * dim, g * dim, b * dim
        if _keepOriginal(r, g, b):
            out[base] = min(255, int(r + 0.5))
            out[base + 1] = min(255, int(g + 0.5))
            out[base + 2] = min(255, int(b + 0.5))
        else:
            t = _luminance(r, g, b) / 255.0
            out[base] = int(dr + (lr - dr) * t + 0.5)
            out[base + 1] = int(dg + (lg - dg) * t + 0.5)
            out[base + 2] = int(db + (lb - db) * t + 0.5)
        out[base + 3] = a
    return bytes(out)


def _luminance(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b


def _keepOriginal(r, g, b):
    high = max(r, g, b)
    low = min(r, g, b)
    value = high / 255.0
    saturation = 0.0 if high == 0 else (high - low) / float(high)
    if saturation <= 0.12 and value >= _WHITE_KEEP:
        return True
    if value <= _BLACK_KEEP:
        return True
    if saturation >= _ACCENT_SAT and value >= _ACCENT_VAL:
        if high == r:
            hue = (60.0 * ((g - b) / float(high - low))) % 360.0
        elif high == g:
            hue = 60.0 * ((b - r) / float(high - low)) + 120.0
        else:
            hue = 60.0 * ((r - g) / float(high - low)) + 240.0
        return hue <= 70.0 or hue >= 335.0
    return False


# ---------------------------------------------------------------------------
# _main — the dev tool's main.js: the only state and the only effects
# ---------------------------------------------------------------------------

def _parseRamp(text, label):
    try:
        dark_hex, lit_hex = text.split(":")
        ramp = (_hexToRgb(dark_hex), _hexToRgb(lit_hex))
    except (ValueError, AttributeError):
        raise ValueError("%s must be '#dark:#lit' hex pair, got %r"
                         % (label, text))
    return ramp


def _hexToRgb(text):
    text = text.strip().lstrip("#")
    if len(text) != 6:
        raise ValueError("not a 6-digit hex colour: %r" % (text,))
    return tuple(int(text[i:i + 2], 16) for i in (0, 2, 4))


def _main(argv):
    import argparse
    parser = argparse.ArgumentParser(
        prog="compose_state_frames.py",
        description="Derive the 8 state-packed atlas tiles per base sprite.")
    parser.add_argument("source_dir",
                        help="directory of base sprites (<row>-<Ship>.png|.svg)")
    parser.add_argument("--out-dir", required=True,
                        help="staging directory for <base>.<col>.png tiles")
    parser.add_argument("--team1", required=True, metavar="DARK:LIT",
                        help="team-1 hull ramp, e.g. '#3a4149:#c2c9d0'")
    parser.add_argument("--team2", required=True, metavar="DARK:LIT",
                        help="team-2 hull ramp, e.g. '#42290f:#c9924f'")
    parser.add_argument("--render-size", type=int, default=512,
                        help="rasterize sources at this size (default 512)")
    args = parser.parse_args(argv)

    try:
        if not os.path.isdir(args.source_dir):
            raise ValueError("source directory not found: %s" % args.source_dir)
        ramps = (_parseRamp(args.team1, "--team1"),
                 _parseRamp(args.team2, "--team2"))
        bases, skipped = _ga._collectSources(args.source_dir, args.render_size)
        if skipped:
            print("skipped (not tile images): %s" % ", ".join(skipped))
        tiles = composeStateFrames(bases, ramps[0], ramps[1])
        os.makedirs(args.out_dir, exist_ok=True)
        for tile in tiles:
            with open(os.path.join(args.out_dir, tile["name"] + ".png"),
                      "wb") as handle:
                handle.write(_ga._encodePng(tile["pixels"], tile["width"],
                                            tile["height"]))
    except (OSError, ValueError) as error:
        print("compose_state_frames.py: %s" % error, file=sys.stderr)
        return 1

    print("composed %d state tiles from %d bases -> %s"
          % (len(tiles), len(bases), args.out_dir))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
