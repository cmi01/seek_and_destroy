## Shared context (identical on every roadmap card — set by orchestrator t_f9a53b47)

**Repo.** `/home/ubuntu/seek-and-destroy` (origin `github.com/cmi01/seek_and_destroy`). The main checkout is DIRTY (branch `v105`, uncommitted WIP in main.js, game.js, graphics files; untracked `.github/`, `dev/docs/gui-scaling-*`). NEVER edit, stash, or switch branches in it. Work in your own worktree: `git -C ~/seek-and-destroy fetch origin` then `git -C ~/seek-and-destroy worktree add $HERMES_KANBAN_WORKSPACE/wt -b <branch> origin/main`. Never commit `.github/` (GitHub App lacks workflows permission).

**Contracts (read before coding).** Roadmap `docs/roadmap.md` (branch `docs/roadmap` @ 8db8330; moved to `dev/docs/roadmap.md` on main by the first card) — milestone deliverables + acceptance criteria. Design `dev/docs/architecture/roadmap-design.md` on origin/main — module map §4, public interfaces §5, intra-milestone update order §6, decisions D1–D6 (all new subtrees under `game.js children/`; single roster in rules_DATA.js; new state keyed by FactionId; every new file born compliant). Behavior truth `dev/docs/DESIGN.md`. Compliance bar `dev/docs/ARCHITECTURE_COMPLIANCE.md` (every file but main.js = ONE pure function named for its file, Owner header, folder tree mirrors ownership, state + all effects only in main.js, references parent→child only; register new files in `PARENT_OF` in `dev/scripts/reference_audit.py`). Prior review: `/home/ubuntu/.hermes/kanban/attachments/t_02d6e801/roadmap-compliance-review.md` (follow-ups F0–F6). Load skill `development-workflows` (Seek & Destroy) first; `updating-unit-stats` if you change ship stats.

**Adopted decisions (do not re-decide; record in the doc you touch if relevant).**
- Q1 carry-over: parts = 50% of hull capacity; captured ships retained; crew fills flagship (as M2 shipped).
- Q2 deployment: the flagship ALWAYS deploys (it is the warp locus and the permadeath target — this ruling closes review item F6/D-H as justified); the player picks the remaining deployed ships in a pre-battle deployment step; overflow → `State.battleReserve`.
- Q3: no credits in battle. Battle turn change must not tick credits/income; the battle HUD may show the campaign wallet read-only. Reserves are campaign reserve ships summoned for 1 AP.
- Q4: map frozen during battles; a fleet entering an in-progress battle appears on the nearest map-relative edge.
- Q5: hyperspace jump points at system edges; gravity wells are destinations only; hyperspace fuel ×3.
- Q6: wages 5 ⒸB/crew/month, round up; if the design gives no month length, 1 month = 30 map turns, stored in campaign_DATA.
- Q7: flagship Battlecruiser 8,750 (rule wins).
- Q8: player picks the weapon per shot; red numbers show that weapon's damage only; write the ruling into DESIGN.md.
- Q9: fixed station contracts first; sandbox with a "campaign complete" state reached by finishing the final contract of an authored contract chain in campaign_DATA.
- Q10: reputation −100..200 in five 60-point quintiles [−100,−40) [−40,20) [20,80) [80,140) [140,200]; kills, missions and trade move it.
- Q11: fleet interactions = hail + trade + fight; autonomous NPC movement behind a flag (default ON).
- Q12: planning docs live under `dev/docs/` (roadmap → `dev/docs/roadmap.md`, review → `dev/docs/architecture/roadmap-compliance-review.md`), per standing decision (g).
- Q13: several vNN updates per milestone, following design §6 intra-milestone order.
- Sequencing: STRICTLY SERIAL M2-close → M3 → M4 → M5 → M6 (M5∥M6 rejected: both hit game.js/rules_DATA/aiThreatScorer/sectorGenerator hotspots and vNN numbering is linear). Battle stays team 1/2-keyed; campaign state is faction-keyed (D5) — do not half-generalize battle.

