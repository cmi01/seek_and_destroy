#!/usr/bin/env python3
"""reference_audit.py — machine-check the repo's encapsulation rules.

Implements the "reference audit" required by docs/GUIDING_PRINCIPLES.md §1:
"a file may be known only by its direct parent" and "children expose no
globals" (§1.5), checked over every .js file in the tree against the
hard-coded ownership map below (run with --map to print it).

Checks (each violation printed as 'file:line: message'; exit code 1 if any):
 1. A child's filename must not appear in any .js file other than its parent
    and itself (plus, by §1.1 construction, its own children).  Both the
    filename ("uiRenderer.js") and — for CamelCase module names — the bare
    module name ("uiRenderer") count as naming the file.  Filename mentions
    in a file's leading header banner are allowed — every child names its
    owner there by convention; code and mid-file comments naming a
    sibling/cousin/grandparent are reported.
 2. Every symbol a child exposes must not appear as a whole word in any .js
    file other than its parent and itself.  A claimed symbol is ONLY:
      (a) an object-literal KEY in the registration payload (the object
          passed to Game._registerModule / SoundEngine._registerModule /
          Graphics._registerLayer / the transient _register) or in the
          factory's top-level returned object;
      (b) a FUNCTION NAME defined in that payload/returned object (method
          shorthand, `name: function` / `name: () =>`, or `key: fnName`
          where fnName is a function defined in the same file);
      (c) the registered factory-global name itself (Game, SoundEngine,
          Graphics, Inputs, InputInterface, ... — top-level const factories
          and window./globalThis./g. assignments).
    Nothing else is ever claimed: JS keywords, literals (true/false/null/
    undefined/this) and standard builtins (Object/Math/JSON/console/...) are
    hard-excluded via the STOPWORDS set, and every claimed name must be a
    valid identifier.  Not reported as references:
      - transient load registrars (X._register / g.<Name> lines, §1.5);
      - uses through parent-built pipeline handles — property accesses whose
        receiver is a parent-injected parameter (env./bridge./cmd./ctxObj./
        D./AUDIO./deps./state./payload. — or an allowed owner global);
      - definition positions: object-literal key definitions, method
        definitions, function/method parameter lists, destructuring
        patterns, arrow parameters;
      - bare uses of names the file itself declares as local variables or
        functions (shadowing);
      - data/*_DATA.js field names as claims: pure data fields are blessed
        plain-data names that travel inside DTOs (§2 "interfaces transfer
        plain data objects"), not referenceable module surface (procedural
        mirrors, e.g. rules.js getters, still claim their names).
    When several files claim the same symbol word, a reference is accepted if
    any claimant allows the referencing file.
 3. No 'window.', 'localStorage', 'document.', 'new Image' in child files.
    main.js and graphics/graphics.js may use document/window; the four core
    systems are exempt from the pure-function rules (checks 3 and 4).  A
    parent's inline child-loader (§1.4: document.createElement("script") and
    friends) is sanctioned.  graphics/objectRenderer.js is a known violator
    today — reported, not excused.
 4. data/*_DATA.js files must contain no 'function' or '=>' outside their
    registration call.

For checks 2-4, matches inside comments and string literals are excluded
where trivially detectable (a '//' tail, a '/* */' block, or a quoted string
found by the same scanner).  Check 1 counts raw text — a child's name in
another file's error string is still a reference (cf. the sfx.js/music.js
error strings).

Usage:  python3 scripts/reference_audit.py [--map]
"""

