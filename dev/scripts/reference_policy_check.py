#!/usr/bin/env python3
"""reference_policy_check.py — enforce the reference policy over the repo tree.

Policy (root constraint, decomposed categories):
  R1 (inbound-cap):  a game file (anything outside dev/) may be referenced by at
     most ONE other file.  A second inbound reference is a violation.
  R2 (dev-boundary): a non-dev file may never reference a file inside dev/.

WHAT COUNTS AS A REFERENCE (mirrors dev/scripts/reference_audit.py, the
project's normative instrument):
  - basename-mention: the target's filename (e.g. `game.js`) appears in the
    source's text.
  - stem-mention: the target's module-style stem (contains an uppercase
    letter, e.g. `resolveZoomStep`) appears as a bare word.
  - binding-mention: one of the target's top-level bindings (the factory-global
    surface, e.g. `Game` for game.js) appears in use position (`Name.x` /
    `Name(`), and the source neither defines that name itself nor takes it as
    a parameter.
  - load-path: a quoted literal resolving to the target's repo path (the
    `X children/...` loader lists).
  - html-script: a `src="..."` reference in an HTML file.
  - asset-path: a quoted `assets/...` literal resolving to a tracked asset.

SCRUBS (declarations, not references):
  - a source's header banner lines (`// ... job: ...`, `// Owner: ...`).
  - `X children/...` path literals are layout declarations and are blanked
    from mention scanning (they produce load-path edges instead).
  - self-mentions; names the source defines or receives as parameters.

INTERPRETATIONS (see dev/docs/REFERENCE_POLICY_VIOLATIONS.md §2):
  - main.js is exempt as a REFERRER (central-loader allowance: the loader names
    every load target and binding while the ownership edge stays the parent's).
    Pass --count-main-js for the literal reading.
  - dev/ files do not count as referrers toward game-file fan-in (documentation
    and tooling reference game files as bookkeeping; the constraint grants dev
    files broad referencing latitude).  Pass --count-dev-referrers to include.
  - comment and string mentions count as references (a file being NAMED is the
    policy's concern), with the context recorded so remedies can say "reword".
  - CI dispatch allowance: files under .github/workflows/ are exempt as
    REFERRERS (the workflow layer lives there by platform mandate and names
    the tooling it dispatches — same declaration-not-reference shape as the
    central-loader allowance).

Exit codes: 0 = clean, 1 = violations found, 2 = usage/IO error.

Stdout listing (plain text, CI-log friendly; ANSI color only on a TTY):
violations are grouped by violating file, and each block states the file, its
referrers (kind + context + line), the rule violated in plain language, and a
concrete remedy naming the files to touch; a summary line (total violations,
files affected, contributor-doc pointer) closes the output.

Usage:
  python3 dev/scripts/reference_policy_check.py                 # scan + report to stdout
  python3 dev/scripts/reference_policy_check.py --repo PATH     # scan another tree
  python3 dev/scripts/reference_policy_check.py --report FILE   # also write markdown report
  python3 dev/scripts/reference_policy_check.py --json FILE     # also write violations JSON
  python3 dev/scripts/reference_policy_check.py --emit-graph F  # write reference-graph/1 JSON
  python3 dev/scripts/reference_policy_check.py --graph F       # check a precomputed graph
  python3 dev/scripts/reference_policy_check.py --exemptions F  # JSON pair exemptions
"""

import argparse
import datetime
import json
import os
import re
import sys

GRAPH_SCHEMA = "reference-graph/1"

TEXT_EXT = (".js", ".html", ".css", ".json", ".md", ".txt", ".sh", ".conf",
            ".yml", ".yaml", ".py")
SKIP_DIRS = {".git", "__pycache__", "node_modules", "dist", "build"}

DEV_DIR = "dev"

# ---- text plumbing ---------------------------------------------------------

def read_text(path):
    if not path.endswith(TEXT_EXT):
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except (UnicodeDecodeError, OSError):
        return None


def list_files(root):
    out = []
    for dirpath, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for n in sorted(names):
            rel = os.path.normpath(os.path.relpath(os.path.join(dirpath, n), root))
            out.append(rel)
    return sorted(out)