**Gates per vNN (all must hold, with before/after numbers in your handoff).** `node --check` every .js; `python3 dev/scripts/structure_audit.py` 0 violations (and one-function 0); `python3 dev/scripts/reference_audit.py` at baseline — legacy 6, child-names 0, doc-window 27, import-direction 2 (may fall, may not rise); browser `?test` on a FRESH port: every game test passes (24 at M2 head; count only grows — add tests for each acceptance criterion) + 5/5 audio, zero pageerrors, zero console errors. Ad-hoc harness under `/tmp/hermes-verify-<card-id>/`, run this turn, left on disk, path in handoff.

**Release runbook per update.** vNN = newest tag + 1 at release time (re-check `git tag --sort=-v:refname | head -1` and `git ls-remote origin` right before tagging — never reuse a number). Branch `vNN` from current origin/main, commit only in-scope paths with message `vNN: …`, `git tag vNN`, then `git push origin HEAD:main`, `git push origin refs/heads/vNN`, `git push origin refs/tags/vNN`; verify all three with `git ls-remote origin`. Release gate: run `bash dev/ci/release_gate.sh vNN` (dev/docs/TESTING.md §8 — it runs the full battery, suite + structure audit + reference-policy gate, exactly when N % 10 == 0, and exits 0 otherwise) before deploying. Deploy: `bash dev/deploy/snapshot_versions.sh`, `sudo nginx -t`, `sudo systemctl reload nginx` twice with `sleep 2`; verify `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://seek-and-destroy.abacusai.cloud/?bust=$RANDOM` → 302 to `/vNN/`, and run `?test` against the live `/vNN/?test&bust=…`. Remove your worktree at the end (`git worktree remove`), leave the main checkout untouched.

**Handoff.** `kanban_complete` with metadata: versions shipped (tag + SHA each), changed files, tests before/after, audit counts, harness path, deviations (justified vs not), hotspots. If an acceptance criterion cannot be met, do not complete — `kanban_block` with the reason.

## Card chain (live) — strictly serial; superseded spec card → LIVE card
1. t_3a50900a → **t_95ab6e14** M1+M2 to main (F0, F1, Q12)
2. t_21583874 → **t_c206c32f** M2 live seam (F3, F5, F6)
3. t_1b4eee4c → **t_fb967eff** M2 cleanup (F4, F2)
4. t_f60dd565 → **t_f5763bbe** gate review M1+M2
5. t_fb0b7016 → **t_ab74f8de** M3
6. t_f15523c0 → **t_e5937bed** gate review M3
7. t_a65eefe6 → **t_abaf9305** M4
8. t_55496f6f → **t_d7139481** gate review M4
9. t_d4d6684f → **t_fc6ed596** M5
10. t_074089d6 → **t_0afa0fc6** gate review M5
11. t_387a0f4d → **t_7f6181cf** M6
12. t_1e424b5b → **t_3f182083** final review
Root t_f9a53b47 depends on t_3f182083 and resumes when it completes. Any old id in a spec body means the matching LIVE id.

## Superseded card chain (DO NOT WORK — wrongly gated on goal-mode root t_f9a53b47; kept only as full specs)
1. t_3a50900a — M1+M2 land on main (F0 rebase onto v107, F1 battleReserve lifetime, Q12 doc moves) — default
2. t_21583874 — M2 close: live beginBattle/applyBattleResult, deployment step, no in-battle credits (F3, F5, F6) — default
3. t_1b4eee4c — M2 cleanup: -shielded ruling (F4), regenerate game_balance.md (F2) — default
4. t_f60dd565 — gate review M1+M2 — architecture
5. t_fb0b7016 — M3 campaign map — default
6. t_f15523c0 — gate review M3 — architecture
7. t_a65eefe6 — M4 economy/stations/crew — default
8. t_55496f6f — gate review M4 — architecture
9. t_d4d6684f — M5 outfitting/multi-weapon — default
10. t_074089d6 — gate review M5 — architecture
11. t_387a0f4d — M6 factions/reputation/missions/world life — default
12. t_1e424b5b — final roadmap review M1–M6 — architecture
Review cards that find blockers create one fix card (assignee default) and kanban_link it as an extra parent of the next milestone card.
