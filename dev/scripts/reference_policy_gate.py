#!/usr/bin/env python3
"""Reference-policy CI gate.

Single entry point for CI and local use (the exact command CI runs):

    python3 dev/scripts/reference_policy_gate.py

Pipeline:
  1. dev/scripts/reference_graph.py — build the static JSON reference graph
     (summary printed; fails the gate on non-allowlisted unresolved refs).
  2. dev/scripts/reference_policy_check.py — canonical self-scan mode: check
     the tree against the policy and print the actionable violation listing
     (violating file, its referencing files with reference kind and line, the
     violated rule, and the approved remedy).

Note: the checker's `--graph` mode consumes a precomputed graph and only sees
structural edges; its self-scan is strictly stronger (it mirrors
dev/scripts/reference_audit.py mentions) and matches the committed violation
report, so the gate uses the self-scan as the policy verdict.

Exit codes: 0 = policy satisfied, 1 = violations found, 2 = tool failure.

Rules enforced (summary — normative text in dev/docs/REFERENCE_POLICY.md):
  R1  No game file may be referenced by more than one other file.
  R2  No file outside dev/ may reference anything inside dev/.

Contributor guide: dev/docs/REFERENCE_POLICY_CI.md
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ANALYZER = os.path.join(REPO_ROOT, "dev", "scripts", "reference_graph.py")
CHECKER = os.path.join(REPO_ROOT, "dev", "scripts", "reference_policy_check.py")


def run(cmd: list[str]) -> int:
    print("+ " + " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=REPO_ROOT).returncode


def main() -> int:
    for path, label in ((ANALYZER, "reference-graph analyzer"), (CHECKER, "policy checker")):
        if not os.path.isfile(path):
            print(f"reference-policy gate: missing {label}: {os.path.relpath(path, REPO_ROOT)}")
            return 2

    with tempfile.TemporaryDirectory(prefix="refpolicy-") as tmp:
        graph = os.path.join(tmp, "reference-graph.json")
        rc = run([sys.executable, os.path.relpath(ANALYZER, REPO_ROOT),
                  "--json-out", graph, "--fail-on-unresolved"])
        if rc != 0:
            print("reference-policy gate: analyzer failed (see output above)")
            return 2

    rc = run([sys.executable, os.path.relpath(CHECKER, REPO_ROOT)])
    if rc == 0:
        print("reference-policy gate: PASS (no reference-policy violations)")
        return 0
    if rc == 1:
        print("reference-policy gate: FAIL (violations listed above)")
        print("rule summary + approved remedies: dev/docs/REFERENCE_POLICY_CI.md")
        return 1
    print("reference-policy gate: checker failed (see output above)")
    return 2


if __name__ == "__main__":
    sys.exit(main())