def scrub_headers(text):
    """Blank header-contract declaration lines (— job: / job: / Owner:)."""
    out = []
    for ln in text.splitlines(keepends=True):
        s = ln.lstrip()
        if s.startswith("//"):
            body = s[2:].lstrip()
            if body.startswith("job:") or body.startswith("Owner:") or "\u2014 job:" in body:
                out.append("\n" if ln.endswith("\n") else "")
                continue
        out.append(ln)
    return "".join(out)


CHILDREN_LIT_RE = re.compile(r"\"[^\"\n]* children/[^\"\n]*\"|'[^'\n]* children/[^'\n]*'")


def blank_children_literals(text):
    return CHILDREN_LIT_RE.sub(lambda m: " " * len(m.group(0)), text)


def context_mask(text):
    """Per-char context: 'code', 'comment' or 'string' (strings first, like
    reference_audit.blank_spans — '//' inside a string is not a comment)."""
    mask = ["code"] * len(text)
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in "\"'`":
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == ch:
                    j += 1
                    break
                j += 1
            for k in range(i, min(j, n)):
                mask[k] = "string"
            i = j
        elif text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                mask[k] = "comment"
            i = j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, min(j, n)):
                mask[k] = "comment"
            i = j
        else:
            i += 1
    return mask


def own_names(text):
    """Names the file defines or receives as parameters (shadowing filter)."""
    names = set()
    for m in re.finditer(r"^[ \t]*(?:const|let|var)\s+([A-Za-z_$][\w$]*)", text, re.M):
        names.add(m.group(1))
    for m in re.finditer(r"\bfunction\s*([A-Za-z_$][\w$]*)\s*\(", text):
        if m.group(1):
            names.add(m.group(1))
    for m in re.finditer(r"\bfunction\s*[\w$]*\s*\(([^)]*)\)", text):
        for p in m.group(1).split(","):
            p = p.strip().split("=")[0].strip().lstrip("...")
            if re.fullmatch(r"[A-Za-z_$][\w$]*", p or ""):
                names.add(p)
    for m in re.finditer(r"\(([^()]*)\)\s*=>", text):
        for p in m.group(1).split(","):
            p = p.strip().split("=")[0].strip().lstrip("...")
            if re.fullmatch(r"[A-Za-z_$][\w$]*", p or ""):
                names.add(p)
    return names


def top_bindings(text):
    """Top-level factory-global bindings (the file's referenceable surface)."""
    names = set()
    for m in re.finditer(r"^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", text, re.M):
        names.add(m.group(1))
    for m in re.finditer(r"^function\s+([A-Za-z_$][\w$]*)\s*\(", text, re.M):
        names.add(m.group(1))
    return names


# ---- graph construction ----------------------------------------------------

def tag_of(rel):
    if rel == DEV_DIR or rel.startswith(DEV_DIR + os.sep):
        return "dev"
    return "game"


def patterns_for(rel, file_texts):
    """Match patterns for a target file: (kind, regex-plain-string, is_bare_word)."""
    base = os.path.basename(rel)
    pats = [("basename-mention", base, False)]
    if rel.endswith(".js"):
        stem = base[:-3]
        if any(c.isupper() for c in stem):
            pats.append(("stem-mention", stem, True))
        text = file_texts.get(rel)
        if text is not None:
            for b in sorted(top_bindings(scrub_headers(text))):
                if b != stem and b != base:
                    pats.append(("binding-mention", b, True))
    return pats


