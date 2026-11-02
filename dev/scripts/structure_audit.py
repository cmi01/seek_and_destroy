#!/usr/bin/env python3
"""structure_audit.py — machine-check the structural compliance rules.

Implements the checkable parts of docs/ARCHITECTURE_COMPLIANCE.md:
  1. filename blocklist — no library-file names (utils/helpers/common/shared/misc)
  2. header contract — every .js file declares its single job ("— job:") and its
     owner ("Owner:") in a header comment
  3. size/export presumptions — a procedural file over 300 lines, or one with
     more than 8 function definitions, is presumed multi-job or a library until
     proven otherwise (warnings only; the job tests decide)
  4. one-function-per-file — every file except main.js may expose exactly ONE
     function/export at its module surface (private helpers inside are fine).
     Two or more exposed functions/exports is a violation. data/*_DATA.js are
     pure-data declarations, not functions, and are exempt.

Violations fail the run (exit 1); presumptions print as warnings and never fail.
The legacy findings (1-3) print first and are unchanged; findings from 4 are
reported in their own block with their own count.
Usage:  python3 dev/scripts/structure_audit.py
"""

import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
# The tooling lives in dev/scripts/ (§5); the tree under audit is the repo root.
REPO_ROOT = (os.path.dirname(os.path.dirname(_HERE))
             if os.path.basename(os.path.dirname(_HERE)) == "dev"
             else os.path.dirname(_HERE))
BLOCKLIST = re.compile(r"^(utils|helpers?|common|shared|misc)\.js$", re.IGNORECASE)
MAX_LINES = 300
MAX_FNS = 8


def _skip_string(t, i):
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


def _match_pair(t, i):
    """Index after the bracket matching t[i] ('{', '(' or '[')."""
    open_c, close_c = t[i], {"(": ")", "{": "}", "[": "]"}[t[i]]
    depth = 0
    while i < len(t):
        j = _skip_string(t, i)
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


def _fn_defined(text, name):
    return bool(
        re.search(r"\bfunction\s+" + re.escape(name) + r"\s*\(", text)
        or re.search(r"\b" + re.escape(name) + r"\s*=\s*(?:async\s+)?function\b", text)
        or re.search(r"\b" + re.escape(name) + r"\s*=\s*(?:async\s+)?"
                     r"(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>", text))


def _strip_comments(text):
    """Blank // and /* */ comments (outside strings), preserving offsets."""
    out, i, n = list(text), 0, len(text)
    while i < n:
        if text[i] in "\"'`":
            i = _skip_string(text, i)
        elif text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            out[i:j] = " " * (j - i)
            i = j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out[i:j] = " " * (j - i)
            i = j
        else:
            i += 1
    return "".join(out)


def _object_fn_keys(t, open_idx):
    """Names in the object literal at '{' open_idx that are functions."""
    end = _match_pair(t, open_idx)
    depth, start, i, segs = 1, open_idx + 1, open_idx + 1, []
    while i < end:
        j = _skip_string(t, i)
        if j != i:
            i = j
            continue
        c = t[i]
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
            if depth == 0:
                segs.append(t[start:i])
                break
        elif c == "," and depth == 1:
            segs.append(t[start:i])
            start = i + 1
        i += 1
    key_re = re.compile(r"\s*(?:(?:async|get|set|static)\s+)*\*?\s*"
                        r"([A-Za-z_$][\w$]*)\s*(?=[:=(,]|$)")
    names = []
    for seg in segs:
        if re.match(r"\s*(?:async\s+)?(?:get|set)\s+", seg):
            continue  # accessor: exposes a value, not a callable member
        m = key_re.match(seg)
        if not m:
            continue
        key, rest = m.group(1), seg[m.end():]
        is_fn = bool(re.match(r"\s*\(", rest)                             # method shorthand
                     or re.match(r"\s*:\s*(?:async\s+)?function\b", rest)
                     or re.match(r"\s*:\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>", rest)
                     or (re.match(r"\s*[,}]?\s*$", rest) and _fn_defined(t, key)))
        vm = re.match(r"\s*:\s*([A-Za-z_$][\w$]*)\s*$", rest)
        if vm and _fn_defined(t, vm.group(1)):                        # key: fnName
            is_fn = True
        if is_fn:
            names.append(key)
    return names


def _factory_return_fn_keys(t, body_open):
    """Function keys of the object returned at a factory body's top level."""
    end = _match_pair(t, body_open)
    depth, i = 1, body_open + 1
    while i < end - 1:
        j = _skip_string(t, i)
        if j != i:
            i = j
            continue
        c = t[i]
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
        elif (depth == 1 and t.startswith("return", i)
              and not (i and (t[i - 1].isalnum() or t[i - 1] in "_$"))):
            k = i + 6
            while k < end and t[k] in " \t\r\n":
                k += 1
            if k < end and t[k] == "{":
                return _object_fn_keys(t, k)
            i = k
            continue
        i += 1
    return []


