#!/usr/bin/env python3
"""reference_graph.py — build the static file-reference graph of the repo.

For every file in the repository, compute the set of files that reference it
(inbound) and the set it references (outbound), then emit:

  * a machine-readable JSON graph (nodes tagged inside-game-dir /
    inside-dev-dir / other, edges as (from, to, kind), per-file counts), and
  * a human-readable summary table sorted by inbound-reference count
    descending.

References are found per language: ES-module import/require constructs,
dynamic script-loader path literals (this project loads its children via
`<script src>` path strings), HTML src/href attributes, CSS url()/@import,
C-style #include, Python imports, Lua/GDScript require/preload, plus
non-code references: asset-path literals, resource UIDs (uid://, resolved
through .uid/.import/.meta sidecars), scene/prefab links (res:// and
scene/prefab extensions) and path literals in manifests, configs, scripts
and docs.

Unresolved references are reported as warnings unless they match the
documented allowlist (external URLs, data URIs, node builtins, bare package
or stdlib module specifiers — scoped npm packages `@scope/name` included —
system #include, and patterns passed via --allowlist).  Non-warning kinds (path-literal, manifest-entry,
doc-mention) only record resolved hits and never warn.

Usage:  python3 dev/scripts/reference_graph.py [options]

Options:
  --root PATH           repository root (default: inferred from script location)
  --json-out PATH       JSON graph output (default: dev/reference_graph.json;
                        '-' writes to stdout)
  --summary-out PATH    summary table output (default: '-' = stdout)
  --allowlist PATH      extra allowlist: one fnmatch pattern per line matching
                        the raw reference specifier ('#' comments allowed)
  --exclude GLOB        extra directory names to skip (repeatable)
  --dev-dir PATH        directory tagged inside-dev-dir (default: dev)
  --fail-on-unresolved  exit 2 when non-allowlisted unresolved refs exist
  --quiet               omit the unresolved-ref warning block from the summary

Adding a new file type: register an extractor in EXTRACTORS (map the file
extension to a function returning (spec, kind, line) triples) and, if the
type needs custom resolution (res:// paths, UIDs, module names), teach
resolve_spec() about it.  String-literal kinds for unregistered types fall
out of the generic literal scanner automatically.

Exit codes: 0 = clean (or warnings allowed), 2 = --fail-on-unresolved with
unresolved refs beyond the allowlist, 1 = internal error.
"""

import argparse
import fnmatch
import json
import os
import re
import sys

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Directory names never walked (vendor / deps / VCS / build artifacts).
DEFAULT_EXCLUDE_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build", "out",
    "tmp", "temp", "__pycache__", ".venv", "venv", ".idea", ".vscode",
    ".cache", ".worktrees", "coverage", ".pytest_cache", ".mypy_cache",
    ".logs",
}

JS_EXTS = {".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"}
PY_EXTS = {".py"}
HTML_EXTS = {".html", ".htm"}
CSS_EXTS = {".css"}
C_EXTS = {".c", ".h", ".cc", ".cpp", ".hpp", ".hh"}
LUA_EXTS = {".lua"}
GD_EXTS = {".gd"}
SCENE_EXTS = {".tscn", ".tres", ".scn", ".unity", ".prefab", ".asset"}
DOC_EXTS = {".md", ".markdown", ".rst", ".txt"}
HASH_COMMENT_EXTS = {".sh", ".bash", ".conf", ".yml", ".yaml", ".toml",
                     ".cfg", ".ini", ".mk", ".gitignore", ".json"}
MANIFEST_EXTS = {".conf", ".yml", ".yaml", ".toml", ".cfg", ".ini", ".mk",
                 ".json", ".sh", ".bash"}
MANIFEST_NAMES = {"makefile", "gnumakefile", "dockerfile", "package.json",
                  "manifest", "manifest.txt", "manifest.json"}

ASSET_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
    ".ogg", ".mp3", ".wav", ".flac", ".m4a", ".aac",
    ".pak", ".zip", ".wasm", ".glb", ".gltf", ".fnt", ".ttf", ".otf", ".woff",
    ".woff2",
}

# Extensions tried when a specifier has none (module-style references).
RESOLVE_TRY_EXTS = ["", ".js", ".mjs", ".cjs", ".ts", ".json", ".py", ".html",
                    ".css", ".lua", ".gd"]
