# CI gate: reference policy

This repo enforces its file-reference policy automatically in CI on every pull
request and on every push to `main`. This page tells contributors what the rule
is, how to run the same check locally before pushing, and how to fix a
violation.

## The rule (summary)

1. **R1-inbound-cap — one-referencer cap.** No game file may be referenced
   (loaded, required, imported, asset-linked, or named in code) by more than
   **one** other file. One owner, one referencing parent — the folder tree
   mirrors the ownership tree.
2. **R2-dev-boundary — dev boundary.** Files under `dev/` (tooling: docs,
   scripts, deploy) may reference as many files as they need, but no file
   outside `dev/` may ever reference anything inside `dev/`. Game code never
   depends on tooling.

What exactly counts as a "reference" (basename mentions, module stems,
top-level binding uses, load-path literals, HTML `src=`, asset paths — with
header banner lines and `X children/…` layout literals scrubbed) is defined by
the checker itself: `dev/scripts/reference_policy_check.py` (its header and
its generated report §1–2), which mirrors `dev/scripts/reference_audit.py`,
the project's normative reference instrument. The normative rule text,
definitions and exception list live in `dev/docs/REFERENCE_POLICY.md`; the
committed violation baseline and prioritized remediation plan live in
`dev/docs/REFERENCE_POLICY_VIOLATIONS.md`.

## Running the check locally

From the repository root:

```bash
python3 dev/scripts/reference_policy_gate.py
```

This is exactly what CI runs. Exit code 0 means the tree passes; 1 means at
least one violation; 2 means a tool failure. On failure it prints, for every
violating file:

- the violating file's path (and its owner under the folder convention),
- the files that reference it, with reference kind and line,
- which rule is violated (`R1-inbound-cap` / `R2-dev-boundary`),
- the approved remedy for that case.

No extra dependencies: the gate is Python 3 standard library only. The pieces
can also be run separately:

```bash
python3 dev/scripts/reference_graph.py                 # JSON reference graph + summary
python3 dev/scripts/reference_policy_check.py \
    --report violations.md --json violations.json      # itemized report + machine-readable list
```

## Approved remedies

**R1 — a game file referenced by more than one other file:**

- **Inline** the shared code into its single remaining consumer (best when the
  duplicated surface is small).
- **Merge duplicate consumers** so only one file needs the reference.
- **Introduce an indirection layer** (a registry/lookup the owner exposes) so
  consumers stop naming the file directly.
- **Collapse facade re-exports**: the grandparent consumes the parent's
  composed surface instead of naming the grandchild directly.
- **Reword the comment/string** that names the file — a file may be named only
  by its parent (no code change required).
- **Move the file into `dev/`** if it is genuinely dev-only tooling.

**R2 — a non-dev file referencing a `dev/` file:**

- **Move the referenced file out of `dev/`** into the game tree, owned by its
  single consumer (docs belong under `dev/docs/`).
- **Duplicate the small needed logic** into the game tree (dev tooling stays
  dev-only).
- **Invert the dependency**: the game tree owns an interface, and the dev-side
  consumer adapts to it — the game never names a `dev/` path.

## CI behavior

- Workflow: `.github/workflows/reference-policy.yml`.
- Runs on: every pull request (any target branch) and every push to `main`.
- A failing run blocks the merge: the `reference-policy` check is a required
  status check on `main`.
- The run log repeats the same actionable violation listing the local command
  prints, so a contributor can fix a red PR without reading the policy doc.

## Checking a single change quickly

For an in-progress edit, run the gate on just your working tree before
committing; the checker also accepts `--repo PATH` to check any checkout, and
`--exemptions FILE` (JSON list of `{target, referrer?, reason}`) to record a
reviewed, time-bounded exception pair.