def exposed_function_names(text):
    """Functions a file exposes: its ES exports or its registration surface."""
    text = _strip_comments(text)
    names = []
    # ES module forms (§8.1) — a file has one default export.
    for m in re.finditer(r"(?m)^\s*export\s+default\s+"
                         r"(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", text):
        names.append(m.group(1))
    if re.search(r"(?m)^\s*export\s+default\s+(?!\s*(?:async\s+)?function)", text):
        names.append("<default>")
    for m in re.finditer(r"(?m)^\s*export\s+(?:async\s+)?"
                         r"(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)",
                         text):
        names.append(m.group(1))
    for m in re.finditer(r"(?m)^\s*export\s*\{([^}]*)\}", text):
        names.extend(n.strip().split(" as ")[0].strip()
                     for n in m.group(1).split(",") if n.strip())
    # Legacy registration form: one payload returned to the parent.
    m = re.search(r"\._register(?:Module|Layer)?\s*\(\s*['\"][^'\"]*['\"]\s*,\s*", text)
    if m:
        i = m.end()
        if text.startswith("function", i):
            fm = re.match(r"function\s*([A-Za-z_$][\w$]*)", text[i:])
            names.append(fm.group(1) if fm else "<factory>")
        elif i < len(text) and text[i] == "{":
            names.extend(_object_fn_keys(text, i))
        else:
            arrow = text.find("=>", i)
            brace = text.find("{", arrow + 2) if arrow >= 0 else -1
            if brace >= 0:
                names.extend(_factory_return_fn_keys(text, brace))
    return names


def list_js_files():
    out = []
    for root, dirs, names in os.walk(REPO_ROOT):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("dev", "snd-versions")]
        for n in sorted(names):
            if n.endswith(".js"):
                out.append(os.path.relpath(os.path.join(root, n), REPO_ROOT))
    return sorted(out)


def check(path):
    violations, warnings = [], []
    name = os.path.basename(path)
    if BLOCKLIST.match(name):
        violations.append(f"{path}: library-file name ('{name}' is on the structure blocklist)")

    with open(os.path.join(REPO_ROOT, path), encoding="utf-8") as fh:
        text = fh.read()
    lines = text.splitlines()
    header = "\n".join(lines[:12])
    if "\u2014 job:" not in header and "job:" not in header:
        violations.append(f"{path}: missing header contract — no 'job:' declaration in the first 12 lines")
    if not re.search(r"(?m)^\s*//\s*Owner:", header):
        violations.append(f"{path}: missing header contract — no 'Owner:' declaration in the first 12 lines")

    n_lines = len(lines)
    n_fns = len(re.findall(r"\bfunction\s+\w*\s*\(", text))
    if n_lines > MAX_LINES:
        warnings.append(f"{path}: presumed multi-job — {n_lines} lines (> {MAX_LINES})")
    if n_fns > MAX_FNS:
        warnings.append(f"{path}: presumed library — {n_fns} function definitions (> {MAX_FNS})")
    return violations, warnings


def check_one_export(path):
    """§1/§8.1: a file's module surface is exactly one function (main.js exempt)."""
    name = os.path.basename(path)
    if path == "main.js" or name.endswith("_DATA.js"):
        return []
    with open(os.path.join(REPO_ROOT, path), encoding="utf-8") as fh:
        text = fh.read()
    names = exposed_function_names(text)
    if len(names) >= 2:
        return [f"{path}: exposes {len(names)} functions/exports "
                f"({', '.join(names)}); one file = one function (§1, §8.1)"]
    return []


def main():
    violations, warnings = [], []
    for path in list_js_files():
        v, w = check(path)
        violations.extend(v)
        warnings.extend(w)
    for v in violations:
        print(v)
    for w in warnings:
        print("warning: " + w)
    print(f"structure_audit: {len(violations)} violation(s), {len(warnings)} warning(s)")
    # New §7.3/§8.9 check, reported separately so the legacy verdict above is
    # unchanged and its count can be tracked against the v94 baseline.
    one_export_viols = []
    for path in list_js_files():
        one_export_viols.extend(check_one_export(path))
    for v in one_export_viols:
        print("one-function-per-file: " + v)
    print(f"one-function-per-file check: {len(one_export_viols)} violation(s)")
    return 1 if (violations or one_export_viols) else 0


if __name__ == "__main__":
    sys.exit(main())
