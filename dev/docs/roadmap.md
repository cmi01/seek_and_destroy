# Seek & Destroy — Feature Roadmap

*Drafted 2026-11-02 against the v99 tree. `dev/docs/DESIGN.md` is the authoritative
behavior spec; this document only sequences its implementation over a number of
updates. Where this document and DESIGN.md disagree on behavior, DESIGN.md wins.*

**Path:** `dev/docs/roadmap.md`. Q12 is closed: planning documents live under
`dev/docs/` (this file) and `dev/docs/architecture/` (review + execution plan)
per standing decision (g). Repo-root `docs/` must not exist.

## 1. Product goal

Deliver the game DESIGN.md specifies — turn-based fleet battles plus a living
campaign: a star map with hyperspace, an economy with stations and trade, five
factions with reputation, crew and outfitting, and missions — as a sequence of
small, verifiable updates. Every update keeps the architecture-compliance bar
(one pure function per file, state and effects only in `main.js`, folder tree
mirrors the ownership tree) and the standing verification gates (browser test
suites green, structure/reference audits at baseline).

## 2. Current state at v99 (evidence)

Sources inspected: `dev/docs/DESIGN.md` (authoritative), `dev/docs/ARCHITECTURE_COMPLIANCE.md`
(in-flight re-architecture program, Appendix A), `dev/docs/GUIDING_PRINCIPLES.md`,
`dev/docs/game_balance.md` (v70-era, partly stale), `dev/docs/data_model.md`,
`dev/README.md`, the `main.js children/` tree, git history v69–v99, and GitHub
(issues and PRs: zero open, zero closed, as of 2026-11-02). There is **no CHANGELOG,
no roadmap file and no TODO/FIXME comments in code** — version history is the git
log and the vNN tags. Feature intent exists almost entirely in DESIGN.md; this
roadmap is that spec's gap over the current build.

**Implemented (battle layer — DESIGN §2 largely complete):**
- 32×32 turn-based battles: 4 AP per faction per turn, round-robin order, one
  use of each action type per ship (move / attack / board / shield / summon / retreat).
- Information play: fog of war per `scan`, red damage numbers, asteroid LOS and
  blind-asteroid hazard, ramming/collisions, binary shields with railgun shatter,
  boarding capture, nebula stealth (d≤1), reserve warp-in, retreat rules,
  flagship-per-faction and campaign-over-on-flagship-loss semantics.
- AI with doctrines and four difficulty profiles, per-faction vision in battle.
- A campaign **ladder**: interactive starmap with 4 level cards (tutorial + 3
  sectors, `campaign_DATA.js`), per-level spawn lists, in-battle credits funding a
  REINFORCEMENTS shop, intel briefings, themes, help/telemetry HUD.
- 19 hull specs in `rules_DATA.js` on the **old economy scale** (cost 5–95) with
  **hull-fixed weapon types** (`wType: pdc/missile/railgun/none`, firepower+range
  per hull). Save/restore helpers exist at game-state level only.
- Verification tooling: `dev/scripts/structure_audit.py`, `dev/scripts/reference_audit.py`,
  in-browser suites (16/16 game + 5/5 audio), A/B evidence under `/tmp/hermes-verify-*`.

**Not implemented (DESIGN §3.3 and §4):**
- The 22-hull × 15-weapon model with slot-sized, swappable loadouts (§3.1–3.3);
  the ×100 economy scale; crew (cost÷100, casualties, wages, incapacitation).
- Battle ↔ campaign integration: no persistent fleet/wallet/cargo, no battle
  results carry-over (scrapping, crew transfer, captured-ship retention).
- Campaign map mechanics: turn-based fleet movement, fuel, hyperspace travel,
  map visibility/detection, encounters and hailing (the starmap is level select).
- Economy: commodities with fluctuating prices, stations and their services,
  merchant fleets, repair/refit, parts.
- Factions as world entities (5 factions exist only as level themes/doctrines),
  reputation, missions and bounties, NPC world life, multi-weapon fire.

## 3. Milestone overview

| # | Milestone | Depends on | DESIGN source |
|---|-----------|------------|---------------|
| M1 | Campaign state model, roster conformance, persistence | — | §3, §4.5 |
| M2 | Battle ↔ campaign integration | M1 | §2.8–2.10, §4.5, §4.10 |
| M3 | Campaign map: movement, fuel, hyperspace, encounters | M1, M2 | §4.1–4.4 |
| M4 | Economy, stations, crew | M1, M3 | §4.5–4.6 |
| M5 | Outfitting and multi-weapon loadouts | M4 | §2.4, §3.3 |
| M6 | Factions, reputation, missions, world life | M3, M4 | §4.7–4.9, §2.7 |

No milestone depends on a later one; M5 and M6 could run in parallel after M4
if staffing allows, at the cost of shared-file collisions (see §5).