import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- Ownership map (child -> direct parent) --------------------------------
PARENT_OF = {
    "interfaces/inputInterface.js": "main.js",
    "interfaces/graphicsInterface.js": "main.js",
    "interfaces/audioInterface.js": "main.js",
    "core/game.js": "main.js",
    "graphics/graphics.js": "main.js",
    "core/inputs.js": "main.js",
    "audio/sounds.js": "main.js",
    "data/rules_DATA.js": "core/game.js",
    "data/campaign_DATA.js": "core/game.js",
    "data/beginningGameState_DATA.js": "core/game.js",
    "data/themes_DATA.js": "core/game.js",
    "core/gameState.js": "core/game.js",
    "core/themes.js": "core/game.js",
    "core/rules.js": "core/game.js",
    "core/hud.js": "core/game.js",
    "core/sectorGenerator.js": "core/game.js",
    "ai/ai.js": "core/game.js",
    "tests/gameTests.js": "core/game.js",
    "data/aiPriorities_DATA.js": "ai/ai.js",
    "ai/aiTurnWorkflow.js": "ai/ai.js",
    "ai/aiLogic.js": "ai/aiTurnWorkflow.js",
    "ai/aiStateQueries.js": "ai/aiLogic.js",
    "ai/aiThreatScorer.js": "ai/aiLogic.js",
    "ai/aiUnitPlanner.js": "ai/aiLogic.js",
    "ai/aiFleetCommander.js": "ai/aiLogic.js",
    "data/audio_DATA.js": "audio/sounds.js",
    "audio/sfx.js": "audio/sounds.js",
    "audio/music.js": "audio/sounds.js",
    "graphics/backgroundRenderer.js": "graphics/graphics.js",
    "graphics/objectRenderer.js": "graphics/graphics.js",
    "graphics/vfx.js": "graphics/graphics.js",
    "graphics/uiRenderer.js": "graphics/graphics.js",
    "tests/graphicsTests.js": "graphics/graphics.js",
}

# §1.1 interface carve-out: an interface may also be known by (and may know)
# the two cores it sits between.
ADJACENT_CORES = {
    "interfaces/inputInterface.js": {"core/inputs.js", "core/game.js"},
    "interfaces/graphicsInterface.js": {"core/game.js", "graphics/graphics.js"},
    "interfaces/audioInterface.js": {"core/game.js", "audio/sounds.js"},
}

CORES = {"main.js", "core/game.js", "core/inputs.js",
         "graphics/graphics.js", "audio/sounds.js"}
DOC_WINDOW_ALLOWED = {"main.js", "graphics/graphics.js"}
GLOBAL_TOKENS = ("window.", "localStorage", "document.", "new Image")
# sanctioned §1.4 inline child-loader lines inside a parent's _loadScripts()
LOADER_LINE_RE = re.compile(r"createElement\(\s*['\"]script|"
                            r"appendChild\(\s*[\w$]+\s*\)|\.on(?:load|error)\s*=")

REG_CALL_RE = re.compile(r"\._register(?:Module|Layer)?\s*\(\s*(['\"])([^'\"]*)\1\s*,")
IDENT_RE = re.compile(r"[A-Za-z_$][\w$]*")
KEYWORD_NAMES = {"if", "for", "while", "switch", "catch", "return", "do",
                 "else", "with", "function", "typeof", "new", "delete"}

# Names that can never be claimed symbols: JS keywords, literals, and the
# standard built-in globals.  A claimed symbol must be a valid identifier and
# must NOT appear here (requirement: zero builtin/keyword/literal claims).
STOPWORDS = frozenset("""
if else for while do switch case default break continue return function const
let var typeof instanceof new delete void in of this class extends super static
get set async await yield throw try catch finally with debugger export import
from as
true false null undefined NaN Infinity arguments
Object Array Math JSON console Boolean Number String Symbol Map Set WeakMap
WeakSet Promise Uint8Array Uint16Array Uint32Array Int8Array Int16Array
Int32Array Float32Array Float64Array ArrayBuffer SharedArrayBuffer DataView
Date RegExp Error TypeError RangeError SyntaxError ReferenceError EvalError
URIError Function Proxy Reflect parseInt parseFloat isNaN isFinite decodeURI
decodeURIComponent encodeURI encodeURIComponent escape unescape eval globalThis
window document self top parent navigator location history screen localStorage
sessionStorage requestAnimationFrame cancelAnimationFrame setTimeout
clearTimeout setInterval clearInterval queueMicrotask structuredClone
performance alert confirm prompt fetch Request Response Headers URL
URLSearchParams TextEncoder TextDecoder atob btoa crypto CustomEvent Event
EventTarget Image Audio AudioContext XMLHttpRequest MutationObserver
ResizeObserver IntersectionObserver getComputedStyle matchMedia devicePixelRatio
addEventListener removeEventListener require module exports
""".split())