def build_graph(root, count_main_js, count_dev_referrers):
    files = list_files(root)
    tracked = set(files)
    file_texts = {}
    for rel in files:
        t = read_text(os.path.join(root, rel))
        if t is not None:
            file_texts[rel] = t

    nodes = [{"path": rel, "tag": tag_of(rel)} for rel in files]
    edges = []
    unresolved = []

    pat_cache = {rel: patterns_for(rel, file_texts) for rel in files}

    for src in files:
        raw = file_texts.get(src)
        if raw is None:
            continue
        scrubbed = scrub_headers(raw)
        # load-path edges from `X children/...` literals (layout declarations
        # for mention scanning, but they ARE the loader's edge to the leaf).
        for m in CHILDREN_LIT_RE.finditer(scrubbed):
            lit = m.group(0)[1:-1]
            if lit in tracked:
                edges.append({"from": src, "to": lit, "kind": "load-path",
                              "line": scrubbed.count("\n", 0, m.start()) + 1,
                              "context": "code"})
            else:
                unresolved.append({"from": src, "literal": lit})
        # html-script / asset-path literals
        if src.endswith(".html"):
            for m in re.finditer(r"src=[\"']([^\"']+)[\"']", scrubbed):
                if m.group(1) in tracked:
                    edges.append({"from": src, "to": m.group(1), "kind": "html-script",
                                  "line": scrubbed.count("\n", 0, m.start()) + 1,
                                  "context": "code"})
        for m in re.finditer(r"[\"'](assets/[^\"']+)[\"']", scrubbed):
            if m.group(1) in tracked:
                edges.append({"from": src, "to": m.group(1), "kind": "asset-path",
                              "line": scrubbed.count("\n", 0, m.start()) + 1,
                              "context": "code"})

        text = blank_children_literals(scrubbed)
        mask = context_mask(text)
        lines = text.splitlines(keepends=True)
        line_start = []
        acc = 0
        for ln in lines:
            line_start.append(acc)
            acc += len(ln)
        own = own_names(text)

        for dst in files:
            if dst == src:
                continue
            for kind, pat, bare in pat_cache[dst]:
                if bare and pat in own:
                    continue  # source defines/receives this name: shadowing
                if bare:
                    rx = re.compile(r"(?<![\w$.])" + re.escape(pat) +
                                    (r"(?=\.\w|\s*\()" if kind == "binding-mention"
                                     else r"(?![\w$])"))
                else:
                    rx = re.compile(re.escape(pat))
                for m in rx.finditer(text):
                    off = m.start()
                    line_no = 0
                    for i, st in enumerate(line_start):
                        if st <= off:
                            line_no = i + 1
                        else:
                            break
                    edge = {"from": src, "to": dst, "kind": kind, "line": line_no,
                            "context": mask[off]}
                    if kind == "binding-mention":
                        # v102 scrub refinement: an object-literal method key
                        # (`GetGameState(box) { ... }`) is a declaration of the
                        # composer surface, not a use of the parent binding —
                        # policy §2.2 scrubs declarations. Only a call tail that
                        # closes into a block start matches this shape; a plain
                        # call (statement or argument) never does.
                        if re.match(r"\s*\([^)]{0,50}\)\s*\{",
                                    text[m.end():m.end() + 60]):
                            continue
                        after = text[m.end():m.end() + 20]
                        if re.match(r"\s*\.\s*_register\b", after):
                            edge["note"] = "X._register handshake"
                    edges.append(edge)

    inbound = {rel: 0 for rel in files}
    outbound = {rel: 0 for rel in files}
    counted = count_edges(edges, count_main_js, count_dev_referrers)
    for (src, dst) in counted:
        inbound[dst] = inbound.get(dst, 0) + 1
        outbound[src] = outbound.get(src, 0) + 1

    return {
        "schema": GRAPH_SCHEMA,
        "repo": os.path.abspath(root),
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "nodes": nodes,
        "edges": edges,
        "inbound_count": inbound,
        "outbound_count": outbound,
        "unresolved_literals": unresolved,
    }


def is_ci_dispatch(src):
    """CI dispatch allowance: GitHub Actions workflow files live under
    .github/workflows/ by platform mandate and necessarily name the dev/
    tooling (or other files) they dispatch — the same declaration-not-
    reference shape as the main.js central-loader allowance."""
    return src.startswith(".github/workflows/")


def count_edges(edges, count_main_js, count_dev_referrers):
    """Distinct (src, dst) pairs that count toward fan-in, after allowances."""
    pairs = set()
    for e in edges:
        src, dst = e["from"], e["to"]
        if not count_main_js and src == "main.js":
            continue
        if is_ci_dispatch(src):
            continue
        if not count_dev_referrers and tag_of(src) == "dev":
            continue
        pairs.add((src, dst))
    return pairs


# ---- policy checks ---------------------------------------------------------

REMEDY_REWORD = ("Reword the comment/string that names the file (a file may be "
                 "named only by its parent) — no code change required.")
REMEDY_REGISTRAR = ("Retire the X._register registrar handshake: the parent's "
                    "loader must capture the child's single function instead of "
                    "the child registering itself (A01-A08 pattern).")