# Reference kinds that warn when they do not resolve.
WARN_KINDS = {
    "import", "dynamic-import", "require", "include", "script-src",
    "html-asset", "css-url", "script-load", "resource-uid", "scene-link",
    "python-import", "lua-require", "gd-load",
}

# Built-in allowlist categories (documented in dev/README.md): external URLs,
# data/blob URIs, node builtins, bare external specifiers, system includes.
URL_SCHEME_RE = re.compile(
    r"^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//|#)", re.ASCII)
NODE_BUILTINS = {
    "assert", "async_hooks", "buffer", "child_process", "cluster",
    "console", "constants", "crypto", "dgram", "diagnostics_channel", "dns",
    "domain", "events", "fs", "http", "http2", "https", "inspector", "module",
    "net", "os", "path", "perf_hooks", "process", "punycode", "querystring",
    "readline", "repl", "stream", "string_decoder", "timers", "tls", "tty",
    "url", "util", "v8", "vm", "worker_threads", "zlib",
}
PY_STDLIB = set(getattr(sys, "stdlib_module_names", ())) | {
    "os", "sys", "re", "json", "math", "time", "argparse", "pathlib",
    "subprocess", "shutil", "tempfile", "itertools", "functools", "typing",
    "collections", "dataclasses", "hashlib", "csv", "random", "datetime",
}

PATHISH_RE = re.compile(r"^[A-Za-z0-9_\-./ ]+$", re.ASCII)
STRONG_PATH_RE = re.compile(
    r"^(?:\./|\.\./|/)|[A-Za-z0-9_\- ]/(?:[A-Za-z0-9_\- ]+/)*[A-Za-z0-9_\- ]+\.[A-Za-z0-9]+$"
    r"|^[\w\-./ ]+\.(?:js|mjs|cjs|ts|jsx|tsx|json|html|css|py|sh|md|conf|yml|yaml|toml|lua|gd|tscn|tres|unity|prefab|pak|png|jpg|jpeg|gif|webp|svg|ogg|mp3|wav)$",
    re.ASCII)
ASSET_STR_RE = re.compile(r"\.(?:png|jpe?g|gif|webp|svg|ico|bmp|ogg|mp3|wav|"
                          r"flac|pak|zip|wasm|glb|gltf|ttf|otf|woff2?)$", re.ASCII)
UID_RE = re.compile(r"uid://[A-Za-z0-9_\-]+", re.ASCII)
RES_RE = re.compile(r"res://[A-Za-z0-9_\-./ ]+", re.ASCII)


# ---------------------------------------------------------------------------
# Lexers: yield static string literals with line numbers, skipping comments.
# ---------------------------------------------------------------------------

def lex_js_strings(text):
    """Return (strings, masked) for JS-like text.

    strings: list of (value, line) for static literals in CODE (comments
    skipped, template interpolations skipped).  masked: the text with
    comment regions blanked to spaces (line structure preserved) for
    structural regexes.
    """
    out = []
    masked = list(text)
    i, n, line = 0, len(text), 1
    state = "code"
    quote = ""
    start = 0
    start_line = 1
    prev_sig = ""
    _interp_depth = [0]
    while i < n:
        c = text[i]
        if c == "\n":
            line += 1
            if state == "line_comment":
                state = "code"
            elif state == "str":
                # Unterminated single-line literal: bail out leniently.
                # Template literals are legal across lines and continue.
                state = "code"
            i += 1
            continue
        if state == "code":
            nxt = text[i + 1] if i + 1 < n else ""
            if c == "/" and nxt == "/":
                for j in range(i, min(i + 2, n)):
                    masked[j] = " "
                state = "line_comment"
                i += 2
                continue
            if c == "/" and nxt == "*":
                masked[i] = masked[i + 1] = " "
                state = "block_comment"
                i += 2
                continue
            if c in "\"'":
                state = "str"
                quote = c
                start = i + 1
                start_line = line
                i += 1
                continue
            if c == "`":
                state = "template"
                quote = "`"
                start = i + 1
                start_line = line
                i += 1
                continue
            if c == "/" and (prev_sig in "(,=:[!&|?{};+" or prev_sig == ""):
                # Regex literal: skip to unescaped '/' outside char classes.
                i += 1
                in_class = False
                while i < n and text[i] != "\n":
                    ch = text[i]
                    if ch == "\\":
                        i += 2
                        continue
                    if ch == "[":
                        in_class = True
                    elif ch == "]":
                        in_class = False
                    elif ch == "/" and not in_class:
                        i += 1
                        break
                    i += 1
                prev_sig = "/"
                continue
            if not c.isspace():
                prev_sig = c
            i += 1
            continue
        if state == "line_comment":
            masked[i] = " "
            i += 1
            continue
        if state == "block_comment":
            if c == "*" and i + 1 < n and text[i + 1] == "/":
                masked[i] = masked[i + 1] = " "
                state = "code"
                i += 2
                continue
            masked[i] = " "
            i += 1
            continue
        # str / template / template_interp
        if state == "template_interp":
            if c == "{":
                _interp_depth[0] += 1
            elif c == "}":
                _interp_depth[0] -= 1
                if _interp_depth[0] == 0:
                    state = "template"
            i += 1
            continue
        if c == "\\":
            i += 2
            continue
        if (state == "str" and c == quote) or (state == "template" and c == "`"):
            value = text[start:i]
            if state == "template":
                value = _template_static_part(value)
                if value is not None:
                    out.append((value, start_line))
            else:
                out.append((value, start_line))
            state = "code"
            prev_sig = quote
            i += 1
            continue
        if state == "template" and c == "$" and i + 1 < n and text[i + 1] == "{":
            # Interpolation: not a static path literal; skip to its close.
            state = "template_interp"
            _interp_depth[0] = 1
            i += 2
            continue
        i += 1
    return out, "".join(masked)


