#!/usr/bin/env python3
"""reference_audit.py — machine-check the repo's encapsulation rules.

Implements the "reference audit" required by docs/GUIDING_PRINCIPLES.md §1:
"a file may be known only by its direct parent" and "children expose no
globals" (§1.5), checked over every .js file in the tree against the
hard-coded ownership map below (run with --map to print it).

Checks (each violation printed as 'file:line: message'; exit code 1 if any):
 1. A child's filename must not appear in any .js file other than its parent
    and itself (plus, by §1.1 construction, its own children).  Filename
    mentions in a file's leading header banner are allowed — every child
    names its owner there by convention; code and mid-file comments naming a
    sibling/cousin/grandparent are reported.  The bare module name (e.g.
    `uiRenderer` in "uiRenderer._drawCampaignModal") counts as the filename
    too when the stem is a module-style mixed-case name.
 2. Every symbol a child registers/exposes must not appear as a whole word in
    any .js file other than its parent and itself.  What a file exposes is
    read strictly, and ONLY from:
      - object-literal keys of the object passed to a registration call
        (Game._registerModule / SoundEngine._registerModule /
        Graphics._registerLayer / the transient _register);
      - function names defined in that payload / its returned object
        (method shorthand, `name: function`, `name: () =>`, and `key: fnName`
        where fnName is a function actually defined in the file);
      - the payload factory's top-level return surface (returned object-literal
        keys, `return api` resolved through the api object literal, and
        `return Object.freeze({...})`-style wrapped literals);
      - the registered factory-global name itself (a file-top-level
        `const NAME = <factory>` binding, or `window.`/`globalThis.`/`g.NAME =`
        — including the transient load registrars), and the function members
        of module-scope adapter object literals (`const Selection = {...}`);
      - NOTHING ELSE.  Keywords, literals and builtins (false, null, Object,
        Math, …) can never be claims; local variables, parameters and plain
        data fields are never surface (data/*_DATA.js field names in
        particular are blessed plain-data names that travel inside DTOs (§2),
        not referenceable module surface — procedural mirrors, e.g. rules.js
        getters, still claim their names).
    Not reported:
      - transient load registrars (X._register / g.<Name> lines, amended §1.5);
      - uses through parent-built pipeline handles (the factory / registered
        function's injected params — AUDIO./D./env./ctxObj./deps./cmd./bridge./
        state./payload. — or through a global whose owner allows this file,
        e.g. main.js using Game.*): those names were handed to the file by its
        parent;
      - names the file itself binds (a definition or a shadowing local, not a
        reference), object-literal key positions and method/function
        parameter lists (definitions, not uses);
      - ordinary property fields on local objects (`row.color` is a data
        field, not the themes module's `color`).
    Pipeline handles destructured from the parent's DTO (`const {drawUnitStatic}
    = cmd`) are NOT locals: bare uses of those ARE cross-file references (the
    sibling-closure channel), and are reported.
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

# Property-access receivers that were parent-injected (pipeline DTOs): a
# property access on one of these is plumbing, not a cross-file symbol use.
PIPELINE_RECEIVERS = {"env", "bridge", "cmd", "ctxObj", "D", "AUDIO",
                      "deps", "state", "payload"}

# Nothing here can ever be a claimed symbol (requirement: ZERO claims about
# builtins / keywords / literals).
KEYWORD_NAMES = {
    "if", "else", "for", "while", "do", "switch", "case", "default", "break",
    "continue", "return", "function", "const", "let", "var", "typeof",
    "instanceof", "in", "of", "new", "delete", "void", "this", "class",
    "extends", "super", "static", "get", "set", "async", "await", "yield",
    "throw", "try", "catch", "finally", "with", "debugger", "import", "export",
    "from", "as",
}
LITERAL_NAMES = {"true", "false", "null", "undefined", "NaN", "Infinity"}
BUILTIN_NAMES = {
    "Object", "Array", "Math", "JSON", "console", "Boolean", "Number",
    "String", "Map", "Set", "WeakMap", "WeakSet", "Promise", "Symbol",
    "Proxy", "Reflect", "Function", "Error", "TypeError", "RangeError",
    "SyntaxError", "ReferenceError", "EvalError", "URIError", "Date",
    "RegExp", "parseInt", "parseFloat", "isNaN", "isFinite", "decodeURI",
    "decodeURIComponent", "encodeURI", "encodeURIComponent", "escape",
    "unescape", "eval", "globalThis", "window", "document", "self", "top",
    "parent", "navigator", "location", "history", "screen", "localStorage",
    "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "queueMicrotask", "structuredClone", "performance", "alert", "confirm",
    "prompt", "fetch", "URL", "URLSearchParams", "TextEncoder", "TextDecoder",
    "atob", "btoa", "crypto", "CustomEvent", "Event", "EventTarget", "Image",
    "Audio", "AudioContext", "XMLHttpRequest", "MutationObserver",
    "ResizeObserver", "IntersectionObserver", "getComputedStyle", "matchMedia",
    "devicePixelRatio", "addEventListener", "removeEventListener",
    "Uint8Array", "Uint8ClampedArray", "Uint16Array", "Uint32Array",
    "Int8Array", "Int16Array", "Int32Array", "Float32Array", "Float64Array",
    "ArrayBuffer", "SharedArrayBuffer", "DataView", "BigInt",
}
STOPWORD_NAMES = KEYWORD_NAMES | LITERAL_NAMES | BUILTIN_NAMES


def valid_symbol(name):
    return bool(IDENT_RE.fullmatch(name or "")) and name not in STOPWORD_NAMES


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
        lines = fh.read().splitlines(keepends=True)
    # Header-contract lines (docs/ARCHITECTURE_COMPLIANCE.md section 5) declare
    # the file's job and owner. They name files on purpose and are declarations,
    # not code references, so they are scrubbed before analysis.
    out = []
    for ln in lines:
        s = ln.lstrip()
        if s.startswith("//"):
            body = s[2:].lstrip()
            if body.startswith("job:") or body.startswith("Owner:") or "\u2014 job:" in body:
                out.append("\n" if ln.endswith("\n") else "")
                continue
        out.append(ln)
    return "".join(out)


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


def depth_at(t, idx):
    """Bracket depth (all of (, [, {) at idx, string-aware."""
    depth, i = 0, 0
    while i < idx:
        j = skip_string(t, i)
        if j != i:
            i = j
            continue
        c = t[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        i += 1
    return depth


def split_params(text):
    out = set()
    for part in text.split(","):
        part = part.strip().strip("{}[]").split("=")[0].strip().split(":")[0].strip()
        if IDENT_RE.fullmatch(part) and part not in KEYWORD_NAMES:
            out.add(part)
    return out


# ---- surface extraction (strict whitelist) ---------------------------------
FN_DEF_RES = (
    re.compile(r"\bfunction\s*([A-Za-z_$][\w$]*)\s*\("),
    re.compile(r"\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b"),
    re.compile(r"\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>"),
    re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\("),  # const f = (...) =>…/(
)


def fn_defined(text, name):
    if re.search(r"\bfunction\s+" + re.escape(name) + r"\s*\(", text):
        return True
    if re.search(r"\b" + re.escape(name) + r"\s*=\s*(?:async\s+)?function\b", text):
        return True
    if re.search(r"\b" + re.escape(name) + r"\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>", text):
        return True
    return False


def fn_names_defined(text):
    out = set()
    for rx in FN_DEF_RES:
        for m in rx.finditer(text):
            out.add(m.group(1))
    return out


def object_surface(t, open_idx):
    """(keys, fn-keys, params, end) of the object literal at '{' open_idx.

    fn-keys are members that are functions: method shorthand, `key: function`,
    `key: () =>`, or `key: fnName` where fnName is a function defined in the
    file (a key: fnName pair exposes the function's name).
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
        elif c in "}])":
            depth -= 1
            if depth == 0:
                segs.append(t[seg_start:i])
                break
        elif c == "," and depth == 1:
            segs.append(t[seg_start:i])
            seg_start = i + 1
        i += 1
    key_re = re.compile(r"\s*(?:\.\.\.)?(?:(?:async|get|set|static)\s+)*\*?\s*"
                        r"(?:([A-Za-z_$][\w$]*)|(['\"])([^'\"]+)\2)\s*(?=\s*[:=]|\s*\(|\s*\)|\s*$)")
    val_re = re.compile(r":\s*([A-Za-z_$][\w$]*)\s*$")
    param_res = (re.compile(r"^\s*(?:async\s+)?[\w$]+\s*\(([^)]*)\)"),
                 re.compile(r"^\s*\(([^)]*)\)\s*=>"),
                 re.compile(r"^\s*([A-Za-z_$][\w$]*)\s*=>"))
    for seg in segs:
        m = key_re.match(seg)
        if m:
            key = m.group(1) or m.group(3)
            keys.add(key)
            rest = seg[m.end():]
            if (re.match(r"\s*\([^)]*\)\s*\{", rest)                    # method shorthand
                    or re.match(r"\s*[:=]\s*(?:async\s+)?function\b", rest)   # name: function
                    or re.match(r"\s*[:=]\s*(?:async\s+)?\([^)]*\)\s*=>", rest)  # name: () =>
                    or re.match(r"\s*[:=]\s*(?:async\s+)?[\w$]+\s*=>", rest)):   # name: x =>
                fn_keys.add(key)
            v = val_re.search(seg)
            if v and fn_defined(t, v.group(1)):
                keys.add(v.group(1))     # key: fnName pairs expose the fn name
                fn_keys.add(v.group(1))
        for pre in param_res:
            pm = pre.match(seg)
            if pm:
                params |= split_params(pm.group(1))
                break
    return keys, fn_keys, params, i + 1


def unwrap_returned_literals(t, k, end):
    """Object literals returned at a `return` — plain or wrapped in
    Object.freeze / Object.assign / Object.seal / deepFreeze(...)."""
    keys, fn_keys = set(), set()
    depth, i = 0, k
    while i < end:
        j = skip_string(t, i)
        if j != i:
            i = j
            continue
        c = t[i]
        if c in "([{":
            if c == "{" and depth <= 1:
                kk, fk, _, nxt = object_surface(t, i)
                keys |= kk
                fn_keys |= fk
                i = nxt
                continue
            depth += 1
        elif c in ")]}":
            if depth == 0:
                break
            depth -= 1
        elif c == ";" and depth == 0:
            break
        i += 1
    return keys, fn_keys


def top_level_returns(t, body_start, body_end, fns):
    """(keys, fn-keys, params, names) returned at the top level of a factory body."""
    keys, fn_keys, params, names = set(), set(), set(), set()
    depth, i = 1, body_start + 1
    while i < body_end - 1:
        j = skip_string(t, i)
        if j != i:
            i = j
            continue
        c = t[i]
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
        elif depth == 1 and t.startswith("return", i) and \
                not (i and (t[i - 1].isalnum() or t[i - 1] in "_$")):
            k = i + 6
            while k < body_end and t[k] in " \t\r\n":
                k += 1
            if k < body_end and t[k] == "{":
                kk, fk, _, i = object_surface(t, k)
                keys |= kk
                fn_keys |= fk
                continue
            kk, fk = unwrap_returned_literals(t, k, body_end)
            if kk or fk:
                keys |= kk
                fn_keys |= fk
                i = k
                continue
            m = IDENT_RE.match(t, k)
            if m:
                name = m.group(0)
                if name in fns or fn_defined(t, name):
                    names.add(name)          # `return getAIAction` — a fn name
                else:
                    b = re.search(r"\b(?:const|let|var)\s+" + re.escape(name) + r"\s*=\s*\{", t)
                    if b:                    # `return api` — resolve the object literal
                        kk, fk, p, _ = object_surface(t, b.end() - 1)
                        keys |= kk
                        fn_keys |= fk
                        params |= p
                i = m.end()
                continue
        i += 1
    return keys, fn_keys, params, names


def module_surface(t, i, fns):
    """(syms, params) exposed by the module expression at registration position."""
    while i < len(t) and t[i] in " \t\r\n":
        i += 1
    if t.startswith("function", i):
        m = re.match(r"function\s*(?:([A-Za-z_$][\w$]*)\s*)?\(([^)]*)\)", t[i:])
        # the payload's own function name is exposed surface (e.g. runTest)
        return ({m.group(1)} if m and m.group(1) else set()), \
            (split_params(m.group(2)) if m else set())
    if t[i] == "{":
        keys, fn_keys, params, _ = object_surface(t, i)
        return (keys | fn_keys), params
    m = IDENT_RE.match(t, i)
    if m and (m.end() >= len(t) or t[m.end()] in ",);"):
        name, out, params = m.group(0), set(), set()
        if name in fns or fn_defined(t, name):
            out.add(name)                    # _register("unitPlanner", buildUnitPlan)
        b = re.search(r"\b(?:const|let|var)\s+" + re.escape(name) + r"\s*=\s*\{", t)
        if b:
            k, fk, p, _ = object_surface(t, b.end() - 1)
            out |= k | fk
            params |= p
        return out, params
    # factory form: (params) => {...} | name => {...} | (() => {...})()
    body, fparams = -1, set()
    if t[i] == "(":
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
        return set(), fparams
    keys, fn_keys, params, names = top_level_returns(t, body, match_pair(t, body), fns)
    return (keys | fn_keys | names), fparams | params


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


def extract_surface(text, is_data=False):
    """(symbols, params, factory-globals) exposed by a file."""
    syms, params, globals_ = set(), set(), set()
    fns = fn_names_defined(text)
    for m in REG_CALL_RE.finditer(text):
        s, p = module_surface(text, m.end(), fns)
        if not is_data:      # data fields are blessed plain-data names (§2)
            syms |= s
        params |= p
    # factory-global names: `const NAME = <factory>` at file top level only
    for m in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*", text):
        tail = text[m.end():]
        if not re.match(r"\(?function\b|\([^)]*\)\s*=>|[\w$]+\s*=>|\(\s*\(\s*\)\s*=>|\(\s*\(\s*[\w$,\s]*\)\s*=>", tail):
            continue
        if depth_at(text, m.start()) != 0:
            continue          # nested `const helper = () => {...}` is not a global
        globals_.add(m.group(1))
        s, p = module_surface(text, m.end(), fns)
        if not is_data:
            syms |= s
        params |= p
    for m in re.finditer(r"\b(?:g|window|globalThis)\.([A-Za-z_$][\w$]*)\s*=", text):
        globals_.add(m.group(1))   # transient g.<Name> during load (§1.5)
    # module-scope adapter object literals (`const Selection = {...}`): their
    # function members are exposed surface handed to children via the pipeline
    for m in re.finditer(r"\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\{", text):
        _k, fk, _p, _e = object_surface(text, m.end() - 1)
        if not is_data:
            syms |= fk
    if not is_data:
        syms |= globals_
    return {s for s in syms if valid_symbol(s)}, params, globals_


# ---- declaration info (what the file itself binds / receives) --------------
def declaration_info(code):
    """(bound, given, handles, def_spans) for the comment/string-blanked code.

    bound      — names the file itself binds (const/let/var incl. multiple
                 declarators, for-of/for-in, destructuring, function names,
                 catch params);
    given      — parameter names of the file's functions/methods/arrows;
    handles    — pipeline handles: names destructured from the parent's DTO
                 (`const {...} = cmd`) or bound to a member access
                 (`const Rules = deps.Rules`); bare uses of these are real
                 cross-file references;
    def_spans  — (start, end) ranges of parameter lists / binding patterns:
                 occurrences inside them are declarations, not uses.
    """
    bound, given, handles, dto_handles, spans = set(), set(), set(), set(), []

    def add_params(text, span):
        given.update(split_params(text))
        spans.append(span)

    for m in re.finditer(r"\bfunction\s*[\w$]*\s*\(", code):
        end = code.index(")", m.end()) if ")" in code[m.end():] else len(code)
        add_params(code[m.end():end], (m.end(), end + 1))
    for m in re.finditer(r"(?<![.\w$])(?:async\s+)?[A-Za-z_$][\w$]*\s*\(([^()]*)\)\s*\{", code):
        if re.match(r"\s*(?:if|for|while|switch|catch|with|function|do|else|return|typeof|new|in|of|await|yield|throw|try|finally|class)\b", m.group(0)):
            continue
        add_params(m.group(1), m.span(1))
    for m in re.finditer(r"\(([^)]*)\)\s*=>", code):
        add_params(m.group(1), m.span(1))
    for m in re.finditer(r"(?<![\w$])([A-Za-z_$][\w$]*)\s*=>", code):
        given.add(m.group(1))

    # const/let/var: every declarator name (multi-declarator aware)
    for m in re.finditer(r"\b(?:const|let|var)\b", code):
        depth, i = 0, m.end()
        start = i
        while i < len(code):
            j = skip_string(code, i)
            if j != i:
                i = j
                continue
            c = code[i]
            if c in "([{":
                depth += 1
            elif c in ")]}":
                if depth == 0:
                    break
                depth -= 1
            elif c == ";" and depth == 0:
                break
            elif c == "," and depth == 0:
                _declarator(code, start, i, bound, handles, spans)
                start = i + 1
            i += 1
        _declarator(code, start, min(i + 1, len(code)), bound, handles, spans)

    for m in re.finditer(r"\b(?:function|class)\s+([A-Za-z_$][\w$]*)", code):
        bound.add(m.group(1))
    for m in re.finditer(r"\bcatch\s*\(\s*([A-Za-z_$][\w$]*)", code):
        bound.add(m.group(1))
        spans.append(m.span(1))
    # destructuring binding patterns
    for m in re.finditer(r"\b(?:const|let|var)\s*([\{\[])", code):
        end = match_pair(code, m.start(1))
        names = split_params(code[m.start(1) + 1:end - 1])
        bound.update(names)
        spans.append((m.start(1) + 1, end - 1))
        src = re.match(r"\s*=\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)"
                       r"\.?\s*([;,)\]}]|$)", code[end:end + 60])
        if src and (src.group(1).split(".")[0] in given
                    or src.group(1).split(".")[0] in PIPELINE_RECEIVERS):
            handles.update(names)  # const {...} = cmd — parent-DTO fields
            dto_handles.update(names)  # are parent-injected pipeline handles
            given.update(names)
    return bound, given, handles, dto_handles, spans


def is_handle_init(val):
    """True when a `const NAME = <init>` binds a module/DTO handle: a pure
    member read (`deps.Rules`, `(ctx && ctx.rules) || null`) rather than a
    computed value (`state.maxAp || 4`, `contentRows[i]`, `env.rules.dist(d, e)`
    — a call returns a value, not a handle)."""
    v = val.strip().rstrip(";").strip()
    if not v or "[" in v or re.search(r"\d|['\"]|=>", v):
        return False
    if re.search(r"[A-Za-z_$][\w$]*\s*\(", v):
        return False                     # a call: the binding is the result
    if not re.search(r"[A-Za-z_$][\w$]*\.[A-Za-z_$]", v):
        return False                     # needs at least one member read
    rest = re.sub(r"[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+", " ", v)  # chains
    rest = re.sub(r"[A-Za-z_$][\w$]*", " ", rest)                      # guards
    return re.sub(r"[&|!?:().\s]", "", rest) == ""


def _declarator(code, start, end, bound, handles, spans):
    seg = code[start:end]
    nm = re.match(r"\s*([A-Za-z_$][\w$]*)", seg)
    if not nm:
        return
    name = nm.group(1)
    bound.add(name)
    init = seg[nm.end():]
    if re.match(r"\s*=", init):
        val = init[init.index("=") + 1:]
        if is_handle_init(val):
            handles.add(name)   # const Rules = deps.Rules / ctx.rules || null …


def find_all(line, needle):
    out, i = [], line.find(needle)
    while i >= 0:
        out.append(i)
        i = line.find(needle, i + 1)
    return out


def allowed_files(child):
    return {child, PARENT_OF[child]} | ADJACENT_CORES.get(child, set())


# ---- checks ----------------------------------------------------------------
def check_filenames(raw_by_path):
    out = []
    for child in sorted(PARENT_OF):
        base = os.path.basename(child)                 # e.g. uiRenderer.js
        stem = base[:-3] if base.endswith(".js") else base
        ok = allowed_files(child) | {c for c, p in PARENT_OF.items() if p == child}
        # bare module-name mentions count too for module-style names
        stem_rx = None
        if any(ch.isupper() for ch in stem):
            stem_rx = re.compile(r"(?<![\w$])" + re.escape(stem) + r"(?![\w$])")
        for path, raw in sorted(raw_by_path.items()):
            if path in ok:
                continue
            lines = raw.splitlines()
            head = header_line_count(lines)
            for i, line in enumerate(lines):
                if i < head:
                    continue  # header comments name owners by convention
                hits = len(find_all(line, base))
                if stem_rx:
                    hits += len(stem_rx.findall(line))
                for _ in range(hits):
                    out.append((path, i + 1,
                                "'%s' (file %s) is referenced here; only %s "
                                "(its parent), its own children and itself may "
                                "reference it" % (base, child, PARENT_OF[child])))
    return out


def check_symbols(code_by_path, clean_by_path, claims, params_of, globals_of,
                  data_fields):
    out = []
    allowed = {s: set().union(*(allowed_files(c) for c in owners))
               for s, owners in claims.items()}
    info, code_join = {}, {}
    for p, lines in code_by_path.items():
        code_join[p] = "\n".join(lines)
        info[p] = declaration_info(code_join[p])
    for path in sorted(code_by_path):
        lines = code_by_path[path]
        bound, given, handles, dto_handles, spans = info[path]
        given = given | params_of.get(path, set())
        owner_globals = {g for child in PARENT_OF
                         if path in allowed_files(child)
                         for g in globals_of.get(child, set())}
        for sym in sorted(claims):
            if path in allowed[sym]:
                continue
            rx = re.compile(r"(?<![\w$])%s(?![\w$])" % re.escape(sym))
            for i, line in enumerate(lines):
                line_off = offset_of(lines, i)
                for m in rx.finditer(line):
                    after, before = line[m.end():], line[:m.start()]
                    if "._register" in line or re.search(
                            r"\b(?:g|window|globalThis)\.[\w$]+\s*=", line):
                        continue  # sanctioned transient load registrar (§1.5)
                    if re.match(r"['\"]?\s*:(?!=)", after):
                        continue  # object-literal key position: a definition
                    if re.match(r"\s*\([^)]*\)\s*\{", after):
                        continue  # method/function definition position
                    off = line_off + m.start()
                    if any(a <= off < b for a, b in spans):
                        continue  # parameter list / binding pattern: a declaration
                    if re.search(r"\.\s*$", before):
                        # property access `X.sym` (or `f(x).sym`)
                        owner = re.search(r"([A-Za-z_$][\w$]*)\.\s*$", before)
                        if not owner:
                            continue  # computed receiver: a local data field
                        recv = owner.group(1)
                        if (recv in given or recv in PIPELINE_RECEIVERS
                                or recv in owner_globals):
                            continue  # parent-built pipeline handle (req. 3)
                        if recv in bound and recv not in handles:
                            continue  # `row.color` — a data field on a local
                    else:
                        # bare occurrence
                        if sym in dto_handles and sym not in data_fields:
                            pass      # destructured sibling fn handle: a real use
                        elif sym in bound or sym in given or sym in handles:
                            continue  # the file binds this name itself
                    out.append((path, i + 1,
                                "symbol '%s' (exposed by %s) is referenced "
                                "here; it may be known only by its parent (%s)"
                                % (sym, " + ".join(sorted(claims[sym])),
                                   ", ".join(sorted({PARENT_OF[c]
                                                     for c in sorted(claims[sym])})))))
    return out


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
                for _ in find_all(line, tok):
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
    data_fields = set()   # blessed plain-data names that travel inside DTOs (§2)
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
        if is_data:
            text = "\n".join(clean_by_path[child])
            for m in REG_CALL_RE.finditer(text):
                brace = text.find("{", m.end())
                if brace < 0:
                    continue
                keys, fkeys, _p, _e = object_surface(text, brace)
                data_fields |= {k for k in keys | fkeys if valid_symbol(k)}
        for s in syms:
            claims.setdefault(s, set()).add(child)
    parents = set(PARENT_OF.values()) | {"main.js"}
    viols = (check_filenames(raw_by_path)
             + check_symbols(code_by_path, clean_by_path, claims,
                             params_of, globals_of, data_fields)
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