## 4. Milestones

### M1 — Campaign state model, roster conformance, persistence

Deliverables:
- A campaign state model as frozen plain data: fleet roster (hull, loadout, HP,
  crew), wallet (ⒸB), cargo (goods/fuel/crew/parts), per-faction reputation,
  campaign clock, map position. Pure `state → state` transforms in a new
  `campaignState.js` subtree under `game.js children/`.
- Roster conformance to DESIGN §3: all 22 hulls and 15 weapons with slot sizes
  (`dmg × range`, ×1.5 railguns, rounded), costs on the ×100 scale, crew =
  ⌈cost ÷ 100⌉, flagship variants at 2.5× base with scan 8 (Q10 ruling).
- Persistence: `gameState.js` save/restore extended to campaign scope.
- `gameTests.js` gains the conformance and round-trip tests; the existing
  single-table `rules_DATA.js` becomes the single source both battle and campaign
  read (no duplicate rosters).

Acceptance criteria (testable):
- A pure test asserts every hull row satisfies the §3.1 invariants (flagship
  2.5×, Dreadnought 2× Battleship, crew rounding, flagship scan 8) and every
  default loadout fits its hull's slot capacity with slot sizes per the formula.
- Round-trip test: save → restore deep-equals (JSON) a campaign state containing
  fleet, wallet, cargo, reputation and clock.
- In-browser suites green (all game tests (24+) + 5/5 audio); both audits at v99 baseline.

Scope: `campaign_DATA.js`, `rules_DATA.js`, `gameState.js` (+ new children),
new `campaignState.js` subtree, `gameTests.js`, `main.js` loader/state-container lines.
Risks/unknowns: the ×100 rescale invalidates all current balance (5–95 → 500–25,000);
`game_balance.md` (v70) is stale and must be regenerated, not patched; Q10 (8,750
vs 9,500) is assumed resolved as the 2.5× rule.

### M2 — Battle ↔ campaign integration

Deliverables:
- Battles launch from campaign state: fleet deployment into corner spawn regions,
  overflow to reserves, opponent force built from campaign entities.
- Battle results carry over: winning scraps surviving enemy ships into
  parts/credits per the payout formula (Q6), crew auto-transfers to the flagship,
  crew casualties per §4.5 (half the HP-lost percentage), boarding-captured ships
  retained in the fleet (Q6), flagship destroyed = campaign over (permadeath).
- Reconcile reserves with DESIGN §2.8: summoning costs **1 AP only** (no credits
  in battle); the REINFORCEMENTS shop becomes the campaign-side fleet/reserve
  view; mirage warp-in semantics (materializes next turn, any hit destroys it, a
  ram destroys both).
- Deployment selection when the corner region overflows (Q7 ruling).

Acceptance criteria (testable):
- Unit tests: a summon costs exactly 1 AP and 0 credits; any hit destroys a
  mirage and a ram against one destroys both ships; losing the flagship yields
  campaign-over endgame status.
- Pure tests over a seeded battle: post-battle state equals the specified
  carry-over (payout formula applied, crew transferred, captured ship present).
- In-browser suites green; audits at baseline.

Scope: `gameState.js children`, `endgameStatus.js`, `actionLegality.js`,
`reservePlacement.js`, `combatMath.js`, `frame*` slices, `hud.js children`
(buildBridgeShop* model/buttons), `aiFleetCommander.js`, `gameTests.js`, `main.js`.
Risks/unknowns: changes the current battle economy (removing in-battle purchase)
— needs a balance re-check and QA on the tutorial level's teaching text;
Q6 and Q7 need requester rulings for exact formulas.

### M3 — Campaign map: movement, fuel, hyperspace, encounters

Deliverables:
- Turn-based map movement: real space (systems) and hyperspace between systems;
  fleets and locations are single map units; fleet speed = slowest ship.
- Fuel: consumption proportional to ship count at 5 ⒸB/unit, hyperspace ×3; a
  fleet with insufficient fuel or a flagship under 50% crew cannot move and
  spawns a merchant fleet encounter (sell anything discounted, buy crew/fuel
  inflated — service wiring completes in M4).
- Map visibility: fleets detected at N squares = N ships; nebula squares hide
  battles; entering a fleet/location opens it and encounters enter battle on the
  next turn; hailing shell on fleet encounters (dialogue voice placeholder).
- Hyperspace rendering: red, Star Control 2–style, gravity wells only.

Acceptance criteria (testable):
- Pure tests: exact fuel formula per move (ships, distance, space type); an
  unfuelled fleet's move is rejected and produces the merchant-fleet event;
  map detection radius = ship count on the map model.
- Browser evidence run: traverse system → hyperspace → system, with fuel
  decrements and the red gravity-well-only render confirmed at two resolutions.

