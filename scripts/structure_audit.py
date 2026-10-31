#!/usr/bin/env python3
"""structure_audit.py — machine-check the structural compliance rules.

Implements the checkable parts of docs/ARCHITECTURE_COMPLIANCE.md:
  1. filename blocklist — no library-file names (utils/helpers/common/shared/misc)
  2. header contract — every .js file declares its single job ("— job:") and its
     owner ("Owner:") in a header comment
  3. size/export presumptions — a procedural file over 300 lines, or one with
     more than 8 function definitions, is presumed multi-job or a library until
     proven otherwise (warnings only; the job tests decide)

Violations fail the run (exit 1); presumptions print as warnings and never fail.
Usage:  python3 scripts/structure_audit.py
"""

import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOCKLIST = re.compile(r"^(utils|helpers?|common|shared|misc)\.js$", re.IGNORECASE)
MAX_LINES = 300
MAX_FNS = 8


def list_js_files():
    out = []
    for root, dirs, names in os.walk(REPO_ROOT):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("deploy", "snd-versions")]
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
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