def _template_static_part(value):
    """For template literals, keep only fully-static content (no ${...})."""
    if "${" in value:
        return None
    return value


def lex_py_strings(text):
    """Like lex_js_strings for Python (# comments, ' " and triple quotes)."""
    out = []
    masked = list(text)
    i, n, line = 0, len(text), 1
    state = "code"
    quote = ""
    triple = False
    start = 0
    start_line = 1
    while i < n:
        c = text[i]
        if c == "\n":
            line += 1
            if state == "line_comment":
                state = "code"
            elif state == "str" and not triple:
                state = "code"
            i += 1
            continue
        if state == "code":
            if c == "#":
                state = "line_comment"
                masked[i] = " "
                i += 1
                continue
            if c in "\"'":
                triple = (text[i:i + 3] == c * 3)
                quote = c
                if triple:
                    start = i + 3
                    i += 3
                else:
                    start = i + 1
                    i += 1
                state = "str"
                start_line = line
                continue
            i += 1
            continue
        if state == "line_comment":
            masked[i] = " "
            i += 1
            continue
        # str
        if c == "\\":
            i += 2
            continue
        if triple and text[i:i + 3] == quote * 3:
            out.append((text[start:i], start_line))
            state = "code"
            i += 3
            continue
        if not triple and c == quote:
            out.append((text[start:i], start_line))
            state = "code"
            i += 1
            continue
        i += 1
    return out, "".join(masked)


def lex_hash_strings(text):
    """Quoted strings outside '#' comments (sh/conf/yaml/toml/json-ish)."""
    out = []
    i, n, line = 0, len(text), 1
    state = "code"
    quote = ""
    start = 0
    start_line = 1
    while i < n:
        c = text[i]
        if c == "\n":
            line += 1
            if state == "line_comment":
                state = "code"
            elif state == "str":
                state = "code"
            i += 1
            continue
        if state == "code":
            if c == "#":
                state = "line_comment"
                i += 1
                continue
            if c in "\"'":
                state = "str"
                quote = c
                start = i + 1
                start_line = line
                i += 1
                continue
            i += 1
            continue
        if state == "line_comment":
            i += 1
            continue
        if c == "\\":
            i += 2
            continue
        if c == quote:
            out.append((text[start:i], start_line))
            state = "code"
            i += 1
            continue
        i += 1
    return out


# ---------------------------------------------------------------------------
# Generic literal classification
# ---------------------------------------------------------------------------

def is_pathish(s):
    return bool(s) and len(s) < 400 and "\n" not in s and "\\" not in s \
        and ("/" in s or ASSET_STR_RE.search(s) or s.endswith((".js", ".json",
             ".py", ".html", ".css", ".md", ".sh", ".conf"))) \
        and PATHISH_RE.match(s)


def is_strong(s):
    return bool(STRONG_PATH_RE.match(s))


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