REMEDY_FACADE = ("Collapse the facade re-export: the grandparent must consume "
                 "the parent's composed surface instead of naming the "
                 "grandchild directly.")
REMEDY_STANDARD = ("Inline the shared code, introduce an indirection/registry "
                   "layer with a single owner, merge the duplicate consumers, "
                   "or move the file into dev/ if it is genuinely dev-only.")
REMEDY_DEV_BOUNDARY = ("Move the referenced file out of dev/, duplicate the "
                       "needed logic into the game tree, or invert the "
                       "dependency behind an interface the game tree owns.")

# Plain-language rule statements printed in the violation listing so a
# contributor can fix a finding without opening the policy document.
RULE_TEXT = {
    "R1-inbound-cap": ("file referenced by more than one file — a game file "
                       "may be referenced by at most one other file"),
    "R2-dev-boundary": ("file references into dev/ — a file outside dev/ may "
                        "never reference a file inside dev/"),
}

# Contributor-doc pointer printed in the summary line of the violation
# listing (kept in sync with dev/scripts/reference_policy_gate.py).
DOC_POINTER = 'dev/docs/REFERENCE_POLICY_CI.md ("Approved remedies")'


def quote(path):
    return "'%s'" % path


def fmt_names(paths):
    return ", ".join(quote(p) for p in sorted(paths))


def concrete_remedy_r1(target, parent, extra, remedies_so_far):
    """First-line remedy naming the actual files involved (task-level
    requirement: 'move this function into <X> or inline it into <Y>')."""
    best = {}
    for e in extra:
        f = e["from"]
        if f not in best or (e["context"] == "code" and best[f]["context"] != "code"):
            best[f] = e
    # code-context referrers first: they are the ones that must change code
    extra_files = sorted(best, key=lambda f: (best[f]["context"] != "code", f))
    if not extra_files:
        return None
    if any(e.get("note") == "X._register handshake" for e in extra):
        return ("Retire the X._register handshake in %s: %s must capture this "
                "file's single function at load instead of the file registering "
                "itself." % (fmt_names(extra_files),
                             quote(parent) if parent else "its owner"))
    if all(e["context"] in ("comment", "string") for e in extra):
        return ("Reword the comment/string mention in %s — a file may be named "
                "only by its owner %s (no code change required)."
                % (fmt_names(extra_files),
                   quote(parent) if parent else "(none yet)"))
    gp_note = (REMEDY_FACADE in remedies_so_far)
    if gp_note and parent:
        return ("Collapse the facade re-export: %s must consume %s's composed "
                "surface instead of naming this file directly."
                % (fmt_names(extra_files), quote(parent)))
    if parent:
        return ("Move this file's code into %s or inline it into %s, then drop "
                "the remaining direct mention from %s — a game file may have "
                "exactly one referencing file."
                % (quote(parent), quote(extra_files[0]),
                   fmt_names(extra_files[1:]) if len(extra_files) > 1
                   else quote(extra_files[0])))
    return ("Give this file exactly one owner: move it under %s children/ and "
            "load it only from %s; drop the direct mentions from %s."
            % (quote("main.js"), quote("main.js"), fmt_names(extra_files)))


def concrete_remedy_r2(source, target):
    return ("Move %s out of dev/ into the game tree where %s can own it, "
            "duplicate the small needed logic into %s, or invert the "
            "dependency behind an interface the game tree owns."
            % (quote(target), quote(source), quote(source)))


def parent_of(rel, tracked):
    """Ownership parent from the '<exact filename> children' folder convention."""
    d = os.path.dirname(rel)
    folder = os.path.basename(d)
    if folder.endswith(" children"):
        pbase = folder[: -len(" children")]
        cand = os.path.normpath(os.path.join(os.path.dirname(d), pbase))
        if cand in tracked:
            return cand
    if d == "main.js children":
        return "main.js"
    if rel == "main.js":
        return "index.html"  # entry-point owner edge (policy §4.4)
    return None