def valid_name(name):
    return bool(IDENT_RE.fullmatch(name)) and name not in STOPWORDS


# ---- text plumbing ---------------------------------------------------------
def list_js_files():
    out = []
    for dirpath, _dirs, names in os.walk(REPO_ROOT):
        rel = os.path.relpath(dirpath, REPO_ROOT)
        if rel == "scripts" or rel.startswith("scripts" + os.sep):
            continue
        for n in names:
            if n.endswith(".js"):
                out.append(os.path.normpath(os.path.join(rel, n)))
    return sorted(out)


def read(path):
    with open(os.path.join(REPO_ROOT, path), encoding="utf-8") as fh:
        return fh.read()


def blank_spans(text, kind):
    """Blank comment ('c') and/or string ('x') spans, preserving offsets.

    Strings are consumed first so a '//' inside a string is not mistaken
    for a comment (hud.js templates contain ' // ').
    """
    out, i, n = list(text), 0, len(text)
    while i < n:
        if text[i] in "\"'`":
            j = skip_string(text, i)
            if kind == "x":
                out[i:j] = " " * (j - i)
            i = j
        elif kind == "c" and text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            out[i:j] = " " * (j - i)
            i = j
        elif kind == "c" and text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out[i:j] = " " * (j - i)
            i = j
        else:
            i += 1
    return "".join(out)


def header_line_count(lines):
    """Size of the leading header banner (comments, blanks, "use strict";)."""
    n = 0
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or s.startswith("//") or s in ('"use strict";', "'use strict';"):
            n = i + 1
        else:
            break
    return n

# ---- JS scanning helpers (brace matching on comment-stripped text) ---------
def skip_string(t, i):
    if t[i] not in "\"'`":
        return i
    q, i = t[i], i + 1
    while i < len(t):
        if t[i] == "\\":
            i += 2
        elif t[i] == q:
            return i + 1
        elif q != "`" and t[i] == "\n":
            return i
        else:
            i += 1
    return i


def match_pair(t, i):
    """Index after the bracket matching t[i] ('{', '(' or '[')."""
    open_c, close_c = t[i], {"(": ")", "{": "}", "[": "]"}[t[i]]
    depth = 0
    while i < len(t):
        j = skip_string(t, i)
        if j != i:
            i = j
            continue
        if t[i] == open_c:
            depth += 1
        elif t[i] == close_c:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return i