class Resolver:
    def __init__(self, root, nodes):
        self.root = root
        self.nodes = nodes  # set of repo-relative posix paths
        self.by_basename = {}
        for p in nodes:
            self.by_basename.setdefault(p.rsplit("/", 1)[-1], []).append(p)

    def resolve(self, spec, from_path, uid_map):
        """Return repo-relative posix path or None."""
        spec = spec.strip()
        if not spec or "${" in spec:
            return None
        # UID references resolve through sidecar maps only.
        if spec.startswith("uid://"):
            return uid_map.get(spec)
        # res:// maps onto the repo root (Godot-style).
        if spec.startswith("res://"):
            spec = spec[len("res://"):]
        # Absolute host paths that point into the repo map onto it.
        root_abs = os.path.abspath(self.root)
        if spec.startswith(root_abs + os.sep):
            spec = os.path.relpath(spec, self.root)
        spec = spec.replace("\\", "/").lstrip("/")
        spec = spec.split("#")[0].split("?")[0]
        if not spec:
            return None
        candidates = []
        if spec.startswith("./") or spec.startswith("../"):
            base = from_path.rsplit("/", 1)[0] if "/" in from_path else ""
            candidates.append(_norm_join(base, spec))
        else:
            candidates.append(spec)
            if "/" in from_path:
                base = from_path.rsplit("/", 1)[0]
                candidates.append(_norm_join(base, spec))
        for cand in list(candidates):
            for ext in RESOLVE_TRY_EXTS:
                trial = cand + ext
                if trial in self.nodes:
                    return trial
                for suffix in ("/index.js", "/__init__.py"):
                    trial2 = trial.rstrip("/") + suffix
                    if trial2 in self.nodes:
                        return trial2
        # Bare basename fallback (docs name files without paths).
        if "/" not in spec and "." in spec:
            base = spec.rsplit("/", 1)[-1]
            hits = self.by_basename.get(base, [])
            if len(hits) == 1:
                return hits[0]
        return None


def _norm_join(base, spec):
    parts = []
    for seg in (base + "/" + spec).split("/"):
        if seg in ("", "."):
            continue
        if seg == "..":
            if parts:
                parts.pop()
            continue
        parts.append(seg)
    return "/".join(parts)


# ---------------------------------------------------------------------------
# Extractors: file text -> (spec, kind, line) triples
# ---------------------------------------------------------------------------

IMPORT_RE = re.compile(
    r"(?:^|[\s;}])(?:import|export)\s+(?:[\w${}*,\s]+\s+from\s+)?[\"']([^\"']+)[\"']"
    r"|import\s*\(\s*[\"']([^\"']+)[\"']\s*\)"
    r"|require\s*\(\s*[\"']([^\"']+)[\"']\s*\)", re.M)
HTML_REF_RE = re.compile(
    r"<(script|link|img|audio|video|source|iframe)\b[^>]*?\b(?:src|href)"
    r"\s*=\s*[\"']([^\"']+)[\"']", re.I)
CSS_URL_RE = re.compile(r"url\(\s*[\"']?([^\"')]+)[\"']?\s*\)")
CSS_IMPORT_RE = re.compile(r"@import\s+[\"']([^\"']+)[\"']")
C_INCLUDE_RE = re.compile(r"#\s*include\s+[\"<]([^\">]+)[\">]")
PY_IMPORT_RE = re.compile(
    r"^\s*(?:import\s+([\w.]+)|from\s+([.\w]+)\s+import)", re.M)
LUA_REQUIRE_RE = re.compile(r"(?:require|dofile)\s*\(?\s*[\"']([^\"']+)[\"']")
GD_LOAD_RE = re.compile(r"(?:preload|load)\s*\(\s*[\"']([^\"']+)[\"']")
GODOT_EXT_RES_RE = re.compile(r"path\s*=\s*[\"'](res://[^\"']+)[\"']")
BARE_TOKEN_RE = re.compile(r"(?:^|[\s=:\t])([A-Za-z0-9_\-./ ]+/(?:[A-Za-z0-9_\- ]+/)*[A-Za-z0-9_\- .]+\.[A-Za-z0-9]+)(?=$|[\s;,\t])")