def check_policy(graph, exemptions):
    violations = []
    tracked = {n["path"] for n in graph["nodes"]}
    tags = {n["path"]: n.get("tag", tag_of(n["path"])) for n in graph["nodes"]}
    pairs = count_edges(graph["edges"], graph.get("_count_main_js", False),
                        graph.get("_count_dev_referrers", False))

    # group counted referrers per target with their edge details; one
    # representative edge per (src, dst) pair — code context preferred over
    # comment/string, then earliest line.
    by_pair = {}
    for e in graph["edges"]:
        key = (e["from"], e["to"])
        if key not in pairs:
            continue
        by_pair.setdefault(key, []).append(e)
    referrers = {}
    for (src, dst), es in by_pair.items():
        best = sorted(es, key=lambda x: (x["context"] != "code", x["line"]))[0]
        referrers.setdefault(dst, []).append(best)

    exempt_pairs = {(x["target"], x.get("referrer")) for x in exemptions}

    # R1 inbound-cap (game targets only)
    for dst in sorted(referrers):
        if tags.get(dst) == "dev":
            continue  # R1 caps game files only (category definition)
        refs = [e for e in referrers[dst]
                if (dst, e["from"]) not in exempt_pairs and (dst, None) not in exempt_pairs]
        if len(refs) <= 1:
            continue
        parent = parent_of(dst, tracked)
        extra = [e for e in refs if e["from"] != parent]
        remedies = []
        if any(e.get("note") == "X._register handshake" for e in extra):
            remedies.append(REMEDY_REGISTRAR)
        if all(e["context"] in ("comment", "string") for e in extra):
            remedies.append(REMEDY_REWORD)
        gp = parent_of(parent, tracked) if parent else None
        if gp and extra and all(e["from"] == gp for e in extra):
            remedies.append(REMEDY_FACADE)
        if not remedies:
            remedies.append(REMEDY_STANDARD)
        if parent is None or not any(e["from"] == parent for e in refs):
            remedies.append("No single owner claims this file via the folder "
                            "convention — assign exactly one owning parent.")
        concrete = concrete_remedy_r1(dst, parent, extra, remedies)
        if concrete:
            remedies.insert(0, concrete)
        violations.append({
            "rule": "R1-inbound-cap",
            "target": dst,
            "tag": tags.get(dst, "game"),
            "parent": parent,
            "inbound": len(refs),
            "referrers": [{"file": e["from"], "kind": e["kind"], "line": e["line"],
                           "context": e["context"], **({"note": e["note"]} if e.get("note") else {})}
                          for e in sorted(refs, key=lambda x: (x["from"], x["line"]))],
            "remedies": remedies,
        })

    # R2 dev-boundary (non-dev source -> dev target), one violation per
    # (source, target) pair with all mention locations
    r2_pairs = {}
    for e in graph["edges"]:
        src, dst = e["from"], e["to"]
        if tags.get(src) == "dev" or tags.get(dst) != "dev":
            continue
        if is_ci_dispatch(src):
            continue  # CI dispatch of dev tooling is a declaration, not a dependency
        if (dst, src) in exempt_pairs or (dst, None) in exempt_pairs:
            continue
        r2_pairs.setdefault((src, dst), []).append(e)
    for (src, dst) in sorted(r2_pairs):
        es = sorted(r2_pairs[(src, dst)], key=lambda x: x["line"])
        kinds = sorted({e["kind"] for e in es})
        violations.append({
            "rule": "R2-dev-boundary",
            "target": dst,
            "source": src,
            "kind": ", ".join(kinds),
            "line": es[0]["line"],
            "lines": [e["line"] for e in es],
            "context": es[0]["context"],
            "remedies": [concrete_remedy_r2(src, dst), REMEDY_DEV_BOUNDARY],
        })
    return violations


# ---- reporting -------------------------------------------------------------

def summarize(violations):
    by_rule = {}
    by_dir = {}
    for v in violations:
        by_rule[v["rule"]] = by_rule.get(v["rule"], 0) + 1
        d = os.path.dirname(v["target"]) or "(repo root)"
        by_dir.setdefault(d, {}).setdefault(v["rule"], 0)
        by_dir[d][v["rule"]] += 1
    return by_rule, by_dir


