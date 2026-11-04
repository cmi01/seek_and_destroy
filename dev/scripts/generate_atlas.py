#!/usr/bin/env python3
"""generate_atlas.py — job: generateAtlas packs square tile images into one
sprite-atlas PNG plus a JSON manifest mapping tile-name -> {x, y, w, h}.

Usage note — expected source-art layout:

    dev/art/sprites/<tile-name>.png      one image per tile, square, >= tile
                                         size per side (default 256px; PNG:
                                         gray, gray+alpha, RGB, RGBA or
                                         indexed, 1/2/4/8-bit, non-interlaced)
    dev/art/sprites/<tile-name>.svg      vector tiles are allowed; they are
                                         rasterized at exactly tile-size x
                                         tile-size (aspect forced square)

Run:

    python3 dev/scripts/generate_atlas.py dev/art/sprites \
        --tile-size 256 --out assets/sprite_atlas.png \
        --manifest assets/sprite_atlas.json

Behaviour:
  - Tiles are laid out row-major in name order on a ceil(sqrt(n)) x ceil(n/cols)
    grid; atlas width/height are always a whole multiple of the tile size.
  - Sources larger than the tile size are area-downsampled to exactly the tile
    size. Upscaling is refused: an upscale fakes detail (the reason the atlas is
    being regenerated), so source art must be at least tile-size per side.
  - Output is deterministic: identical inputs produce byte-identical PNG and
    manifest (sorted tile order, sorted manifest keys, fixed zlib level, no
    timestamp or ancillary chunks). Rasterized SVG pixels depend on the local
    rasterizer (rsvg-convert / ImageMagick), the layout never does.

Compliance: this file holds no module-level state and no globals — it is one
pure function (generateAtlas) plus its private helpers. The `_main` shell is
this dev tool's equivalent of main.js: it alone owns state (argv, paths, file
bytes) and performs every effect (reads, subprocesses, writes), passing all of
it into the pure core as arguments.

The manifest's tile coordinates are written for consumers such as
themes_DATA.js (the baked spriteAtlas table).
"""

import argparse
import json
import math
import os
import struct
import subprocess
import sys
import zlib

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# Channel counts per PNG color type (0, 2, 3, 4, 6 are valid; 0 marks the
# unused types 1 and 5). Immutable tuple: no module-level mutable state.
_PNG_CHANNELS = (1, 0, 3, 1, 2, 0, 4)
_MAX_PIXELS = 64 * 1024 * 1024


# ---------------------------------------------------------------------------
# The file's one function
# ---------------------------------------------------------------------------