Scope: new `campaignMap.js` subtree (movement, fuel, visibility, encounters),
`campaign_DATA.js` (systems/stations map table), `backgroundRenderer.js`,
`objectRenderer.js`, `hud.js children` (map HUD), `themes_DATA.js`, `main.js` wiring.
Risks/unknowns: Q1 (battle↔map clock) and Q7 (hyperspace jump points / gravity-well
mechanics) are open; defaults stated in §7 so work can proceed. This milestone
touches renderers the compliance sweep is re-shaping — coordinate branches.

### M4 — Economy, stations, crew

Deliverables:
- Commodities (goods, fuel, crew, parts) with fluctuating prices: deterministic
  seeded price table with per-system variation.
- Station services per §4.6: buy/sell hulls, weapons and goods; buy fuel, hire
  crew, buy parts; repair/refit consuming parts. Station UI replaces the bridge
  shop modal as the general storefront.
- Crew model across the campaign: wages 5 ⒸB/crew/month on the campaign clock,
  casualties (half the HP-lost percentage), under-50%-crew cannot act or deploy.
- Merchant-fleet flow from M3 fully wired (discounted sale / inflated provisioning).

Acceptance criteria (testable):
- Determinism test: same seed → identical price table; a buy-then-sell round-trip
  at one station loses exactly the spread.
- Crew math tests: casualty formula, incapacitation threshold at 50%, wage
  deduction per month tick.
- Browser evidence run: at a station, buy a hull and observe wallet, cargo and
  fleet update consistently.

Scope: new `economy.js` subtree (prices, transactions, wages), `campaign_DATA.js`
trade tables, `hud.js children` (station modal), `gameState.js children`, `main.js`
effects (clock, storage). Risks/unknowns: Q8/Q9 confirmations (wage cadence,
rounding); balance of the ×100 scale is unverified until play-tested.

### M5 — Outfitting and multi-weapon loadouts

Deliverables:
- Slot-based outfitting at stations: swap weapons within hull capacity, mount
  several weapons where they fit (§3.3).
- Multi-weapon fire in battle: the player picks which weapon fires on the one
  attack per turn; red damage numbers reflect the chosen weapon (Q2 ruling; if
  mixed-damage display differs, the rule is decided here and written back to
  DESIGN.md).
- AI and generation data produce legal loadouts (sectorGenerator archetype pools
  respect slot capacity).

Acceptance criteria (testable):
- Loadout validation tests: slot-sum ≤ capacity accepted, over capacity rejected;
  a hull mounting two different weapons fires each with its own damage/range in
  combat tests.
- Red numbers show the firing weapon's exact pre-commit damage — browser A/B
  evidence at two resolutions (existing `/tmp/hermes-verify-*` practice).

Scope: new `outfitting.js` children (slot math, validation), `actionLegality.js`,
`combatMath.js`, `frameOverlay.js`, `frameUnits.js`, `rules_DATA.js` (weapon table),
`hud.js children` (outfit modal), `sectorGenerator.js`, `aiThreatScorer.js`.
Risks/unknowns: Q2 blocks the exact red-number contract; the damage-number DTO
is render-coupled, so parity evidence is mandatory.

### M6 — Factions, reputation, missions, world life

Deliverables:
- Five factions per §4.7: doctrine-weighted fleet composition, AI doctrine,
  visual theme with hull stripes, dialogue voice text bank (content authored per
  Q11).
- Reputation: −100..200 scale in five quintiles (band boundaries per Q4),
  band-driven relations (allied-only sensor sharing out of battle, non-transitive,
  none in hyperspace or across systems), event hooks (kills, missions, trade).
- World life: NPC fleets move, trade and fight on the map (visible outcomes);
  missions and bounties offered at stations (structure per Q3) with payouts and
  completion tracking; campaign end state per Q3.

Acceptance criteria (testable):
- Reputation quintile boundary tests, including a band flip at a threshold after
  a reputation delta.
- Seeded simulation test: two NPC fleets resolve an interaction (trade or battle
  outcome) on the map without any player input.
- Faction fleet generation respects doctrine weights (statistical test over
  seeded rolls, e.g. ≥90% of Armoury rolls field a capital ship).

Scope: new `factions.js`, `reputation.js`, `missions.js` subtrees,
`aiPriorities_DATA.js` + `aiThreatScorer.js`, `themes_DATA.js`, `campaign_DATA.js`,
`hud.js children` (hail/dialogue, mission board), `sectorGenerator.js`, `main.js`.
Risks/unknowns: the largest surface; Q3, Q4 and Q11 all land here; dialogue is
writing work outside the code stream.

## 5. Cross-cutting constraints and risks