def render_stdout(violations, graph, args):
    """Plain-text, CI-log-friendly listing, grouped by violating file.

    Every violation block states: the violating file path, the files that
    reference it (the referrers), the rule violated in plain language, and a
    concrete remedy naming the files to touch.  Multiple broken rules on one
    file share a single FILE block.  A summary line closes the output.

    Color is added only when stdout is a TTY (and NO_COLOR is unset); no
    information is carried by color alone.  Exit-code contract is unchanged:
    non-zero on any violation.
    """
    use_color = sys.stdout.isatty() and "NO_COLOR" not in os.environ

    def st(code, s):
        return "\033[%sm%s\033[0m" % (code, s) if use_color else s

    print("reference-policy check — repo:", graph.get("repo", args.repo))
    if not violations:
        print("TOTAL VIOLATIONS: 0")
        return 0

    # group by violating file: R1 flags the target (it is over-referenced),
    # R2 flags the source (it is the file reaching into dev/).
    groups = {}
    for v in violations:
        key = v["target"] if v["rule"] == "R1-inbound-cap" else v["source"]
        groups.setdefault(key, []).append(v)

    def group_key(item):
        path, vs = item
        return (-len(vs), path)

    for path, vs in sorted(groups.items(), key=group_key):
        print()
        print(st("1", "FILE %s" % path))
        for v in vs:
            rule = v["rule"]
            print("  %s  %s" % (st("31", "rule %s:" % rule),
                                RULE_TEXT.get(rule, rule)))
            if rule == "R1-inbound-cap":
                print("  this file is referenced by %d file(s) (cap: 1) — "
                      "owner (folder convention): %s"
                      % (v["inbound"], v["parent"] or "(none)"))
                print("  referrers (files that reference it):")
                for r in v["referrers"]:
                    note = "  [%s]" % r["note"] if r.get("note") else ""
                    print("    - %s  (%s %s:%d)%s"
                          % (r["file"], r["kind"], r["context"], r["line"], note))
            else:
                print("  this file references dev/ files it may not touch:")
                print("    - %s  (%s %s:%d)"
                      % (v["target"], v["kind"], v["context"], v["line"]))
            print("  %s" % st("32", "suggested remedy:"))
            for rem in v["remedies"]:
                print("    - %s" % rem)
    print()
    by_rule, _ = summarize(violations)
    print(st("1", "SUMMARY"))
    print("  TOTAL VIOLATIONS: %d in %d file(s)  (%s)"
          % (len(violations), len(groups),
             ", ".join("%s: %d" % (r, by_rule[r]) for r in sorted(by_rule))))
    print("  Rules and approved remedies: %s" % DOC_POINTER)
    return len(violations)