def extract_js(text):
    strings, masked = lex_js_strings(text)
    out = []
    for m in IMPORT_RE.finditer(masked):
        spec = m.group(1) or m.group(2) or m.group(3)
        if spec is None:
            continue
        line = masked.count("\n", 0, m.start()) + 1
        if m.group(2) is not None:
            kind = "dynamic-import"
        elif m.group(3) is not None:
            kind = "require"
        else:
            kind = "import"
        out.append((spec, kind, line))
    for value, line in strings:
        out.append((value, "literal", line))
        # CSS inside template literals (injected stylesheets).
        for m in CSS_URL_RE.finditer(value):
            out.append((m.group(1).strip(), "css-url", line))
    return out


def extract_py(text):
    strings, masked = lex_py_strings(text)
    out = []
    for m in PY_IMPORT_RE.finditer(masked):
        line = masked.count("\n", 0, m.start()) + 1
        if m.group(1) is not None:
            # import foo.bar -> foo/bar.py
            spec = m.group(1).replace(".", "/") + ".py"
        else:
            # from .foo.bar import baz -> ../foo/bar.py (dots = depth)
            mod = m.group(2)
            dots = len(mod) - len(mod.lstrip("."))
            rest = mod.lstrip(".").replace(".", "/")
            spec = "../" * max(dots - 1, 0) \
                + (rest + ".py" if rest else "__init__.py")
        out.append((spec, "python-import", line))
    for value, line in strings:
        out.append((value, "literal", line))
    return out


def extract_html(text):
    out = []
    for m in HTML_REF_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        kind = "script-src" if m.group(1).lower() == "script" else "html-asset"
        out.append((m.group(2), kind, line))
    for m in CSS_URL_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(1).strip(), "css-url", line))
    return out


def extract_css(text):
    out = []
    for rx, kind in ((CSS_URL_RE, "css-url"), (CSS_IMPORT_RE, "css-url")):
        for m in rx.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            out.append((m.group(1).strip(), kind, line))
    return out


def extract_c(text):
    out = []
    for m in C_INCLUDE_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        spec = m.group(1)
        kind = "include" if '"' in m.group(0) else "include-system"
        out.append((spec, kind, line))
    for value, line in lex_hash_strings(text):
        out.append((value, "literal", line))
    return out


def extract_lua(text):
    out = []
    for m in LUA_REQUIRE_RE.finditer(text):
        line = masked_line(text, m.start())
        spec = m.group(1)
        # Lua module names use dots: "lib.dep" -> "lib/dep"
        if "/" not in spec and not spec.startswith("."):
            spec = spec.replace(".", "/")
        out.append((spec, "lua-require", line))
    for value, line in lex_hash_strings(text):
        out.append((value, "literal", line))
    return out


def extract_gd(text):
    out = []
    for m in GD_LOAD_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(1), "gd-load", line))
    for m in GODOT_EXT_RES_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(1), "scene-link", line))
    for value, line in lex_hash_strings(text):
        out.append((value, "literal", line))
    return out


def extract_scene(text):
    out = []
    for m in GODOT_EXT_RES_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(1), "scene-link", line))
    for m in UID_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(0), "resource-uid", line))
    for value, line in lex_hash_strings(text):
        out.append((value, "literal", line))
    return out


def extract_hashish(text):
    out = []
    for value, line in lex_hash_strings(text):
        out.append((value, "literal", line))
    for m in BARE_TOKEN_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(1).strip(), "literal", line))
    return out


def extract_md(text):
    out = []
    for m in re.finditer(r"`([^`\n]+)`", text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(1), "literal", line))
    for m in re.finditer(r"[\"']([^\"'\n]+)[\"']", text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(1), "literal", line))
    for m in UID_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(0), "resource-uid", line))
    return out


def extract_uids_only(text):
    out = []
    for m in UID_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        out.append((m.group(0), "resource-uid", line))
    for value, line in lex_hash_strings(text):
        out.append((value, "literal", line))
    return out


EXTRACTORS = {}
for _e in JS_EXTS:
    EXTRACTORS[_e] = extract_js
for _e in PY_EXTS:
    EXTRACTORS[_e] = extract_py
for _e in HTML_EXTS:
    EXTRACTORS[_e] = extract_html
for _e in CSS_EXTS:
    EXTRACTORS[_e] = extract_css
for _e in C_EXTS:
    EXTRACTORS[_e] = extract_c
for _e in LUA_EXTS:
    EXTRACTORS[_e] = extract_lua
for _e in GD_EXTS:
    EXTRACTORS[_e] = extract_gd
