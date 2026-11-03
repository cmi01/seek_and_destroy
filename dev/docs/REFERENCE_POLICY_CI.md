# Reference policy — contributor guide

Everything needed to keep a change inside the reference policy: the rule, the
local check, what CI enforces, and the approved fixes. The normative texts are
`dev/docs/REFERENCE_POLICY.md` (what counts as a reference, exemptions) and
`dev/docs/ARCHITECTURE_COMPLIANCE.md` (purity rules); this page is the
workflow summary.

## The rule

`main.js` is the only file that holds state; every other file is exactly one
pure function — no state, no effects. Every file has exactly one referrer
(the file that loads it), and that referrer is either `main.js` or a
child/grandchild of `main.js`: the folder tree mirrors the ownership tree
(`P` owns `P children/…`, `index.html` owns `main.js`). Nothing outside
`dev/` may ever reference anything inside `dev/` — game code never depends on
tooling. Loading, importing, asset-linking, or merely naming a file in a
comment or string all count as referencing it (basename, module stem, or
top-level binding in use position — `REFERENCE_POLICY.md` §2.2).

Two facets are machine-checked and gate your merge:

- **R1-inbound-cap** — no game file is referenced by more than one other file
  (its owner).
- **R2-dev-boundary** — no file outside `dev/` references a file inside `dev/`.

Both are enforced by `dev/scripts/reference_policy_check.py`, which mirrors
`dev/scripts/reference_audit.py`, the project's normative reference
instrument. The purity facet (one pure function per file, state only in
`main.js`) is `dev/docs/ARCHITECTURE_COMPLIANCE.md` §1: its
one-function-per-file part is machine-checked by
`dev/scripts/structure_audit.py`, state placement is reviewed. The committed
violation baseline and remediation plan live in
`dev/docs/REFERENCE_POLICY_VIOLATIONS.md`.

## Why it matters

- **Testability** — a pure function is tested by calling it: no fixtures, no
  teardown, no global to reset. Every module runs headless in the `?test`
  harness because none of them hide state.
- **No hidden coupling** — with exactly one referrer, a file's blast radius is
  its owner chain. Refactors touch the owner and the file, never a surprise
  third consumer; there is no "who else calls this?" archaeology.
- **Deterministic behavior** — state transitions compute in the open
  (`state → state`, or `state → {state, events}`) and `main.js` applies them:
  same inputs, same outputs, and bugs reproduce.

## Running the check locally

From the repository root:

```bash
python3 dev/scripts/reference_policy_gate.py
```

This is the exact command CI runs (Python 3 standard library only). Exit
codes: **0** = pass, **1** = violations, **2** = tool failure. On a clean tree
it prints the analyzer summary and then:

```
reference-policy check — repo: <your checkout>
TOTAL VIOLATIONS: 0

reference-policy gate: PASS (no reference-policy violations)
```

The pieces can also be run separately:

```bash
python3 dev/scripts/reference_graph.py       # JSON graph in dev/reference_graph.json + summary table
python3 dev/scripts/reference_policy_check.py --report violations.md --json violations.json
python3 dev/scripts/structure_audit.py       # purity facet: one-function-per-file, header contract
```

`reference_policy_check.py` also takes `--repo PATH` (check any other
checkout) and `--exemptions FILE` (a JSON list of `{target, referrer?, reason}`
pairs — reviewed, time-bounded exception records).

## What a failure looks like

Exit code 1, and one block per violating file naming the file, every referrer
(with reference kind and line), the violated rule, and the approved remedy.
Abridged real output (a stray comment naming a file its author doesn't own):

```
TOTAL VIOLATIONS: 1
  R1-inbound-cap     1

VIOLATION [R1-inbound-cap] main.js children/game.js children/hud.js children/hudBanner.js  (inbound=2, owner=main.js children/game.js children/hud.js)
    referenced by main.js children/game.js children/hud.js  (binding-mention code:250)
    referenced by main.js children/graphics.js children/uiRenderer.js  (basename-mention comment:1100)
    remedy: Reword the comment/string that names the file (a file may be named only by its parent) — no code change required.
```

## The CI gate

- **Where it runs:** `.github/workflows/reference-policy.yml`, on every pull
  request and every push to `main`. It runs
  `python3 dev/scripts/reference_policy_gate.py` — the same command and the
  same output as the local run above.
- **What a failure looks like:** the run log shows the violation blocks
  printed above (file, referrers with kind + line, rule, remedy) plus the
  totals summary and a pointer back to this page.
- **It blocks merges:** the `reference-policy` status check is required on
  `main`, so a red run stops the merge until the listed violations are fixed.
  (Adding the workflow file and marking the check required are
  repository-admin steps; until the workflow is active on a checkout, the
  local command above gives the identical verdict.)
- The workflow file itself is covered by the policy's CI-dispatch allowance
  (`REFERENCE_POLICY.md` §4.7): a workflow naming the dev/ tooling it
  dispatches is a declaration, not a reference.

## Repository-admin setup (one-time)

Branch protection is not codified in the repo (no rulesets/Terraform config),
so a repo admin does two steps by hand on GitHub:

1. **Add `.github/workflows/reference-policy.yml` to the default branch.**
   The file ships uncommitted in the repo working tree: the deploy credential
   is a GitHub App with `contents: write` but not `workflows: write`, so it
   cannot commit workflow files (both `git push` and the Contents API refuse
   — the push error names the missing `workflows` permission).
2. **Require the check:** Settings → Branches → the `main` rule → "Require
   status checks to pass before merging" → add `reference-policy`. Needs
   repo-admin rights (`administration: write`); the deploy credential cannot
   set this via API either.

Until both steps are done the gate has local force only: `python3
dev/scripts/reference_policy_gate.py` gives the identical verdict anywhere.

## Approved remedies

Fix the violation kind the listing names. Canonical remedy order:
`REFERENCE_POLICY.md` §5.

**R1 — a game file referenced by more than one file:**

- **Inline** the shared function into its single remaining consumer when the
  duplicated surface is small.
- **Move the code to the single allowed referrer** (the owner) and consume the
  owner's composed surface — collapse facade re-exports that name a
  grandchild the child already owns.
- **Merge duplicate consumers**, or route through a registry/indirection that
  is itself referenced by exactly one file (a registry named by N consumers
  recreates the violation one hop away).
- **Reword** the comment or string that names the file — a file may be named
  only by its parent (no code change required).
- **Move the file into `dev/`** if it is genuinely dev-only tooling.
- **Split the file** when two parents genuinely need different pieces: each
  piece gets exactly one referrer of its own.

**State or side effects outside `main.js` (purity violation):**

- **Extract the state into `main.js`** and keep the file a pure function:
  compute `state → state` (or `state → {state, events}`) and let `main.js`
  apply the result. Anything held between calls counts as state — caches and
  "constant" module singletons included.

**R2 — a game file referencing a `dev/` file:**

- **Move the referenced file out of `dev/`** into the game tree, owned by its
  single consumer (runtime logic living in dev by accident).
- **Duplicate the small needed logic** into the game tree (drift risk: the
  copy is not linked to the original).
- **Invert the dependency**: the game tree owns the interface or data
  contract; dev tooling consumes the game tree's output, never the reverse.

Docs, audit scripts and other tooling belong under `dev/docs/` or
`dev/scripts/`, where dev-latitude applies (`REFERENCE_POLICY.md` §4.2).