def render_report(violations, graph, args, exemptions):
    by_rule, by_dir = summarize(violations)
    total = len(violations)
    out = []
    a = out.append
    a("# Reference-policy violation report")
    a("")
    a("Generated by `dev/scripts/reference_policy_check.py` on %s." % graph.get("generated", "?"))
    a("Repository: `%s`" % graph.get("repo", args.repo))
    a("")
    a("## Headline")
    a("")
    a("**TOTAL VIOLATIONS: %d**" % total)
    a("")
    a("| rule | violations |")
    a("|---|---|")
    for rule in sorted(by_rule):
        a("| %s | %d |" % (rule, by_rule[rule]))
    if not by_rule:
        a("| — | 0 |")
    a("")
    a("This total is the measurement baseline: progress after the refactor is "
      "the drop in this number (target: 0, and the checker exits 0).")
    a("")
    a("## 1. Rules checked")
    a("")
    a("- **R1 inbound-cap** — a game file (anything outside `dev/`) may be "
      "referenced by at most one other file. Violation unit: the target file.")
    a("- **R2 dev-boundary** — a non-dev file may never reference a file inside "
      "`dev/`. Violation unit: the offending (source, target) edge.")
    a("")
    a("## 2. What counts as a reference (interpretations)")
    a("")
    a("1. A reference is raw-text naming of the target file in another file: its "
      "basename (`game.js`), its module-style stem (`resolveZoomStep`), or one "
      "of its top-level bindings in use position (`Game.` / `Game(`), plus "
      "load-path literals, HTML `src=` references and `assets/...` literals. "
      "This mirrors `dev/scripts/reference_audit.py` checks 1/2, the project's "
      "normative reference instrument.")
    a("2. Scrubbed as declarations, not references: header banner lines "
      "(`— job:` / `job:` / `Owner:`), `X children/...` path literals (layout "
      "declarations; they produce `load-path` edges instead), self-mentions, "
      "and names the source defines or receives as parameters (shadowing).")
    a("3. Comment and string mentions count as references (a file being named "
      "is the policy's concern; `reference_audit.py` check 1 counts raw text "
      "for the same reason). Each finding records its context so prose-only "
      "findings can be fixed by rewording.")
    a("4. **Central-loader allowance**: `main.js` is exempt as a *referrer* — "
      "the central loader names every load target and binding while the "
      "ownership edge stays the parent's (v99 allowance, same exemption as "
      "`reference_audit.py` checks 1/2). `--count-main-js` disables this.")
    a("5. **dev/ referrers do not count toward game-file fan-in** — dev docs "
      "and tooling reference game files as bookkeeping, and the constraint "
      "grants dev files broad referencing latitude ('files within the dev "
      "directory may reference more files'). `--count-dev-referrers` disables "
      "this (the raw count is given in appendix A).")
    a("6. R1 caps game files only, per the violation-category definition "
      "('game file with more than one inbound reference').")
    a("7. **CI dispatch allowance**: files under `.github/workflows/` are "
      "exempt as *referrers* — the workflow layer lives there by platform "
      "mandate and necessarily names the dev/ tooling it dispatches (same "
      "declaration-not-reference shape as the central-loader allowance).")
    if exemptions:
        a("8. Pair exemptions applied: %d (see `--exemptions`)." % len(exemptions))
    a("")
    a("## 3. Summary per directory")
    a("")
    a("| directory | R1 | R2 | total |")
    a("|---|---|---|---|")
    for d in sorted(by_dir):
        r1 = by_dir[d].get("R1-inbound-cap", 0)
        r2 = by_dir[d].get("R2-dev-boundary", 0)
        a("| `%s` | %d | %d | %d |" % (d, r1, r2, r1 + r2))
    a("")
    a("## 4. R1 inbound-cap — itemized (%d violations)" % by_rule.get("R1-inbound-cap", 0))
    a("")
    r1s = [v for v in violations if v["rule"] == "R1-inbound-cap"]
    r1s.sort(key=lambda v: (-v["inbound"], v["target"]))
    for i, v in enumerate(r1s, 1):
        a("### R1-%03d `%s`" % (i, v["target"]))
        a("")
        a("- inbound references: **%d** (cap: 1) — owner (folder convention): `%s`"
          % (v["inbound"], v["parent"] or "(none)"))
        a("- referencing files:")
        for r in v["referrers"]:
            note = " — %s" % r["note"] if r.get("note") else ""
            a("  - `%s` (%s, %s context, line %d)%s"
              % (r["file"], r["kind"], r["context"], r["line"], note))
        a("- recommended remedy:")
        for rem in v["remedies"]:
            a("  - %s" % rem)
        a("")
    a("## 5. R2 dev-boundary — itemized (%d violations)" % by_rule.get("R2-dev-boundary", 0))
    a("")
    r2s = [v for v in violations if v["rule"] == "R2-dev-boundary"]
    if not r2s:
        a("None. No file outside `dev/` references anything inside `dev/`.")
        a("")
    for i, v in enumerate(r2s, 1):
        a("### R2-%03d `%s` -> `%s`" % (i, v["source"], v["target"]))
        a("")
        a("- reference: %s (%s context, line %d)" % (v["kind"], v["context"], v["line"]))
        a("- recommended remedy: %s" % v["remedies"][0])
        a("")
    a("## 6. Remediation plan reference")
    a("")
    a("R1 remedies (policy remediation plan): inline the shared code; introduce "
      "an indirection/registry layer with a single owner; merge the duplicate "
      "consumers; or move the file into `dev/` if it is genuinely dev-only. "
      "Structural sub-cases named per violation: registrar-handshake retire "
      "(the A01–A08 pattern), facade re-export collapse, comment reword.")
    a("")
    a("R2 remedies (policy remediation plan): move the referenced file out of "
      "`dev/`, duplicate the needed logic into the game tree, or invert the "
      "dependency behind an interface the game tree owns.")
    a("")
    a("Blast radius order for the refactor: work R1 items in the order listed "
      "in §4 (descending inbound count).")
    a("")
    a("## Appendix A — excluded from counts")
    a("")
    dev_pairs = sorted({(e["from"], e["to"]) for e in graph["edges"]
                        if tag_of(e["from"]) == "dev" and tag_of(e["to"]) != "dev"})
    main_pairs = sorted({(e["from"], e["to"]) for e in graph["edges"]
                         if e["from"] == "main.js"})
    a("- dev/ -> game mentions (excluded as referrers by interpretation 5): "
      "**%d** distinct (dev file, game file) pairs." % len(dev_pairs))
    a("- main.js -> * naming (excluded as referrer by interpretation 4): "
      "**%d** distinct pairs." % len(main_pairs))
    if graph.get("unresolved_literals"):
        a("- unresolved path literals (documented allowlist — literals that do "
          "not resolve to a tracked file, e.g. prose strings that spell a path):")
        for u in graph["unresolved_literals"]:
            a("  - `%s`: `%s`" % (u["from"], u["literal"]))
    a("")
    a("## Appendix B — reproducibility")
    a("")
    a("```")
    a("python3 dev/scripts/reference_policy_check.py --report dev/docs/REFERENCE_POLICY_VIOLATIONS.md")
    a("```")
    a("")
    a("Machine-readable output: `--json FILE` (violations) and `--emit-graph FILE` "
      "(the `%s` reference graph consumed by `--graph FILE`)." % GRAPH_SCHEMA)
    a("Exit code is 1 while violations exist, 0 when the tree is clean.")
    return "\n".join(out) + "\n"