for _e in SCENE_EXTS:
    EXTRACTORS[_e] = extract_scene
for _e in HASH_COMMENT_EXTS:
    EXTRACTORS.setdefault(_e, extract_hashish)
for _e in DOC_EXTS:
    EXTRACTORS[_e] = extract_md
EXTRACTORS[".tscn"] = extract_scene
EXTRACTORS[".tres"] = extract_scene


# ---------------------------------------------------------------------------
# Kind classification for generic string literals
# ---------------------------------------------------------------------------

def literal_kind(src_path, target):
    src_ext = os.path.splitext(src_path)[1].lower()
    tgt_ext = os.path.splitext(target)[1].lower()
    src_base = src_path.rsplit("/", 1)[-1].lower()
    if tgt_ext in SCENE_EXTS:
        return "scene-link"
    if tgt_ext in ASSET_EXTS:
        return "asset-path"
    if src_ext in DOC_EXTS:
        return "doc-mention"
    if tgt_ext in JS_EXTS and src_ext in JS_EXTS:
        return "script-load"
    if src_ext in MANIFEST_EXTS or src_base in MANIFEST_NAMES:
        return "manifest-entry"
    return "path-literal"


# ---------------------------------------------------------------------------
# Graph building
# ---------------------------------------------------------------------------

def tag_for(path, dev_dir):
    if path == dev_dir or path.startswith(dev_dir + "/"):
        return "inside-dev-dir"
    if path.rsplit("/", 1)[-1].startswith("."):
        return "other"
    return "inside-game-dir"


def build_uid_map(nodes, read_text):
    """Map uid:// tokens to files via .uid sidecars and .import/.meta files."""
    uid_map = {}
    for p in sorted(nodes):
        base = p.rsplit("/", 1)[-1]
        if base.endswith(".uid"):
            uid = read_text(p).strip().split()[0] if read_text(p).strip() else ""
            if uid.startswith("uid://"):
                uid_map[uid] = p[: -len(".uid")]
        elif base.endswith(".import") or base.endswith(".meta"):
            text = read_text(p)
            uids = UID_RE.findall(text)
            target = None
            m = re.search(r"path\s*=\s*[\"']([^\"']+)[\"']", text)
            if m:
                target = m.group(1)
            else:
                target = p[: -len(".import")] if base.endswith(".import") \
                    else p[: -len(".meta")]
            for uid in uids:
                uid_map.setdefault(uid, target)
    return uid_map


def looks_external(spec, kind):
    """Built-in allowlist categories (documented in dev/README.md)."""
    if not spec:
        return True
    if URL_SCHEME_RE.match(spec):
        return True
    if kind == "include-system":
        return True
    if kind in ("import", "dynamic-import", "require", "lua-require",
                "python-import"):
        if not spec.startswith("."):
            if "/" not in spec or spec.startswith("@"):
                # Bare module specifier: node builtin, stdlib or external
                # package — including scoped npm packages and their subpath
                # imports (`@scope/name`, `@scope/name/…`; REFERENCE_POLICY.md
                # §4.10). Only relative (`./x`) and root-relative (`/x`)
                # specifiers are repo paths.
                return True
        root_mod = spec.split("/")[0].replace(".py", "").split(".")[0]
        return kind == "python-import" and root_mod in PY_STDLIB
    return False