def generateAtlas(sources, tileSize=256, columns=None):
    """Pack square tile images into one atlas PNG and its tile->rect manifest.

    sources: iterable of {"name": str, "pixels": bytes, "width": int,
    "height": int} with `pixels` RGBA row-major (width*height*4 bytes).
    tileSize: atlas cell edge in pixels (default 256).
    columns: grid width in tiles; None (default) picks ceil(sqrt(n)). An
    explicit column count packs the row-major name order onto that grid
    (e.g. 8 for the game's 8-column state-packed sprite atlas).

    Returns {"png": bytes, "manifest": {name: {"x","y","w","h"}}}. Pure:
    identical arguments give identical results; nothing is held between calls.
    """
    if not isinstance(tileSize, int) or tileSize < 1:
        raise ValueError("tileSize must be a positive integer, got %r" % (tileSize,))
    if columns is not None and (not isinstance(columns, int) or columns < 1):
        raise ValueError("columns must be a positive integer or None, got %r"
                         % (columns,))
    tiles = sorted(list(sources), key=lambda s: s["name"])
    if not tiles:
        raise ValueError("no tile sources given")
    seen = set()
    for source in tiles:
        name = source["name"]
        if not name:
            raise ValueError("tile name must be non-empty")
        if name in seen:
            raise ValueError("duplicate tile name %r" % (name,))
        seen.add(name)
        width, height = source["width"], source["height"]
        if width != height:
            raise ValueError(
                "tile %r is %dx%d — sources must be square (one square image "
                "per tile)" % (name, width, height))
        if width < tileSize:
            raise ValueError(
                "tile %r is %dpx — sources must be at least %dpx per side "
                "(upscaling would fake detail)" % (name, width, tileSize))
        if len(source["pixels"]) != width * height * 4:
            raise ValueError("tile %r: pixel buffer is not RGBA %dx%d" % (name, width, height))

    count = len(tiles)
    if columns is None:
        columns = int(math.ceil(math.sqrt(count)))
    rows = int(math.ceil(count / columns))
    atlasWidth, atlasHeight = columns * tileSize, rows * tileSize
    atlas = bytearray(atlasWidth * atlasHeight * 4)

    manifest = {}
    for index, source in enumerate(tiles):
        cellX = (index % columns) * tileSize
        cellY = (index // columns) * tileSize
        pixels = source["pixels"]
        if source["width"] != tileSize:
            pixels = _resampleRgba(pixels, source["width"], tileSize)
        _blitRgba(atlas, atlasWidth, cellX, cellY, pixels, tileSize)
        manifest[source["name"]] = {"x": cellX, "y": cellY,
                                    "w": tileSize, "h": tileSize}

    return {"png": _encodePng(bytes(atlas), atlasWidth, atlasHeight),
            "manifest": manifest}


# ---------------------------------------------------------------------------
# Private helpers (serve generateAtlas)
# ---------------------------------------------------------------------------

def _blitRgba(atlas, atlasWidth, cellX, cellY, pixels, size):
    """Copy a size x size RGBA buffer into the atlas canvas at (cellX, cellY)."""
    rowBytes = size * 4
    for row in range(size):
        dest = ((cellY + row) * atlasWidth + cellX) * 4
        atlas[dest:dest + rowBytes] = pixels[row * rowBytes:(row + 1) * rowBytes]


def _areaWeights(srcSize, dstSize):
    """Per-output-index fractional-area weights over source indices."""
    scale = srcSize / dstSize
    table = []
    for dst in range(dstSize):
        lo, hi = dst * scale, (dst + 1) * scale
        entries = []
        src = int(lo)
        while src < hi and src < srcSize:
            entries.append((src, min(hi, src + 1) - max(lo, src)))
            src += 1
        total = sum(weight for _, weight in entries)
        table.append([(src, weight / total) for src, weight in entries])
    return table


def _resampleRgba(pixels, srcSize, dstSize):
    """Deterministic separable area-downsample of a square RGBA buffer."""
    xWeights = _areaWeights(srcSize, dstSize)
    yWeights = _areaWeights(srcSize, dstSize)
    srcRowBytes = srcSize * 4
    intermediate = []
    for row in range(srcSize):
        line = pixels[row * srcRowBytes:(row + 1) * srcRowBytes]
        outRow = []
        for entries in xWeights:
            r = g = b = a = 0.0
            for src, weight in entries:
                offset = src * 4
                r += line[offset] * weight
                g += line[offset + 1] * weight
                b += line[offset + 2] * weight
                a += line[offset + 3] * weight
            outRow.extend((r, g, b, a))
        intermediate.append(outRow)

    outPixels = bytearray(dstSize * dstSize * 4)
    dstRowBytes = dstSize * 4
    for dstRow, entries in enumerate(yWeights):
        for x in range(dstSize):
            r = g = b = a = 0.0
            for src, weight in entries:
                base = x * 4
                r += intermediate[src][base] * weight
                g += intermediate[src][base + 1] * weight
                b += intermediate[src][base + 2] * weight
                a += intermediate[src][base + 3] * weight
            base = dstRow * dstRowBytes + x * 4
            outPixels[base] = min(255, int(r + 0.5))
            outPixels[base + 1] = min(255, int(g + 0.5))
            outPixels[base + 2] = min(255, int(b + 0.5))
            outPixels[base + 3] = min(255, int(a + 0.5))
    return bytes(outPixels)


def _encodePng(rgba, width, height):
    """Encode an RGBA buffer as a deterministic 8-bit RGBA PNG (no ancillary
    chunks, fixed compression level)."""
    rowBytes = width * 4
    raw = b"".join(b"\x00" + rgba[row * rowBytes:(row + 1) * rowBytes]
                   for row in range(height))
    idat = zlib.compress(raw, 9)

    def chunk(tag, payload):
        return (struct.pack(">I", len(payload)) + tag + payload +
                struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (_PNG_SIGNATURE + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) +
            chunk(b"IEND", b""))


# ---------------------------------------------------------------------------
# Private helpers (serve _main: decoding input images)
# ---------------------------------------------------------------------------

def _decodePng(data):
    """Decode an 8-bit non-interlaced PNG into (rgba, width, height)."""
    if data[:8] != _PNG_SIGNATURE:
        raise ValueError("not a PNG file")
    pos, width, height = 8, None, None
    depth, color, interlace = None, None, None
    palette, transparency, idat = None, None, []
    while pos + 8 <= len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        tag = data[pos + 4:pos + 8]
        payload = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width, height, depth, color, comp, filt, interlace = struct.unpack(
                ">IIBBBBB", payload)
            if comp != 0 or filt != 0:
                raise ValueError("unsupported PNG compression/filter method")
            if interlace != 0:
                raise ValueError("interlaced PNG not supported — re-export "
                                 "without interlacing")
            if depth not in (1, 2, 4, 8):
                raise ValueError("%d-bit PNG not supported — re-export as "
                                 "8-bit" % depth)
            if color >= len(_PNG_CHANNELS) or _PNG_CHANNELS[color] == 0:
                raise ValueError("unsupported PNG color type %d" % color)
            if depth < 8 and color not in (0, 3):
                raise ValueError("%d-bit PNG with color type %d not supported "
                                 "— re-export as 8-bit" % (depth, color))
        elif tag == b"PLTE":
            palette = [tuple(payload[i:i + 3]) for i in range(0, len(payload), 3)]
        elif tag == b"tRNS":
            transparency = payload
        elif tag == b"IDAT":
            idat.append(payload)
        elif tag == b"IEND":
            break
    if width is None or height is None or color is None or depth is None or not idat:
        raise ValueError("PNG missing IHDR or IDAT")
    if width * height > _MAX_PIXELS:
        raise ValueError("PNG is %dx%d — refusing to decode more than %d pixels"
                         % (width, height, _MAX_PIXELS))

    channels = _PNG_CHANNELS[color]
    stride = (width * channels * depth + 7) // 8
    bytePerPixel = 1 if depth < 8 else channels
    raw = zlib.decompress(b"".join(idat))
    if len(raw) < (stride + 1) * height:
        raise ValueError("PNG pixel data is truncated")

    flat = bytearray(stride * height)
    prev = bytearray(stride)
    pos = 0
    for row in range(height):
        filterType = raw[pos]
        line = bytearray(raw[pos + 1:pos + 1 + stride])
        pos += 1 + stride
        if filterType == 1:
            for i in range(bytePerPixel, stride):
                line[i] = (line[i] + line[i - bytePerPixel]) & 0xFF
        elif filterType == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif filterType == 3:
            for i in range(stride):
                left = line[i - bytePerPixel] if i >= bytePerPixel else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif filterType == 4:
            for i in range(stride):
                left = line[i - bytePerPixel] if i >= bytePerPixel else 0
                upperLeft = prev[i - bytePerPixel] if i >= bytePerPixel else 0
                line[i] = (line[i] + _paeth(left, prev[i], upperLeft)) & 0xFF
        elif filterType != 0:
            raise ValueError("PNG scanline filter %d not supported" % filterType)
        flat[row * stride:(row + 1) * stride] = line
        prev = line

    return (_expandToRgba(flat, width, height, color, palette, transparency, depth),
            width, height)


def _paeth(left, upper, upperLeft):
    predictor = left + upper - upperLeft
    pa, pb, pc = abs(predictor - left), abs(predictor - upper), abs(predictor - upperLeft)
    if pa <= pb and pa <= pc:
        return left
    return upper if pb <= pc else upperLeft


def _expandToRgba(flat, width, height, color, palette, transparency, depth):
    """Expand a decoded scanline buffer (any supported depth) to RGBA bytes."""
    count = width * height
    out = bytearray(count * 4)
    if color == 6:
        out[:] = flat
        return bytes(out)
    if depth < 8:
        mask = (1 << depth) - 1
        perByte = 8 // depth

        def sample(index):
            return ((flat[index // perByte] >> (8 - depth * (index % perByte + 1)))
                    & mask)

        if color == 3:
            if palette is None:
                raise ValueError("indexed PNG missing PLTE")
            alpha = list(transparency) if transparency else []
            for i in range(count):
                paletteIndex = sample(i)
                entry = (palette[paletteIndex] if paletteIndex < len(palette)
                         else (0, 0, 0))
                out[i * 4], out[i * 4 + 1], out[i * 4 + 2] = entry
                out[i * 4 + 3] = (alpha[paletteIndex]
                                  if paletteIndex < len(alpha) else 255)
            return bytes(out)
        transparent = None
        if transparency and len(transparency) == 2:
            (transparent,) = struct.unpack(">H", transparency)
        for i in range(count):
            value = sample(i)
            gray = value * 255 // mask
            out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = gray
            out[i * 4 + 3] = 0 if value == transparent else 255
        return bytes(out)
    if color == 3:
        if palette is None:
            raise ValueError("indexed PNG missing PLTE")
        alpha = list(transparency) if transparency else []
        for i in range(count):
            index = flat[i]
            entry = palette[index] if index < len(palette) else (0, 0, 0)
            out[i * 4], out[i * 4 + 1], out[i * 4 + 2] = entry
            out[i * 4 + 3] = alpha[index] if index < len(alpha) else 255
        return bytes(out)
    if color == 2:
        transparent = None
        if transparency and len(transparency) == 6:
            transparent = struct.unpack(">HHH", transparency)
        for i in range(count):
            r, g, b = flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]
            out[i * 4], out[i * 4 + 1], out[i * 4 + 2] = r, g, b
            out[i * 4 + 3] = 0 if (r, g, b) == transparent else 255
        return bytes(out)
    if color == 4:
        for i in range(count):
            out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = flat[i * 2]
            out[i * 4 + 3] = flat[i * 2 + 1]
        return bytes(out)
    transparent = None
    if transparency and len(transparency) == 2:
        (transparent,) = struct.unpack(">H", transparency)
    for i in range(count):
        out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = flat[i]
        out[i * 4 + 3] = 0 if flat[i] == transparent else 255
    return bytes(out)


# ---------------------------------------------------------------------------
# _main — the dev tool's main.js: the only state and the only effects
# ---------------------------------------------------------------------------

def _rasterizeSvg(path, tileSize):
    """Rasterize a vector tile to PNG bytes at exactly tileSize x tileSize."""
    attempts = (["rsvg-convert", "-w", str(tileSize), "-h", str(tileSize), path],
                ["convert", "-background", "none", path,
                 "-resize", "%dx%d!" % (tileSize, tileSize), "png:-"])
    for command in attempts:
        try:
            result = subprocess.run(command, capture_output=True, check=True)
        except (OSError, subprocess.CalledProcessError):
            continue
        if result.stdout:
            return result.stdout
    raise ValueError("cannot rasterize %s — install rsvg-convert or ImageMagick"
                     % os.path.basename(path))


def _collectSources(sourceDir, tileSize):
    """Read every tile image in sourceDir into generateAtlas argument dicts."""
    entries = sorted(os.listdir(sourceDir))
    sources, skipped = [], []
    for entry in entries:
        path = os.path.join(sourceDir, entry)
        stem, ext = os.path.splitext(entry)
        if not os.path.isfile(path) or ext.lower() not in (".png", ".svg"):
            skipped.append(entry)
            continue
        try:
            with open(path, "rb") as handle:
                data = handle.read()
            if ext.lower() == ".svg":
                data = _rasterizeSvg(path, tileSize)
            pixels, width, height = _decodePng(data)
        except (OSError, ValueError) as error:
            raise ValueError("%s: %s" % (entry, error))
        sources.append({"name": stem, "pixels": pixels,
                        "width": width, "height": height})
    return sources, skipped


def _main(argv):
    parser = argparse.ArgumentParser(
        prog="generate_atlas.py",
        description="Pack dev/art/sprites/<tile-name>.png tiles into a sprite "
                    "atlas PNG plus a tile->rect JSON manifest.")
    parser.add_argument("source_dir", help="directory of per-tile source images")
    parser.add_argument("--tile-size", type=int, default=256,
                        help="atlas cell edge in pixels (default 256)")
    parser.add_argument("--columns", type=int, default=None,
                        help="grid width in tiles (default ceil(sqrt(n))); "
                             "use 8 for the game's state-packed atlas")
    parser.add_argument("--out", default="atlas.png",
                        help="atlas PNG output path (default atlas.png)")
    parser.add_argument("--manifest", default="atlas.json",
                        help="manifest JSON output path (default atlas.json)")
    args = parser.parse_args(argv)

    try:
        if not os.path.isdir(args.source_dir):
            raise ValueError("source directory not found: %s" % args.source_dir)
        sources, skipped = _collectSources(args.source_dir, args.tile_size)
        if skipped:
            print("skipped (not tile images): %s" % ", ".join(skipped))
        atlas = generateAtlas(sources, args.tile_size, args.columns)
        with open(args.out, "wb") as handle:
            handle.write(atlas["png"])
        with open(args.manifest, "w") as handle:
            handle.write(json.dumps(atlas["manifest"], sort_keys=True, indent=2))
            handle.write("\n")
    except (OSError, ValueError) as error:
        print("generate_atlas.py: %s" % error, file=sys.stderr)
        return 1

    columns = args.columns or int(math.ceil(math.sqrt(len(atlas["manifest"]))))
    print("atlas: %d tiles on a %d-column grid -> %s (%d bytes), manifest -> %s"
          % (len(atlas["manifest"]), columns, args.out, len(atlas["png"]),
             args.manifest))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