1. **Compliance re-architecture in flight.** `dev/docs/ARCHITECTURE_COMPLIANCE.md`
   standing decision (e): the whole-tree one-pure-function re-architecture ships
   as sequential versions on top of v91 (A01–A05 landed as v95–v99; Appendix A
   lists the remainder as "scheduled"). Every new file in this roadmap must be
   born compliant (one pure function, Owner header, folder mirrors ownership,
   `main.js` loads it), and feature work touching files still scheduled for the
   sweep will collide — sequence or coordinate per release.
2. **Economy rescale.** The ×100 scale (§4.5) migrates every money value;
   do it once in M1 and regenerate `dev/docs/game_balance.md` from data.
3. **Spec staleness.** `game_balance.md` (v70) and parts of the current data
   predate DESIGN.md; treat DESIGN.md as truth and update the derived docs.
4. **Shared-file collision hotspots.** `game.js` (composer), `rules_DATA.js`,
   `hud.js children/`, `gameState.js` and `main.js` are touched by nearly every
   milestone; keep each update small and rebased.
5. **Verification discipline.** Behavior changes carry before/after A/B evidence
   (`/tmp/hermes-verify-*`), suites run on fresh ports, probes are cleaned up and
   the repo returned to its original branch after each release.

## 6. Release mechanics

Each milestone ships as one or more vNN updates following `dev/README.md`
convention: branch → change → browser-test (`dev/serve.sh`, `/?test`) →
`git commit -m "vNN: …"` → `git tag vNN` → push to main. Standing gates per
update: `python3 dev/scripts/structure_audit.py` (0 violations), the reference
audit at baseline, in-browser suites all game tests (24+) + 5/5 audio on a fresh port.
The milestone's acceptance criteria are checked in the update(s) that complete it.

## 7. Open questions

Blocked-on-requester items are tagged; a **default** is proposed for each so no
milestone stalls, but the requester should confirm before the milestone starts.

1. **[M2] Battle payouts and carry-over** (DESIGN Q5). What do scrapped enemy
   ships yield (parts? credits at what fraction of hull value?)? Do captured
   ships carry into the fleet? *Default: parts at 50% of hull slot value; captured
   ships retained; starting fleet and funds defined in `campaign_DATA.js`.*
2. **[M2] Deployment overflow** (DESIGN Q7). Who chooses which ships deploy when
   the corner region overflows? *Default: the player picks in a deployment step.*
3. **[M2] Reserve/credit reconciliation.** DESIGN says summoning costs 1 AP only
   and no credits exist in battles, but the current build buys ships in battle
   with credits. *Default: remove in-battle purchasing; reserves are fleet
   reserve ships.*
4. **[M3] Battle ↔ map clock** (DESIGN Q1). Does the map advance during battles?
   Where does a fleet enter an in-progress battle? *Default: map frozen during
   battles; entering fleet appears on the nearest map-relative edge.*
5. **[M3] Hyperspace mechanics** (DESIGN Q6). Jump points and what gravity wells
   do mechanically. *Default: jump points at system edges; gravity wells are
   destinations only, as the spec states.*
6. **[M4] Crew wages and rounding** (DESIGN Q8). Confirm 5 ⒸB per crew per month
   and rounding up (87.5 → 88). *Default: as stated, round up.*
7. **[M1] Flagship Battlecruiser price** (DESIGN Q9). The 2.5× rule gives 8,750;
   the prototype used 9,500. *Default: the rule wins (8,750 on the ×100 scale).*
8. **[M5] Multi-weapon fire** (DESIGN Q2). Which weapon fires on a multi-weapon
   ship's attack, and what do red numbers show for mixed damage? *Default: the
   player picks the weapon per shot; numbers show that weapon's damage only.*
9. **[M6] Missions** (DESIGN Q3). Structure (station contracts? procedural?),
   payouts, and whether the campaign is sandbox or has an end state.
   *Default: fixed contracts at stations first; sandbox with a "campaign
   complete" state.*
10. **[M6] Reputation details** (DESIGN Q4). The stated −100..200 range spans 300
    points — confirm band boundaries and which actions move reputation.
    *Default: five 60-point quintiles; kills/missions/trade all move it.*
11. **[M6] Fleet interactions and world life** (DESIGN Q6/Q10). What can
    fleet-to-fleet interactions do beyond hail and fight (trade, bribe,
    surrender, recruit)? Do NPC fleets move and fight autonomously?
    *Default: hail + trade + fight first; autonomous NPC movement behind a flag.*
12. **[process] Planning-doc home.** CLOSED (Q12): planning documents live under
    `dev/docs/` (`dev/docs/roadmap.md`, `dev/docs/architecture/roadmap-compliance-review.md`,
    `dev/docs/architecture/roadmap-execution.md`). Repo-root `docs/` does not exist.
13. **[process] Release cadence.** One vNN per milestone or several per
    milestone (recommended for M4–M6, whose surfaces are large)? *Default:
    several, each passing the standing gates.*