def analyze(root, dev_dir, extra_excludes, allow_patterns, out_paths):
    nodes = set()
    ext_counts = {}
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        if rel_dir == ".":
            rel_dir = ""
        dirnames[:] = sorted(
            d for d in dirnames
            if d not in DEFAULT_EXCLUDE_DIRS
            and not any(fnmatch.fnmatch(rel_dir + "/" + d if rel_dir else d, pat)
                        for pat in extra_excludes))
        for fn in filenames:
            rel = (rel_dir + "/" + fn if rel_dir else fn).replace(os.sep, "/")
            if rel in out_paths:
                continue  # never scan our own output files
            nodes.add(rel)
            ext_counts[os.path.splitext(fn)[1].lower()] = \
                ext_counts.get(os.path.splitext(fn)[1].lower(), 0) + 1

    cache = {}

    def read_text(rel):
        if rel not in cache:
            with open(os.path.join(root, rel), "rb") as fh:
                raw = fh.read()
            if b"\x00" in raw[:8192]:
                cache[rel] = None  # binary
            else:
                cache[rel] = raw.decode("utf-8", errors="replace")
        return cache[rel]

    uid_map = build_uid_map(nodes, read_text)
    resolver = Resolver(root, nodes)

    edge_map = {}   # (from, to, kind) -> {"count": n, "lines": [...], "specs": set()}
    unresolved = []
    allowlisted_unresolved = []
    skipped_external = 0

    for src in sorted(nodes):
        ext = os.path.splitext(src)[1].lower()
        extractor = EXTRACTORS.get(ext)
        text = read_text(src)
        if text is None:
            continue
        if extractor is None:
            extractor = extract_uids_only if UID_RE.search(text) else extract_hashish
        base = os.path.basename(src).lower()
        try:
            raw_refs = extractor(text)
        except Exception as exc:  # defensive: one bad file must not kill the run
            unresolved.append({"from": src, "kind": "internal-error",
                               "spec": "", "line": 0,
                               "reason": "extractor failed: %s" % exc,
                               "allowlisted": False})
            continue
        # Resource UIDs may appear in any file type; scan uniformly.
        raw_refs = list(raw_refs) + [
            (m.group(0), "resource-uid", masked_line(text, m.start()))
            for m in UID_RE.finditer(text)]
        seen = set()
        for spec, kind, line in raw_refs:
            if (spec, kind, line) in seen:
                continue
            seen.add((spec, kind, line))
            if kind == "literal":
                if not is_pathish(spec):
                    continue
                target = resolver.resolve(spec, src, uid_map)
                if target is None or target == src:
                    if target == src:
                        continue
                    if is_strong(spec) and ext in JS_EXTS and spec.endswith(".js"):
                        kind = "script-load"
                    else:
                        continue  # generic literals never warn
                else:
                    kind = literal_kind(src, target)
            if kind == "include-system":
                skipped_external += 1
                continue
            target = resolver.resolve(spec, src, uid_map)
            if target is None:
                if kind not in WARN_KINDS:
                    continue
                if looks_external(spec, kind):
                    skipped_external += 1
                    continue
                entry = {"from": src, "kind": kind, "spec": spec, "line": line,
                         "reason": "no file in the repository matches",
                         "allowlisted": False}
                for pat in allow_patterns:
                    if fnmatch.fnmatch(spec, pat):
                        entry["allowlisted"] = True
                        break
                (allowlisted_unresolved if entry["allowlisted"]
                 else unresolved).append(entry)
                continue
            if target == src:
                continue
            key = (src, target, kind)
            row = edge_map.setdefault(key, {"count": 0, "lines": [], "specs": set()})
            row["count"] += 1
            if line not in row["lines"]:
                row["lines"].append(line)
            row["specs"].add(spec)

    edges = []
    for (src, target, kind) in sorted(edge_map):
        row = edge_map[(src, target, kind)]
        edges.append({"from": src, "to": target, "kind": kind,
                      "count": row["count"], "lines": sorted(row["lines"]),
                      "specs": sorted(row["specs"])})

    inbound = {p: set() for p in nodes}
    outbound = {p: set() for p in nodes}
    inbound_edges = {p: 0 for p in nodes}
    outbound_edges = {p: 0 for p in nodes}
    for e in edges:
        inbound[e["to"]].add(e["from"])
        outbound[e["from"]].add(e["to"])
        inbound_edges[e["to"]] += e["count"]
        outbound_edges[e["from"]] += e["count"]

    node_rows = []
    for p in sorted(nodes):
        node_rows.append({
            "path": p,
            "tag": tag_for(p, dev_dir),
            "inbound": len(inbound[p]),
            "outbound": len(outbound[p]),
            "inbound_refs": inbound_edges[p],
            "outbound_refs": outbound_edges[p],
        })

    kind_counts = {}
    for e in edges:
        kind_counts[e["kind"]] = kind_counts.get(e["kind"], 0) + e["count"]

    return {
        "schema": "snd-reference-graph/1",
        "root": os.path.abspath(root),
        "totals": {
            "nodes": len(nodes),
            "edges": len(edges),
            "refs": sum(e["count"] for e in edges),
            "unresolved": len(unresolved),
            "unresolved_allowlisted": len(allowlisted_unresolved),
            "skipped_external": skipped_external,
        },
        "languages": dict(sorted(ext_counts.items())),
        "kinds": dict(sorted(kind_counts.items())),
        "nodes": node_rows,
        "edges": edges,
        "unresolved": sorted(unresolved + allowlisted_unresolved,
                             key=lambda u: (u["from"], u["line"], u["spec"])),
    }


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def render_summary(graph, root_label, quiet):
    t = graph["totals"]
    lines = []
    lines.append("Reference graph summary — %s" % root_label)
    lines.append("nodes: %d   edges: %d   refs: %d" %
                 (t["nodes"], t["edges"], t["refs"]))
    if graph["kinds"]:
        lines.append("by kind: " + "  ".join(
            "%s %d" % (k, v) for k, v in graph["kinds"].items()))
    lines.append("unresolved: %d beyond the allowlist   "
                 "(allowlisted: %d, external/builtin skipped: %d)" %
                 (t["unresolved"], t["unresolved_allowlisted"],
                  t["skipped_external"]))
    lines.append("")
    lines.append("  IN   OUT  TAG              PATH")
    rows = sorted(graph["nodes"],
                  key=lambda r: (-r["inbound"], -r["outbound"], r["path"]))
    for r in rows:
        lines.append("%4d %4d  %-15s  %s" %
                     (r["inbound"], r["outbound"], r["tag"], r["path"]))
    if graph["unresolved"] and not quiet:
        lines.append("")
        lines.append("Unresolved references:")
        for u in graph["unresolved"]:
            flag = " [allowlisted]" if u["allowlisted"] else ""
            lines.append("  %s:%d: %s %r%s — %s" %
                         (u["from"], u["line"], u["kind"], u["spec"], flag,
                          u["reason"]))
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def default_root():
    here = os.path.dirname(os.path.abspath(__file__))
    parent = os.path.dirname(here)
    if os.path.basename(parent) == "dev":
        return os.path.dirname(parent)
    return parent


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Build the static file-reference graph of the repository.")
    ap.add_argument("--root", default=None,
                    help="repository root (default: inferred)")
    ap.add_argument("--json-out", default="dev/reference_graph.json",
                    help="JSON graph output path ('-' = stdout)")
    ap.add_argument("--summary-out", default="-",
                    help="summary table output path ('-' = stdout)")
    ap.add_argument("--allowlist", default=None,
                    help="file of fnmatch patterns for allowed unresolved specs")
    ap.add_argument("--exclude", action="append", default=[],
                    help="extra directory glob(s) to skip (repeatable)")
    ap.add_argument("--dev-dir", default="dev",
                    help="directory tagged inside-dev-dir (default: dev)")
    ap.add_argument("--fail-on-unresolved", action="store_true",
                    help="exit 2 when non-allowlisted unresolved refs exist")
    ap.add_argument("--quiet", action="store_true",
                    help="omit the unresolved-ref warning block")
    args = ap.parse_args(argv)

    if args.json_out == "-" and args.summary_out == "-":
        ap.error("at most one of --json-out/--summary-out may be '-'")

    root = os.path.abspath(args.root or default_root())
    if not os.path.isdir(root):
        print("reference_graph: root is not a directory: %s" % root,
              file=sys.stderr)
        return 1

    allow_patterns = []
    if args.allowlist:
        with open(args.allowlist, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#"):
                    allow_patterns.append(line)

    out_paths = set()
    for value in (args.json_out, args.summary_out):
        if value and value != "-":
            rel = os.path.relpath(os.path.abspath(value), root)
            if not rel.startswith(".."):
                out_paths.add(rel.replace(os.sep, "/"))

    graph = analyze(root, args.dev_dir, args.exclude, allow_patterns, out_paths)

    if args.json_out == "-":
        json.dump(graph, sys.stdout, indent=2, sort_keys=False)
        sys.stdout.write("\n")
    else:
        dest = args.json_out
        os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as fh:
            json.dump(graph, fh, indent=2, sort_keys=False)
            fh.write("\n")

    summary = render_summary(graph, root, args.quiet)
    if args.summary_out == "-":
        sys.stdout.write(summary)
    else:
        dest = args.summary_out
        os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as fh:
            fh.write(summary)

    verdict = ("reference_graph: %d nodes, %d edges, %d unresolved beyond the "
               "allowlist" % (graph["totals"]["nodes"],
                              graph["totals"]["edges"],
                              graph["totals"]["unresolved"]))
    print(verdict, file=sys.stderr)
    if args.fail_on_unresolved and graph["totals"]["unresolved"]:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