# ---- entry point -----------------------------------------------------------

def load_graph_file(path):
    with open(path, encoding="utf-8") as fh:
        g = json.load(fh)
    if "nodes" not in g or "edges" not in g:
        raise ValueError("graph file must contain 'nodes' and 'edges'")
    for e in g["edges"]:
        e.setdefault("kind", "basename-mention")
        e.setdefault("line", 0)
        e.setdefault("context", "code")
    return g


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check the repo against the reference policy.")
    ap.add_argument("--repo", default=None, help="repository root (default: inferred from script location)")
    ap.add_argument("--graph", default=None, help="check a precomputed %s JSON instead of scanning" % GRAPH_SCHEMA)
    ap.add_argument("--emit-graph", default=None, help="write the computed reference graph JSON")
    ap.add_argument("--report", default=None, help="write the markdown violation report here")
    ap.add_argument("--json", dest="json_out", default=None, help="write violations JSON here")
    ap.add_argument("--exemptions", default=None, help="JSON file of {target, referrer?, reason} exemptions")
    ap.add_argument("--count-main-js", action="store_true",
                    help="count main.js as a referrer (disables the central-loader allowance)")
    ap.add_argument("--count-dev-referrers", action="store_true",
                    help="count dev/ files as referrers toward game-file fan-in")
    args = ap.parse_args(argv)

    if args.repo is None and args.graph is None:
        here = os.path.dirname(os.path.abspath(__file__))
        base = os.path.dirname(here)
        args.repo = os.path.dirname(base) if os.path.basename(base) == "dev" else base

    try:
        if args.graph:
            graph = load_graph_file(args.graph)
        else:
            if not os.path.isdir(args.repo):
                print("error: repo root not found: %s" % args.repo, file=sys.stderr)
                return 2
            graph = build_graph(args.repo, args.count_main_js, args.count_dev_referrers)
        exemptions = []
        if args.exemptions:
            with open(args.exemptions, encoding="utf-8") as fh:
                exemptions = json.load(fh)

        graph["_count_main_js"] = args.count_main_js
        graph["_count_dev_referrers"] = args.count_dev_referrers
        violations = check_policy(graph, exemptions)

        if args.emit_graph:
            out = {k: v for k, v in graph.items() if not k.startswith("_")}
            with open(args.emit_graph, "w", encoding="utf-8") as fh:
                json.dump(out, fh, indent=1)
        if args.json_out:
            with open(args.json_out, "w", encoding="utf-8") as fh:
                json.dump({"schema": GRAPH_SCHEMA + "/violations",
                           "generated": graph.get("generated"),
                           "total": len(violations),
                           "violations": violations}, fh, indent=1)
        if args.report:
            with open(args.report, "w", encoding="utf-8") as fh:
                fh.write(render_report(violations, graph, args, exemptions))

        n = render_stdout(violations, graph, args)
        return 1 if n else 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
