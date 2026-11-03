# Reference Policy

Status: normative. Applies to every tracked file in this repository.
Companion documents: `REFERENCE_POLICY_CI.md` (contributor workflow),
`REFERENCE_POLICY_VIOLATIONS.md` (committed violation baseline + remediation
plan). Enforcement: `dev/scripts/reference_policy_check.py` (checker) and
`dev/scripts/reference_policy_gate.py` (CI gate).

---

## 1. Root constraint

(a) No file anywhere in the game project may be referenced by more than one
other file.
(b) Files inside the dev directory may reference more files than that limit
allows, but files outside the dev directory may never reference anything
inside the dev directory.

## 2. Definitions

### 2.1 dev directory

**dev/** — every tracked path under the repository root whose first path
component is `dev`. Everything else (including the repository root itself:
`index.html`, `main.js`, `main.js children/…`, `assets/…`) is a **game file**.
`.git` is ignored by the scan.

### 2.2 Reference

File A **references** file B when any of the following holds (A = *referrer*,
B = *target*):

| # | Kind | Test |
|---|------|------|
| 1 | `basename-mention` | B's filename (e.g. `game.js`) appears in A's text. |
| 2 | `stem-mention` | B's module-style stem (contains an uppercase letter, e.g. `resolveZoomStep`) appears as a bare word in A's text. |
| 3 | `binding-mention` | One of B's top-level factory-global bindings (e.g. `Game` for `game.js`) appears in A in use position (`Name.x`, `Name(`), and A neither defines that name nor receives it as a parameter. |
| 4 | `load-path` | A quoted literal in A resolves to B's repo path (the `X children/…` script lists). |
| 5 | `html-script` | A is HTML and has `src="…"` resolving to B. |
| 6 | `asset-path` | A quoted `assets/…` literal in A resolves to a tracked asset. |

Comments and string literals **count**. Being named in a comment or prose
file is a reference; the policy is about who names whom, not only about
executable imports. Scrubs (declarations, not references): a source's own
header banner lines (`// … job: …`, `// Owner: …`), `X children/…` path
literals (layout declarations — they produce load-path edges instead),
`Name.<filename-extension>` tokens such as prose `main.js` (a basename
mention of a file, not a use of a binding named `Name`), self-mentions, and
names the source defines or takes as parameters.

### 2.3 Owner edge

Every game file has exactly one **owner**: the file whose loader loads it,
as declared by the folder convention (§5 of `ARCHITECTURE_COMPLIANCE.md`) —
a file `P` is the owner of the files in `P children/…` recursively;
`index.html` owns `main.js`. The owner edge is the one inbound reference
every file is entitled to. R1 is measured **against the owner edge**:
referrers beyond the owner are violations.

## 3. Rules

### R1 — inbound cap

A game file must not be referenced by more than one other file: its owner.
Any additional referrer — code, comment, string, doc — is a violation.

### R2 — dev boundary

A game file (outside `dev/`) must never reference any file inside `dev/`.
No exceptions, no owner-edge allowance.

## 4. Exemptions and interpretations (decided)

These are written into the checker, not left to reviewer judgement:

1. **Central-loader allowance (main.js as referrer).** `main.js` names every
   file and binding it loads; that naming is exempt as a *referrer*. The
   ownership edge stays the parent's. Matches the v99 reference-audit
   allowance. Literal reading available via `--count-main-js`.
2. **dev latitude.** A dev file may reference game files freely; dev
   referrers do not count toward a game file's fan-in
   (`--count-dev-referrers` for the literal reading). R2 still binds dev
   targets from game-side sources.
3. **Owner edge is not an exemption.** The owner counts as the one allowed
   referrer, not as an exempt one — a second referrer is a violation even
   when the first is the owner.
4. **Entry point.** `index.html` → `main.js` is `main.js`'s owner edge
   (`main.js` has no folder parent).
5. **Comment/string mentions are violations, not exemptions.** "It's only a
   comment" is not a defence; the remedy is a reword (see §5 remedy A).
6. **Registry indirection is not an automatic escape.** A registry layer is
   a file too; it satisfies R1 only when exactly one file references it. See
   §5 remedy D.
7. **CI dispatch allowance.** Files under `.github/workflows/` are exempt as
   *referrers* (R1 contributions and R2 dev-boundary edges). GitHub Actions
   requires workflows to live at that path, and a workflow necessarily names
   the dev/ tooling it dispatches — same declaration-not-reference shape as
   the central-loader allowance (item 1). The gate that enforces this policy
   is dispatched exactly this way.
8. **A path token names a file, not a binding.** A binding/stem token
   followed by `.ext` that together spell a tracked file's basename
   (`main.js`) is a mention of that file — already recorded by the basename
   pattern — never a use of a same-named binding in another file. Without
   this, the `main.js` path token read as a use of the game-balance
   generator's `main` binding and flagged R2 (the v114 false positives).
9. **A CommonJS module's surface is its `module.exports`.** A Node file's
   module-scoped internals (`const fs = require(...)`, `const path =
   require("path")`, `function main()`) cannot be referenced across files
   and are not its referenceable surface; only the exported names
   (`module.exports = { … }`, `module.exports = fn`, `exports.x =`) generate
   binding patterns. Non-module files keep the full top-level
   factory-global surface.

## 5. Remedies (canonical, in preference order)

### R1 remedies

- **A. Reword.** The extra referrer names the file only in a comment/string.
  Reword to describe the job without the filename/stem. No behavior risk.
- **B. Collapse the facade re-export.** The grandparent names a grandchild
  (load-path or stem-mention) that its own child already owns: make the
  grandparent consume the child's composed surface and move the load into
  the child. Structural; touches only the two files.
- **C. Retire the registrar handshake.** The `X._register` shape makes a
  child reference its parent (e.g. `Game._registerModule`): replace with the
  parent-captures-child-at-load pattern (A01–A08 program). Structural.
- **D. Merge duplicate consumers or route through a single-referencer
  indirection.** Two files both need one leaf: give the leaf to one owner and
  have the other consume the owner's surface. An indirection/registry layer
  is valid **only when it is itself referenced by exactly one file** (its
  owner), which then distributes — a registry named by N consumers just
  recreates the violation one hop away.
- **E. Move into dev/.** The file is genuinely dev-only tooling: move it
  under `dev/` (its referrers must then also be dev files — R2).

### R2 remedies

- **F. Move the referenced file out of dev/.** It is runtime game logic
  living in dev by accident.
- **G. Duplicate the needed logic into the game tree.** For small, stable
  snippets (a formula, a constant). Drift risk: the copy is not linked to
  the original.
- **H. Invert the dependency.** Define the interface/data contract in the
  game tree; dev tooling consumes the game tree's output, never the reverse.

## 6. Pass/fail procedure (hand-applied)

To judge file F:

1. Classify F: game file or dev file (§2.1).
2. If dev file: **fail** if F references nothing relevant — dev files may
   reference freely; R2 only constrains who may name dev files. Done.
3. If game file:
   a. **Fail immediately** if F references any `dev/` file (R2).
   b. Determine F's owner (§2.3). Collect all files that reference F (§2.2).
   c. **Pass** iff the referrer set is empty or exactly `{owner}`
      (discounting exempt referrers per §4: `main.js`, dev files).
4. Report any fail with the referrer file, kind and line, then apply §5.

The scripted verdict (`python3 dev/scripts/reference_policy_check.py`) is the
authoritative instrument when a reviewer and the script disagree: file an
issue against the checker rather than hand-waving the scan.

## 7. What this policy is NOT

- It does not replace `ARCHITECTURE_COMPLIANCE.md` — one-pure-function-per-
  file, parent→child-only flow and the purity ban list remain in force; R1/R2
  are the reference-count facet of the same ownership tree.
- It does not exempt generated files, test harnesses or engine singletons:
  tests live in the game tree and are owned by their stems; the only
  latitude granted anywhere is dev/ latitude (§4.2).