def scan_depths(t, positions):
    """Bracket depth just before each offset in `positions` (single pass)."""
    want = set(positions)
    out, depth, i, n = {}, 0, 0, len(t)
    while i < n:
        j = skip_string(t, i)
        if j != i:
            i = j
            continue
        if i in want:
            out[i] = depth
        c = t[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        i += 1
    return out


def split_params(text):
    out = set()
    for part in text.split(","):
        part = part.strip().strip("{}[]").split("=")[0].strip().split(":")[0].strip()
        if IDENT_RE.fullmatch(part) and part not in KEYWORD_NAMES:
            out.add(part)
    return out


def fn_def_names(text):
    """Every name the file defines as a function (any scope)."""
    out = set()
    for m in re.finditer(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", text):
        out.add(m.group(1))
    for m in re.finditer(
            r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*"
            r"(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)",
            text):
        out.add(m.group(1))
    return out


def object_surface(t, open_idx, fn_names):
    """(keys, fn-keys, fn-params, end) of the object literal at '{' open_idx.

    keys: every object-literal key (the exposed field name).
    fn-keys: keys whose value is a function (method shorthand or
             `name: function` / `name: () =>`), plus `key: fnName` pairs
             where fnName is a function defined in this file (the closure
             function is exposed under that key).
    """
    keys, fn_keys, params, segs = set(), set(), set(), []
    depth, i, seg_start = 1, open_idx + 1, open_idx + 1
    while i < len(t) and depth:
        j = skip_string(t, i)
        if j != i:
            i = j
            continue
        c = t[i]
        if c in "{[(":
            depth += 1
        elif c in "})]":
            depth -= 1
            if depth == 0:
                segs.append(t[seg_start:i])
                break
        elif c == "," and depth == 1:
            segs.append(t[seg_start:i])
            seg_start = i + 1
        i += 1
    key_re = re.compile(r"\s*(?:\.\.\.)?(?:(?:async|get|set|static)\s+)*\*?\s*"
                        r"(?:([A-Za-z_$][\w$]*)|(['\"])([^'\"]+)\2)\s*(?::|\(|\)|$)")
    val_re = re.compile(r":\s*([A-Za-z_$][\w$]*)\s*$")
    fn_val_re = re.compile(r":\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)")
    param_res = (re.compile(r"^\s*(?:async\s+)?[\w$]+\s*\(([^)]*)\)"),
                 re.compile(r"^\s*\(([^)]*)\)\s*=>"),
                 re.compile(r"^\s*([A-Za-z_$][\w$]*)\s*=>"))
    for seg in segs:
        m = key_re.match(seg)
        if m:
            key = m.group(1) or m.group(3)
            if valid_name(key):
                keys.add(key)
                after_key = seg[m.end(1) or m.end(3):]
                if after_key.lstrip().startswith("(") or fn_val_re.search(seg):
                    fn_keys.add(key)          # method shorthand / fn value
                v = val_re.search(seg)
                if v and v.group(1) in fn_names and valid_name(v.group(1)):
                    keys.add(v.group(1))      # key: fnName — the fn is exposed
                    fn_keys.add(v.group(1))
        for pre in param_res:
            pm = pre.match(seg)
            if pm:
                params |= split_params(pm.group(1))
                break
    return keys, fn_keys, params, i + 1


def return_surface(t, k, end, fn_names):
    """Claimable keys of the value returned by `return <value>` at t[k:end]."""
    keys = set()
    while k < end and t[k] in " \t\r\n":
        k += 1
    if k >= end:
        return keys
    if t[k] == "{":
        kk, _fk, _p, _e = object_surface(t, k, fn_names)
        return kk
    if t[k] == "(":
        close = match_pair(t, k)
        inner = t[k + 1:close - 1].strip()
        if IDENT_RE.fullmatch(inner):
            return return_surface(t, k + 1, close - 1, fn_names)
        return keys
    m = IDENT_RE.match(t, k)
    if not m:
        return keys
    name, k2 = m.group(0), m.end()
    while k2 < end and t[k2] in " \t\r\n":
        k2 += 1
    if k2 < end and t[k2] == ".":
        # e.g. `return Object.freeze({...})` — take the frozen literal's keys
        paren = t.find("(", k2)
        if paren > 0:
            p = paren + 1
            while p < end and t[p] in " \t\r\n":
                p += 1
            if p < end and t[p] == "{":
                kk, _fk, _p, _e = object_surface(t, p, fn_names)
                keys |= kk
        return keys
    if k2 < end and t[k2] in "([":
        return keys               # a call / index — returned value unknown
    if name in fn_names and valid_name(name):
        keys.add(name)            # `return getAIAction` — fn surface
    b = re.search(r"\b(?:const|let|var)\s+" + re.escape(name) + r"\s*=\s*\{", t)
    if b:                         # `return api` — resolve the api literal
        kk, _fk, _p, _e = object_surface(t, b.end() - 1, fn_names)
        keys |= kk
    return keys


def top_level_returns(t, body_start, body_end, fn_names):
    """Keys exposed by `return` statements at the top level of a body."""
    keys = set()
    depth, i = 1, body_start + 1
    while i < body_end - 1:
        j = skip_string(t, i)
        if j != i:
            i = j
            continue
        c = t[i]
        if c in "{[(":
            depth += 1
        elif c in "})]":
            depth -= 1
        elif depth == 1 and t.startswith("return", i) and \
                not (i and (t[i - 1].isalnum() or t[i - 1] in "_$")):
            k = i + 6
            if k >= body_end or not (t[k].isalnum() or t[k] in "_$"):
                keys |= return_surface(t, k, body_end, fn_names)
        i += 1
    return keys


def find_arrow(t, i, end):
    depth = 0
    while i < end - 1:
        j = skip_string(t, i)
        if j != i:
            i = j
            continue
        if t[i] in "([{":
            depth += 1
        elif t[i] in ")]}":
            depth -= 1
        elif depth == 0 and t.startswith("=>", i):
            return i
        i += 1
    return -1


def factory_body(t, i):
    """(body_start, fparams) of the factory expression at i, or (-1, set())."""
    while i < len(t) and t[i] in " \t\r\n":
        i += 1
    body, fparams = -1, set()
    if i < len(t) and t[i] == "(":
        close = match_pair(t, i)
        rest = close
        while rest < len(t) and t[rest] in " \t\r\n":
            rest += 1
        if t[rest:rest + 2] == "=>":
            body = rest + 2
            fparams = split_params(t[i + 1:close - 1])
        else:  # IIFE: the arrow lives inside the parens
            arrow = find_arrow(t, i + 1, close)
            if arrow > 0:
                body = arrow + 2
                pstart = t.rfind("(", i, arrow)
                fparams = split_params(t[pstart + 1:t.index(")", pstart)])
    else:
        arrow = t.find("=>", i)
        if arrow > 0:
            body = arrow + 2
            fparams = split_params(t[i:arrow])
    while body >= 0 and body < len(t) and t[body] in " \t\r\n":
        body += 1
    if body < 0 or body >= len(t) or t[body] != "{":
        return -1, fparams
    return body, fparams


def module_surface(t, i, fn_names):
    """(symbols, pipeline params) exposed by the module expression at i."""
    while i < len(t) and t[i] in " \t\r\n":
        i += 1
    if t.startswith("function", i):
        m = re.match(r"function\s*(?:([A-Za-z_$][\w$]*)\s*)?\(([^)]*)\)", t[i:])
        out = {m.group(1)} if m and m.group(1) and valid_name(m.group(1)) else set()
        params = split_params(m.group(2)) if m else set()
        body = t.find("{", i)
        if body > 0:
            out |= top_level_returns(t, body, match_pair(t, body), fn_names)
        return out, params
    if t[i] == "{":
        keys, _fk, params, _ = object_surface(t, i, fn_names)
        return keys, params
    m = IDENT_RE.match(t, i)
    if m and (m.end() >= len(t) or t[m.end()] in ",);"):
        name, out, params = m.group(0), set(), set()
        if name in fn_names and valid_name(name):
            out.add(name)          # the payload IS a function defined here
        b = re.search(r"\b(?:const|let|var)\s+" + re.escape(name) + r"\s*=\s*\{", t)
        if b:
            k, _fk, p, _ = object_surface(t, b.end() - 1, fn_names)
            out |= k
            params |= p
        return out, params
    # factory form: (params) => {...} | name => {...} | (() => {...})()
    body, fparams = factory_body(t, i)
    if body < 0:
        return set(), fparams
    keys = top_level_returns(t, body, match_pair(t, body), fn_names)
    return keys, fparams


def adapter_fn_keys(t, body_start, body_end, fn_names, want_depth):
    """Function-valued keys of `const NAME = {...}` adapters at want_depth.

    These are the module-scope adapter objects (MathGrid / Visibility /
    Selection / Actions in core/game.js, `Renderer` in graphics/graphics.js)
    whose method names are handed to children through the pipeline.
    """
    keys = set()
    positions, spans = [], []
    for m in re.finditer(r"\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\{", t):
        if body_start <= m.start() < body_end:
            positions.append(m.start())
            spans.append((m.start(), m.end()))
    depths = scan_depths(t, positions)
    for (start, end) in spans:
        if depths.get(start, -1) != want_depth:
            continue
        _k, fk, _p, _e = object_surface(t, end - 1, fn_names)
        keys |= {k for k in fk if valid_name(k)}
    return keys


def extract_surface(text, is_data=False):
    """(symbols, pipeline params, factory-globals) exposed by a file.

    Claims are ONLY: registration-payload / returned-object keys, function
    names defined in those objects, and registered factory-global names.
    """
    fn_names = fn_def_names(text)
    syms, params, globals_ = set(), set(), set()
    for m in REG_CALL_RE.finditer(text):
        s, p = module_surface(text, m.end(), fn_names)
        if not is_data:  # data fields are blessed plain-data names (§2)
            syms |= s
        params |= p
    # factory-globals: top-level const NAME = factory, plus transient globals
    const_re = re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*")
    positions = [m.start() for m in const_re.finditer(text)]
    depths = scan_depths(text, positions)
    for m in const_re.finditer(text):
        name, tail = m.group(1), text[m.end():]
        depth = depths.get(m.start(), -1)
        if depth == 0 and re.match(r"\(?function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>",
                                   tail):
            if valid_name(name):
                globals_.add(name)   # top-level const NAME = (() => …) / fn
            s, p = module_surface(text, m.end(), fn_names)
            syms |= s
            params |= p
            body, _fp = factory_body(text, m.end())
            if body > 0:
                # module-scope adapter literals inside the factory body
                # (MathGrid/Visibility/Selection/Actions in core/game.js)
                want = scan_depths(text, [body]).get(body, 0) + 1
                syms |= adapter_fn_keys(text, body, match_pair(text, body),
                                        fn_names, want)
    for m in re.finditer(r"\b(?:g|window|globalThis)\.([A-Za-z_$][\w$]*)\s*=", text):
        if valid_name(m.group(1)):
            globals_.add(m.group(1))  # transient g.<Name> during load
    syms |= globals_
    syms = {s for s in syms if valid_name(s)}
    params = {p for p in params if valid_name(p)}
    return syms, params, globals_


def declared_locals(text):
    """Names the file itself binds as local variables / functions (shadowing).

    Deliberately excludes function/method parameters and destructured names:
    those arrive from the caller across a file boundary (e.g. the sibling
    closure `drawUnitStatic` threaded through graphics.js), so bare uses of
    them ARE cross-file references.
    """
    bound = set()
    for m in re.finditer(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", text):
        bound.add(m.group(1))
    for m in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)", text):
        bound.add(m.group(1))
    for m in re.finditer(r",\s*([A-Za-z_$][\w$]*)\s*=(?!=)", text):  # `a = 1, b = 2`
        bound.add(m.group(1))
    for m in re.finditer(r"\bcatch\s*\(\s*([A-Za-z_$][\w$]*)", text):
        bound.add(m.group(1))
    return bound


def definition_spans(t):
    """Spans (start, end) where an identifier is DEFINED, not used:
    function/method parameter lists, destructuring patterns, catch params.
    """
    spans = []
    for m in re.finditer(r"\b(?:const|let|var)\s*[\{\[]", t):
        spans.append((m.end() - 1, match_pair(t, m.end() - 1)))
    for m in re.finditer(r"\bfunction\b\s*[\w$]*\s*\(", t):
        spans.append((m.end() - 1, match_pair(t, m.end() - 1)))
    for m in re.finditer(r"\bcatch\s*\(", t):
        spans.append((m.end() - 1, match_pair(t, m.end() - 1)))
    # method definitions: NAME(...) { — but not if/for/while/switch heads or
    # plain calls (a call is never followed by '{').
    meth_re = re.compile(
        r"(?<![\w$.])(?!(?:if|for|while|switch|catch|with|do|return|typeof|"
        r"function|new|else|try|finally|delete|void|in|of|instanceof)\b)"
        r"([A-Za-z_$][\w$]*)\s*\(")
    for m in meth_re.finditer(t):
        open_p = m.end() - 1
        close = match_pair(t, open_p)
        rest = t[close:close + 12].lstrip()
        if rest.startswith("{"):
            spans.append((open_p, close))
    # arrow parameters: ( ... ) =>  and bare `name =>`
    for m in re.finditer(r"\)\s*=>", t):
        depth, i = 0, m.start()
        while i >= 0:
            if t[i] == ")":
                depth += 1
            elif t[i] == "(":
                depth -= 1
                if depth == 0:
                    spans.append((i, m.start() + 1))
                    break
            i -= 1
    return spans


def allowed_files(child):
    return {child, PARENT_OF[child]} | ADJACENT_CORES.get(child, set())


# ---- checks ----------------------------------------------------------------
def check_filenames(raw_by_path):
    out = []
    for child in sorted(PARENT_OF):
        base = os.path.basename(child)
        stem = base[:-3] if base.endswith(".js") else base
        # Bare module names count for CamelCase names ("uiRenderer" in a
        # comment names graphics/uiRenderer.js).  Lowercase stems (ai, rules,
        # game, themes, ...) are ordinary words — only the filename counts.
        stem_rx = None
        if any(c.isupper() for c in stem):
            stem_rx = re.compile(r"(?<![\w$])" + re.escape(stem) + r"(?![\w$])")
        ok = allowed_files(child) | {c for c, p in PARENT_OF.items() if p == child}
        for path, raw in sorted(raw_by_path.items()):
            if path in ok:
                continue
            lines = raw.splitlines()
            head = header_line_count(lines)
            for i, line in enumerate(lines):
                if i < head:
                    continue  # header comments name owners by convention
                for _col in find_all(line, base):
                    out.append((path, i + 1,
                                "'%s' (file %s) is referenced here; only %s "
                                "(its parent), its own children and itself may "
                                "reference it" % (base, child, PARENT_OF[child])))
                if stem_rx:
                    for m in stem_rx.finditer(line):
                        if line[m.end():m.end() + 3] == ".js":
                            continue  # the filename match above covers it
                        out.append((path, i + 1,
                                    "'%s' (file %s) is referenced here; only %s "
                                    "(its parent), its own children and itself may "
                                    "reference it" % (stem, child, PARENT_OF[child])))
    return out


def find_all(line, needle):
    out, i = [], line.find(needle)
    while i >= 0:
        out.append(i)
        i = line.find(needle, i + 1)
    return out


def check_symbols(code_by_path, claims, params_of, globals_of):
    out = []
    allowed = {s: set().union(*(allowed_files(c) for c in owners))
               for s, owners in claims.items()}
    decls, spans_of = {}, {}
    for p, lines in code_by_path.items():
        text = "\n".join(lines)
        decls[p] = declared_locals(text)
        spans_of[p] = sorted(definition_spans(text))
    for path in sorted(code_by_path):
        lines = code_by_path[path]
        given = set()
        for rx in (r"\bfunction\b\s*[\w$]*\s*\(([^)]*)\)", r"\(([^)]*)\)\s*=>"):
            for m in re.finditer(rx, "\n".join(lines)):
                given |= split_params(m.group(1))
        for m in re.finditer(r"^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{",
                             "\n".join(lines), re.M):
            if m.group(1) not in KEYWORD_NAMES:
                given |= split_params(m.group(2))
        given |= params_of.get(path, set())
        owner_globals = {g for child in PARENT_OF
                         if path in allowed_files(child)
                         for g in globals_of.get(child, set())}
        spans = spans_of[path]
        starts = [s for s, _e in spans]
        line_off = [offset_of(lines, i) for i in range(len(lines) + 1)]
        for sym in sorted(claims):
            if path in allowed[sym]:
                continue
            rx = re.compile(r"(?<![\w$])%s(?![\w$])" % re.escape(sym))
            for i, line in enumerate(lines):
                for m in rx.finditer(line):
                    after, before = line[m.end():], line[:m.start()]
                    if "._register" in line or re.search(
                            r"\b(?:g|window|globalThis)\.[\w$]+\s*=", line):
                        continue  # sanctioned transient load registrar (§1.5)
                    off = line_off[i] + m.start()
                    k = bisect_right(starts, off) - 1
                    if k >= 0 and spans[k][0] <= off < spans[k][1]:
                        continue  # parameter/destructuring definition position
                    if re.match(r"['\"]?\s*:(?!=)", after):
                        continue  # object-literal key position: a definition
                    if re.match(r"\s*\([^)]*\)\s*\{", after) or \
                            re.match(r"\s*=>", after):
                        continue  # method/function definition position
                    owner = re.search(r"([A-Za-z_$][\w$]*)\.\s*$", before)
                    if owner and (owner.group(1) in given
                                  or owner.group(1) in owner_globals):
                        continue  # parent-built pipeline handle / allowed API
                    if not owner and sym in decls[path]:
                        continue  # the file declares this name locally
                    out.append((path, i + 1,
                                "symbol '%s' (exposed by %s) is referenced "
                                "here; it may be known only by its parent (%s)"
                                % (sym, " + ".join(sorted(claims[sym])),
                                   ", ".join(PARENT_OF[c]
                                             for c in sorted(claims[sym])))))
    return out


def bisect_right(a, x):
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] <= x:
            lo = mid + 1
        else:
            hi = mid
    return lo


def check_globals(code_by_path, clean_by_path, parents):
    out = []
    for path in sorted(code_by_path):
        if path in CORES and path != "main.js":
            continue  # cores are exempt from the pure-function rules
        for i, line in enumerate(code_by_path[path]):
            # the loader test needs strings ("script"), so use the clean line
            loader = path in parents and LOADER_LINE_RE.search(clean_by_path[path][i])
            for tok in GLOBAL_TOKENS:
                if tok in ("window.", "document.") and path in DOC_WINDOW_ALLOWED:
                    continue
                if loader and tok in ("window.", "document."):
                    continue  # sanctioned §1.4 inline child-loader
                for _col in find_all(line, tok):
                    out.append((path, i + 1,
                                "global use '%s' in child file (§1.5: children "
                                "expose and touch no globals; document/window "
                                "allowed only in main.js and graphics/graphics.js)"
                                % tok))
    return out


def check_data_files(code_by_path, clean_by_path):
    out = []
    for path in sorted(code_by_path):
        if not (path.startswith("data" + os.sep) and path.endswith("_DATA.js")):
            continue
        # span detection needs the quoted registration name -> clean text
        ctext = "\n".join(clean_by_path[path])
        span = None
        m = REG_CALL_RE.search(ctext)
        if m:
            call_start = ctext.rfind("\n", 0, m.start()) + 1
            span = (call_start, match_pair(ctext, ctext.index("(", m.start())))
        for i, line in enumerate(code_by_path[path]):
            for m2 in re.finditer(r"\bfunction\b|=>", line):
                off = offset_of(code_by_path[path], i) + m2.start()
                if span and span[0] <= off < span[1]:
                    continue
                out.append((path, i + 1,
                            "data file contains '%s' outside its registration "
                            "call (data modules must be pure data)"
                            % m2.group(0)))
    return out


def offset_of(lines, lineno):
    return sum(len(l) + 1 for l in lines[:lineno])

# ---- entry point -----------------------------------------------------------
def print_map():
    print("reference_audit ownership map (child -> parent)")
    for child in sorted(PARENT_OF, key=lambda c: (PARENT_OF[c], c)):
        extra = ADJACENT_CORES.get(child)
        tail = ("   [also known by: %s]" % ", ".join(sorted(extra))) if extra else ""
        print("  %-38s -> %-16s%s" % (child, PARENT_OF[child], tail))


def main(argv):
    if "--map" in argv:
        print_map()
        return 0
    raw_by_path, clean_by_path = {}, {}
    code_by_path, claims = {}, {}
    params_of, globals_of = {}, {}
    for path in list_js_files():
        raw_by_path[path] = read(path)
        clean = blank_spans(raw_by_path[path], "c")  # comments out, strings kept
        clean_by_path[path] = clean.splitlines()
        code_by_path[path] = blank_spans(clean, "x").splitlines()  # code only
    for child in PARENT_OF:
        is_data = child.startswith("data" + os.sep)
        syms, params, globals_ = extract_surface(
            "\n".join(clean_by_path[child]), is_data)
        params_of[child], globals_of[child] = params, globals_
        for s in syms:
            claims.setdefault(s, set()).add(child)
    parents = set(PARENT_OF.values()) | {"main.js"}
    viols = (check_filenames(raw_by_path)
             + check_symbols(code_by_path, claims,
                             params_of, globals_of)
             + check_globals(code_by_path, clean_by_path, parents)
             + check_data_files(code_by_path, clean_by_path))
    viols.sort()
    for path, line, msg in viols:
        print("%s:%d: %s" % (path, line, msg))
    if viols:
        print("reference_audit: %d violation(s)" % len(viols))
        return 1
    print("reference_audit: clean")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
