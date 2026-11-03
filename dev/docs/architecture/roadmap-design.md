# Seek & Destroy — Roadmap Architecture & Module Boundaries

**Purpose:** translate `docs/roadmap.md`'s milestones into a concrete technical
design that implementation workers can follow without re-deciding structure.
Design only — no implementation code lives in this document.

**Baseline:** repository at **v99** (compliance A05 shipped; A06–A08 pending).
Working tree at design time carries in-flight WIP in the `ai/` subtree (A06-style
query split, untracked child folders) and `dev/docs/gui-scaling-strategy.md` —
none of it is touched or assumed by this design.

---

## 0. Inputs, provenance & assumptions

- **Input:** `docs/roadmap.md` (drafted 2026-11-02 by the roadmap task; read from
  its worktree at `docs/roadmap.md` while that task's release was still in
  flight). Its milestone decomposition — **M1–M6** — is the contract this design
  maps. Where this design and the roadmap disagree on *structure*, this design
  governs (that is its commission); where they disagree on *behavior*,
  `dev/docs/DESIGN.md` governs (roadmap preamble).
- **Provenance:** the master plan `~/.hermes/plans/2026-10-31_130849-snd-unified-design-roadmap.md`
  (updates A01–A08 / U01–U48) is the implementation-plan of record; §1 carries a
  cross-reference column so workers can find the plan's per-update detail (files,
  verify steps) for each roadmap deliverable. Where the two sources disagree on
  what is already built (see R10), verify against code first.
- **Verified reality checks at v99** (evidence, not assumption): the `-shielded`
  latch is still live in `canUnitShield.js` and `flagDescriptions` (the master
  plan's U01 refinement is NOT shipped despite the roadmap's "largely complete"
  battle layer); mirage logic does not exist anywhere in the tree (roadmap M2
  correctly schedules it); red damage-number rendering exists in `frameOverlay`
  (16 `red`-color usages) and blind-asteroid handling is partially present in
  `game.js`. Treat the roadmap's §2 completeness summary as approximate —
  per-deliverable verification is part of each milestone's first update.
- **Path note:** master-plan prose uses pre-v96 shorthand (`core/rules.js`,
  `ai/aiLogic.js`); since v96 (A02) the folder tree mirrors the ownership tree.
  §2.3 is the translation table. New modules are named by **stem + owning
  parent**; literal path = `<parent path>/<parent stem> children/<stem>.js`.
- **Doc home:** both planning docs live at repo-root `docs/` per their commission
  (roadmap Open Question 12 leaves the §5 layout tension open — do not move
  either file without a ruling).

---

## 1. Milestone map

| Roadmap milestone | Objective | Owns (new subtrees) | Master-plan cross-ref | Depends on |
|---|---|---|---|---|
| **M1** | Campaign state model, roster conformance, persistence | `campaignState.js` subtree | U13/U14 data, U27/U28 hulls, U30 crew values, U31 persistence (partial) | — |
| **M2** | Battle ↔ campaign integration | `campaignState.js` (battle seam) + `game.js` turn-flow children | U18–U22, U30 casualties, U31 carry-over, U46 permadeath | M1 |
| **M3** | Campaign map: movement, fuel, hyperspace, encounters | `campaignMap.js` subtree | U35–U41 | M1, M2 |
| **M4** | Economy, stations, crew | `economy.js` subtree | U32–U34 | M1, M3 |
| **M5** | Outfitting and multi-weapon loadouts | `outfitting.js` subtree | U15–U17 | M4 |
| **M6** | Factions, reputation, missions, world life | `factions.js`, `reputation.js`, `missions.js` subtrees + `mapAi.js` | U26, U29, U42–U47 | M3, M4 |

No milestone depends on a later one. **M5 and M6 may run in parallel after M4**
at the cost of shared-file collisions (§6). Every milestone has a named owning
module map (§4) and defined interfaces (§5).

---

## 2. The codebase at v99 — layers, seams, path scheme

### 2.1 Layer map

```
main.js                     ← the imperative shell: state container, hardware
 │                           (canvas, WebAudio, listeners, timers, storage),
 │                           central loader, test entry, `window.SD`. The ONLY
 │                           file allowed state + effects (compliance bar).
 ├─ interfaces/ (audioInterface, graphicsInterface, inputInterface)
 │     one-way plain-data channels; payloads sanitized + deep-frozen at the
 │     boundary (frame DTO out, audio command lists out, input events in).
 ├─ game.js                  ← game-domain composer: battle + (from M1) campaign.
 │   │                          Actions surface: can*/execute* verbs, executeTurn,
 │   │                          consumeAPAndCheckTurn, checkEndgame,
 │   │                          transitionToAITurn/transitionToPlayerTurn,
 │   │                          getValidWarpCells, getPriorityActionAt,
 │   │                          addAnimation, bindInputs; buildFrame → frame DTO.
 │   ├─ gameState/…          initializeGameState, getGameState, tryPatchGameState,
 │   │                       buildStateSave, restoreStateSave, getStateLifetimes
 │   ├─ rulesConfig/…        12 pure getters over rules_DATA
 │   ├─ actionLegality/…     canUnitMove/Shoot/Shield/Capture, priorityActionAt
 │   ├─ combatMath/…         resolveShootOutcome, resolveCollisionOutcome,
 │   │                       isLethalShot, isShootableFrom
 │   ├─ boardQueries/… visionQueries/… lineOfSight visibilityCache
 │   ├─ cameraMath/… selectionQueries/… reservePlacement endgameStatus
 │   ├─ sectorGenerator/…    buildSectorData, buildUnitRecord
 │   ├─ frameBoard/Units/Overlay/Cursor/Status   (frame DTO slice builders)
 │   ├─ themes/… hud/… (17 widget-model children) ai/… (turn workflow + queries)
 │   ├─ gameTests.js         pure state → [{name, pass, detail[]}]
 │   └─ *_DATA.js            rules_DATA, campaign_DATA, beginningGameState_DATA,
 │                           themes_DATA (one fn returning a frozen table)
 ├─ graphics.js              ← render core: objectRenderer, uiRenderer,
 │                             backgroundRenderer, vfx, graphicsTests
 ├─ sounds.js                ← audio core: sfx, music, audio_DATA
 └─ inputs.js                ← event translation (listeners → main.js at A07)
```

### 2.2 The five seams

1. **State** — one plain-object state tree (today proxied via `GetGameState()`;
   container + mutations converge on `main.js` at compliance A07; transforms
   return `{state, events}` and `main.js` applies them). From M1 this tree gains a
   **campaign section** (§5.1).
2. **Frame DTO** — `buildFrame` → one plain-data render frame, sliced by the
   `frame*` children; crosses GraphicsInterface sanitized and deep-frozen.
3. **Action verbs** — `Actions.*` `can*`/`execute*`: the only way battle state
   changes. Spelling frozen (§5.0).
4. **Channels** — `*Interface.create()` one-way, plain data only.
5. **Data tables** — `*_DATA.js`, one function returning a table, frozen at
   receipt by the owning loader.

### 2.3 Path-scheme translation

| Plan shorthand | Actual location (post-v96) |
|---|---|
| `core/game.js`, `core/X.js` | `main.js children/game.js`, `… game.js children/X.js` |
| `ai/*` | `main.js children/game.js children/ai.js children/aiTurnWorkflow.js children/aiLogic.js children/…` |
| `data/X_DATA.js` | `main.js children/game.js children/X_DATA.js` (audio under `sounds.js children/`) |
| `graphics/*`, `audio/*` | `main.js children/graphics.js children/…`, `… sounds.js children/…` |
| `interfaces/*`, `tests/*` | `main.js children/*Interface.js`; test files under their core's children |
| `scripts/*`, `docs/*` | `dev/scripts/`, `dev/docs/` |

---

## 3. Design decisions (settled here so workers do not re-decide)

- **D1 — All new subtrees parent under `game.js`.** The roadmap names
  `campaignState.js` "under `game.js children/`"; `campaignMap.js`, `economy.js`,
  `outfitting.js`, `factions.js`, `reputation.js`, `missions.js` join it there as
  sibling stems. Rationale: `game.js` is the game-domain composer for battle *and*
  campaign; parent→child references only, so map/economy transforms that read
  campaign state must share its parent. (A separate `campaignMap` core was
  considered and rejected: it would need sibling access to campaign state or a
  second state tree — R7 keeps the boundary discipline that the lost layering
  would have provided.)
- **D2 — Single roster source.** Per the roadmap: `rules_DATA.js` remains the one
  table both battle and campaign read (22 hulls × 15 weapons, slot sizes, ×100
  costs, crew, flagship rules). No `weapons_DATA.js` fork; trade tables live in
  `campaign_DATA.js` (roadmap M4 scope). Duplicate rosters are a defect.
- **D3 — Damage numbers stay in `frameOverlay.js`.** The roadmap's M5 scope names
  `frameOverlay.js`/`frameUnits.js` for red-number work; no new `frameNumbers`
  slice. If the overlay slice outgrows one job, split it A05-style then — not
  speculatively.
- **D4 — `mapAi.js` parents under `campaignMap.js`** (not `ai/`): its caller is
  the map domain, and references flow parent→child only. Delivered in M6 (world
  life), reusing `campaignMap`'s `moveFleet`.
- **D5 — Faction keying from birth.** All new state keys on `FactionId`
  (campaign reputation, map fleets, doctrine), never on `team 1/2`. The battle
  state's `activeTeam` remains as-is until a later cleanup; new code does not
  extend it.
- **D6 — Every new file is born at the compliance bar:** one pure function per
  file (name = filename stem), `{state, events}` transforms, single-job header
  comment (`— job:` + `Owner:`), loaded by its parent chain / `main.js`, folder
  mirrors ownership.

---

## 4. Module map per milestone — deliverable → owning module

### 4.1 M1 — Campaign state model, roster conformance, persistence

| Deliverable | Owning module | New files (stem, parent) |
|---|---|---|
| Campaign state as frozen plain data (fleet roster, wallet, cargo, reputation, clock, map position) | `campaignState.js` subtree | `campaignState.js` (stem, child of `game.js`); children `initializeCampaignState.js`, `tryPatchCampaignState.js`, `rosterOf.js` |
| Roster conformance: 22 hulls × 15 weapons, slot sizes, ×100 costs, crew = ⌈cost/100⌉, flagship 2.5× / scan 8 | `rules_DATA.js` (+ `rulesConfig` getters) | none (data + getters) |
| Starting package + trade-shaped data hooks | `campaign_DATA.js` | none |
| Persistence at campaign scope | `gameState.js` children (`buildStateSave`, `restoreStateSave`, `getStateLifetimes`) | none |
| Conformance + round-trip tests | `gameTests.js` | none |
| Loader / state-container wiring | `main.js` | none |

**Boundary:** `campaignState` children are pure transforms over the campaign
section only — they never touch battle state, rendering, or storage. `rules_DATA`
is edited in place (D2); every changed value is asserted in `gameTests.js`
against DESIGN §3 tables.

### 4.2 M2 — Battle ↔ campaign integration

| Deliverable | Owning module | New files (stem, parent) |
|---|---|---|
| Battle launch from campaign (corner deployment, overflow → reserve, opponent force from campaign entities) | `campaignState.js` (seam), `reservePlacement.js`, `sectorGenerator.js` | `beginBattle.js` (child of `campaignState.js`), `planDeployment.js` (child of `reservePlacement.js`) |
| Carry-over: scrapping payouts, crew transfer/casualties, captured-ship retention, permadeath | `campaignState.js` (seam), `combatMath.js`, `endgameStatus.js` | `applyBattleResult.js` (child of `campaignState.js`), `computeCrewLost.js` (child of `combatMath.js`) |
| Reserve reconciliation: summon = 1 AP, 0 credits; REINFORCEMENTS shop → fleet/reserve view | `actionLegality.js`, `game.js` (`executeWarpIn`), `hud.js` children | `buildReserveModel.js`, `buildReserveButtons.js` (children of `hud.js`, replacing `buildBridgeShopModel`/`buildBridgeShopButtons`) |
| Mirage warp-in semantics (materializes next turn; any hit destroys; ram destroys both) | `game.js` turn flow, `combatMath.js`, `aiFleetCommander.js`, `frame*` slices | `materializeMirages.js` (child of `game.js`) |

**Boundary:** battle state and campaign state only meet through the two seam
transforms (`beginBattle` / `applyBattleResult`) — no ad-hoc field copying at call
sites. Mirage is `unit.kind: "mirage"`, not a parallel entity type.

### 4.3 M3 — Campaign map: movement, fuel, hyperspace, encounters

| Deliverable | Owning module | New files (stem, parent) |
|---|---|---|
| Map state, turn-based movement (slowest ship), real space + hyperspace | `campaignMap.js` subtree | `campaignMap.js` (stem, child of `game.js`); children `buildMapState.js`, `moveFleet.js`, `hyperspaceJump.js` |
| Fuel: 5 ⒸB/unit, proportional to ship count, hyperspace ×3; blocked move → merchant encounter | `campaignMap.js`, `campaign_DATA.js` (trade/base-price hooks) | `fuelCost.js`, `merchantOffer.js` (children of `campaignMap.js`) |
| Map visibility (detected at N squares = N ships; nebula hides battles), encounter entry → battle next turn | `campaignMap.js`, `campaignState.js` | `mapVisibility.js`, `battleEventAt.js` (children of `campaignMap.js`) |
| Map rendering (red SC2-style hyperspace, gravity wells only) | `graphics.js` (`backgroundRenderer` map layer, `objectRenderer`) + GraphicsInterface `MapFrameDTO` | `mapFrame.js` (child of `campaignMap.js`) |
| Map HUD + hailing shell (voice placeholder) | `hud.js` children | `buildMapHudModel.js`, `buildHailModel.js` (children of `hud.js`) |

**Boundary:** `campaignMap` children operate on `MapState` + the campaign section
only; the render path is the existing GraphicsInterface with `kind: "map"` frames
— no new channel, no renderer imports of map logic. Battles stay frozen on the
map while active (roadmap Q4 default).

### 4.4 M4 — Economy, stations, crew

| Deliverable | Owning module | New files (stem, parent) |
|---|---|---|
| Commodities with deterministic seeded fluctuating prices (per-system variation) | `economy.js` subtree + `campaign_DATA.js` trade tables | `economy.js` (stem, child of `game.js`); children `priceAt.js`, `applyTrade.js` |
| Station services (buy/sell hulls, weapons, goods; fuel, crew, parts; repair/refit consuming parts) | `hud.js` children (station modal), `campaignState.js`, `outfitting.js` seam lands in M5 (validation only) | `buildStationModel.js` (child of `hud.js`) |
| Crew model: wages 5 ⒸB/crew/month, casualties (already M2's `computeCrewLost`), under-50% cannot act or deploy | `economy.js`, `actionLegality.js` (incapacitation gate — small scope amendment to the roadmap's file list), `gameState.js` (clock) | `payWages.js` (child of `economy.js`), `crewStatus.js` (child of `actionLegality.js`) |
| Merchant-fleet flow fully wired | `campaignMap.js` (`merchantOffer`), `hud.js` | none new |

**Boundary:** prices and rates live in `campaign_DATA.js` only — never in verb
bodies (R9). Clock ticks are `main.js` effects (timers/storage); every tick's
computation is a pure `economy.js`/`gameState.js` transform.

### 4.5 M5 — Outfitting and multi-weapon loadouts

| Deliverable | Owning module | New files (stem, parent) |
|---|---|---|
| Slot math (dmg × range, ×1.5 railgun, round nearest) + slot validation (sum ≤ capacity) | `outfitting.js` subtree | `outfitting.js` (stem, child of `game.js`); children `computeSlotSize.js`, `validateLoadout.js` |
| Loadout seam: the only readers of unit weapon stats | `outfitting.js` | `defaultLoadout.js`, `loadoutOf.js`, `unitFirepower.js`, `unitRange.js`, `unitWeapons.js` (children of `outfitting.js`) |
| Slot-based outfitting at stations (swap/mount within capacity) | `hud.js` children (outfit modal), `campaignState.js` (roster loadouts), `actionLegality.js` | `buildOutfitModel.js` (child of `hud.js`) |
| Multi-weapon fire: player picks the firing weapon per shot; red numbers show that weapon's damage | `game.js` (`executeShoot`), `combatMath.js`, `frameOverlay.js`, `frameUnits.js` | none new (D3) |
| Legal loadouts from generation + AI | `sectorGenerator.js`, `aiThreatScorer.js` (+ `aiUnitPlanner`) | none new |

**Boundary:** after M5 no file outside the `outfitting.js` subtree may read
`unit.firepower` / `unit.range` / `unit.wType` or compute slot sums (grep-
enforceable acceptance check). Graphics consumes number cells + flags only.

### 4.6 M6 — Factions, reputation, missions, world life

| Deliverable | Owning module | New files (stem, parent) |
|---|---|---|
| Five factions: doctrine-weighted composition, AI doctrine mapping, themes, dialogue voice banks | `factions.js` subtree + `themes_DATA.js`, `aiPriorities_DATA.js`, `sectorGenerator.js` | `factions.js` (stem, child of `game.js`); children `factions_DATA.js` (table), `composeFleet.js`, `buildDialogueModel.js`, `applyDialogueOutcome.js` |
| Reputation (−100..200, five quintiles), band-driven relations (allied-only sharing out of battle, non-transitive, none in hyperspace), event hooks | `reputation.js` subtree | `reputation.js` (stem, child of `game.js`); children `reputationBand.js`, `stanceBetween.js`, `adjustReputation.js` |
| Missions and bounties at stations, payouts, completion tracking, campaign end state | `missions.js` subtree, `endgameStatus.js`, `hud.js` children (mission board) | `missions.js` (stem, child of `game.js`); children `generateBounty.js`, `completeMission.js` |
| World life: NPC fleets move, trade, fight on the map | `campaignMap.js` (`mapAi.js` child — D4) | `mapAi.js` (child of `campaignMap.js`) |
| Hail/dialogue UI | `hud.js` children | `buildHailPanel.js` (child of `hud.js`; grows M3's `buildHailModel`) |

**Boundary:** faction personality is data (voice text banks, doctrine weights) —
no `if (faction === …)` in code. Stance/relationship logic lives only in
`reputation.js` children; `mapAi` uses the same `moveFleet`/fuel rules as the
player.

---

## 5. Public interfaces

Conventions (compliance mechanics contract): every file except `main.js` exposes
**exactly one pure function**, named for its file; transforms return
**`{state, events}`** (new state; `main.js` applies); data tables are one function
returning a table, **deep-frozen at receipt** by the owning loader. Signatures are
the contract; bodies are out of scope.

### 5.0 Frozen across all milestones

- `Game.Actions.*` verb names/arities (semantics evolve; spelling does not).
- Frame DTO top-level shape — **additive changes only** inside a milestone; any
  rename is an atomic cross-module update.
- Channel payloads, test contract `[{name, pass, detail[]}]`, `window.SD` handle.
- AI env facade (byte-identical until an M5/M6 update deliberately extends it with
  loadout accessors).

### 5.1 M1 interfaces

```text
// campaignState.js children (NEW; the campaign section of state)
initializeCampaignState(campaignData) → CampaignState
tryPatchCampaignState(state, patch) → { state }        // guarded pure patch
rosterOf(campaignState, filter?) → RosterEntry[]

CampaignState = {
  fleet: RosterEntry[],                 // deployed + reserve, no size caps
  wallet: number,                       // ⒸB, ×100 scale
  cargo: { goods: number, fuel: number, crew: number, parts: number },
  reputation: Record<FactionPairKey, number>,   // populated in M6 rules, keyed now
  clock: { month: number, year: number },
  map: { locationId: string },          // filled by M3
}
RosterEntry = {
  hull: ShipType, loadout: WeaponName[],   // loadout strings exist from M1;
  hp: number, maxHp: number, crew: number  // battle adopts them in M5
}
```

`rules_DATA.js` schema additions (the single roster source, D2):
```text
weapons: Record<WeaponName, { class: "cannon"|"missile"|"railgun",
                              dmg: number, range: number, slots: number }>
  // 15 variants; slots precomputed per DESIGN §3.2 table ("pdc" legacy name
  // dies at M5's battle adoption — see §7)
shipSpecs: + capacity (default-loadout slot total), crew = ⌈cost/100⌉,
  flagship variants at 2.5× base cost, flagship scan 8
  // all money values ×100 (5–95 → 500–9,500-era scale per DESIGN §4.5)
```

Persistence (existing seam, extended): `buildStateSave(state)` /
`restoreStateSave(raw)` carry the campaign section; `getStateLifetimes(state) →
{profile, fleet, campaign}`. Schema version bump + migration per §7.

`gameTests.js` additions (pure): hull/weapon conformance against DESIGN §3.1–3.2
invariants (flagship 2.5×, Dreadnought = 2× Battleship, crew rounding, scan 8,
every default loadout fits capacity) and a save→restore JSON round-trip.

### 5.2 M2 interfaces

```text
// campaignState.js children (the battle seam — the ONLY battle↔campaign coupling)
beginBattle(campaignState, encounter) → BattleSetup
applyBattleResult(campaignState, battleResult) → { state, events }

BattleSetup  = { factions: FactionId[], deployments: { faction, units: Unit[] }[],
                 overflow: RosterEntry[], seed: number }
BattleResult = { winner: FactionId, survivors: UnitSnapshot[],
                 captured: UnitSnapshot[], payouts: { parts: number, credits: number } }
  // payouts default (roadmap Q1): parts at 50% of hull slot value;
  // captured ships retained; crew casualties per computeCrewLost;
  // end-of-battle crew auto-transfers to the flagship
```

```text
// combatMath.js child
computeCrewLost(damage, maxHp, crew) → number   // half the lost-HP percentage

// game.js child — mirage lifecycle (U20 semantics)
materializeMirages(state) → { state, events }
events += { kind: "mirageMaterialize", unitId } | { kind: "mirageRam", aId, bId }
// unit.kind: "ship" | "mirage"; mirage has no HP: any hit destroys it, a ram
// destroys both (the rammer dies in a distinctive explosion); warping-in ships
// never carry the stealth badge
```

```text
// reservePlacement.js child — deployment overflow (roadmap Q2 default: player picks)
planDeployment(deployable: RosterEntry[], capacity: number, choice?: ShipId[])
  → { deployed: RosterEntry[], overflow: RosterEntry[] }

// executeWarpIn semantics: summons from campaign reserve; costs 1 AP, 0 credits;
getValidWarpCells(state, team) → Cell[]
  // = visible-to-team ∩ empty ∩ non-asteroid ∩ within 3 of the flagship
  // ("#capital ship" warp-locus role dropped; flagDescriptions updated)

// hud.js children (replacing the bridge shop)
buildReserveModel(state, hudDeps) → ReserveModel
buildReserveButtons(state, hudDeps) → Button[]

// endgameStatus: losing the flagship ⇒ { over: true, reason: "flagship-lost" }
```

### 5.3 M3 interfaces

```text
// campaignMap.js children (NEW; MapState is campaign-section data)
buildMapState(campaignData, rng) → MapState {
  locations: Location[],   // { id, kind: "empty"|"planet"|"station"|"nebula", x, y }
  fleets: MapFleet[],      // { id, faction, ships: ShipType[], x, y, fuel }
}
moveFleet(mapState, fleetId, dest) → { mapState, events }
  // distance capped by the slowest ship; rejected without fuel or with a
  // flagship under 50% crew — a rejection produces the merchant event (Q? default)
hyperspaceJump(mapState, fleetId, target) → { mapState, events }
  // jump points at system edges (Q5 default); gravity wells are destinations only
fuelCost(fleet, distance, space: "normal"|"hyperspace") → number
  // ships × distance × 1 unit (5 ⒸB/unit); hyperspace ×3
mapVisibility(mapState, observerFaction) → { detectedFleets, battles }
  // detection radius = ship count; nebula squares hide battles (never reserves)
battleEventAt(mapState, locationId) → BattleSetup | null
  // map frozen during battles (Q4 default); an entering fleet appears on the
  // nearest map-relative edge and joins on the next turn
merchantOffer(mapState, fleetId) → Offer   // sell discounted / provision inflated
mapFrame(mapState, view) → MapFrameDTO     // → GraphicsInterface, kind: "map"
```

```text
// hud.js children
buildMapHudModel(mapState, hudDeps) → MapHudModel
buildHailModel(encounter) → { speaker, lines, options: ("talk"|"threaten"|"leave")[] }
  // voice placeholder until M6's dialogue voice banks
```

### 5.4 M4 interfaces

```text
// economy.js children (NEW); trade tables live in campaign_DATA.js (D2)
priceAt(marketState, good, location, time) → number
  // deterministic seeded base × per-system variation × drift; bounds-clamped
applyTrade(state, good, qty, location) → { state }
  // buying moves the local price; buy-then-sell round-trip loses exactly the spread
payWages(state) → { state, unpaid: number }
  // 5 ⒸB × Σ crew on month rollover (Q6: round up); unpaid ⇒ desertion:
  // crew leave the most expensive ships first until payroll balances

// actionLegality.js child (scope amendment — the roadmap's file list omits it)
crewStatus(unit) → "ok" | "incapacitated"     // <50% crew ⇒ cannot act in battle;
                                              // cannot deploy out of battle

// hud.js child
buildStationModel(state, hudDeps) → StationModel
  // buy/sell hulls, weapons, goods; fuel, crew, parts; repair/refit (parts cost
  // = proportional HP restore; refit consumes parts per swapped weapon)
// main.js effects: the month clock timer and save/storage I/O only
```

### 5.5 M5 interfaces

```text
// outfitting.js children (NEW — the loadout seam; the ONLY weapon-stat readers)
computeSlotSize(weapon: { class, dmg, range }) → number
  // dmg × range; ×1.5 railgun; round to nearest
validateLoadout(loadout, hull, weapons) → { ok, reason?, usedSlots, capacity }
defaultLoadout(hull, weapons) → WeaponName[]       // derived from the hull spec
loadoutOf(unit) → WeaponName[]
unitFirepower(unit, weapons) → number              // Σ weapon dmg of loadout
unitRange(unit, weapons) → number                  // effective range
unitWeapons(unit, weapons) → WeaponSpec[]
```

```text
// battle adoption (schema migration — see §7)
unit.loadout : WeaponName[]        // replaces unit.wType / firepower / range reads
executeShoot(state, unitId, targetCell, weaponName?) → { state, events }
  // multi-weapon: the attacker picks which weapon fires on the one attack per
  // turn (Q8 default); red numbers reflect ONLY the chosen weapon's damage —
  // frameUnits/frameOverlay compute number cells from the chosen WeaponSpec
// aiThreatScorer/aiUnitPlanner/sectorGenerator read stats through the seam only
```

### 5.6 M6 interfaces

```text
// factions.js children (NEW)
factions_DATA() → FactionsTable {
  factions: Record<FactionId, {
    name, voice: { tone, lines },                    // voice text bank (Q11 content)
    doctrine: { tactic: "rush"|"optimal"|"missile"|"capital"|"swarm",
                composition: { common: ShipType[], uncommon: ShipType[], rare: ShipType[] } },
    theme: ThemeKey, defaultAlignment: number
  }>
}
composeFleet(factions, factionId, budget, rng) → ShipType[]
  // doctrine-weighted; statistical conformance (e.g. ≥90% of Armoury rolls
  // field a capital ship) asserted over seeded rolls
buildDialogueModel(state, encounter) → DialogueModel
applyDialogueOutcome(state, encounter, choice) → { state, events }
  // hail: talk / threaten / leave (+ trade first per Q11 default); post-hail the
  // fleet is re-placed on one of the nearest open squares

// reputation.js children (NEW)
reputationBand(score) → "enemy"|"unfriendly"|"neutral"|"friendly"|"allied"
  // five 60-point quintiles over −100..200 (Q10 default)
stanceBetween(repState, a, b) → "hostile"|"neutral"|"allied"
  // allied-only sensor sharing OUT of battle; friendly+ in battle; strictly
  // pairwise (non-transitive); none in hyperspace or across systems
adjustReputation(repState, a, b, delta) → repState
  // event hooks: kills ±10, missions ±15, trade ±2 (Q4/Q10 defaults)

// missions.js children (NEW)
generateBounty(location, marketState, rng) → Mission
  // fixed contracts at stations first (Q9 default): destroy/patrol/escort,
  // payout scaled to target value
completeMission(state, missionId) → { state, payout }

// campaignMap.js child (world life, D4)
mapAi(mapState, factionId, rng) → MapOrder[]
  // NPC fleets use the same moveFleet/fuel rules; trade between stations, pursue
  // bounties, fight hostile bands (autonomous movement behind the Q11 default flag)

// endgameStatus: + { over: true, reason: "campaign-complete" } (Q9 default:
// sandbox with a campaign-complete state)
```

---

## 6. Dependency-ordered implementation sequence

**Milestone order (from the roadmap's dependency table):**
**M1 → M2 → M3 → M4 → {M5 ∥ M6}.**

**Serialized vs parallel (acceptance criterion):**

- **Must serialize:** M1 before everything; M2 before M3; M3 before M4; M4 before
  M5 and M6. M5 and M6 are the only parallelizable *milestones* — and only with
  the collision discipline below.
- **Can build in parallel:** within a milestone, updates with disjoint file lists
  (max 3 concurrent children); across M5 ∥ M6, only the pairs that avoid the
  shared files listed below. Any two updates touching `game.js`'s action/turn-flow
  region, `main.js`'s loader, or one shared data file merge into **one agent**.

**Shared-file collision hotspots (serialize or single-agent-merge):**
`game.js` (composer + Actions), `main.js` (loader/state container), `rules_DATA.js`
(M1 ∥ M5), `campaign_DATA.js` (M1, M3, M4, M6), `aiThreatScorer.js` (M5 ∥ M6),
`hud.js children/` (every milestone), `gameState.js` (M1, M2, M4),
`sectorGenerator.js` (M2, M5, M6).

**Suggested intra-milestone update order** (each = one or more vNN releases, all
standing gates per roadmap §6):

1. **M1:** (a) `rules_DATA` roster conformance + tests → (b) `campaignState`
   subtree + state container wiring → (c) persistence extension + round-trip
   tests. The ×100 rescale lands in (a) — once, atomically.
2. **M2:** (a) `computeCrewLost` + carry-over seam (`beginBattle`/`applyBattleResult`)
   → (b) reserves/warp reconciliation + `planDeployment` + reserve-view HUD →
   (c) mirage semantics + `materializeMirages` → (d) endgame/permadeath wiring.
3. **M3:** (a) `buildMapState` + `moveFleet`/fuel → (b) `hyperspaceJump` +
   rendering layer → (c) `mapVisibility` + `battleEventAt` + map HUD/hailing shell.
4. **M4:** (a) trade tables + `priceAt`/`applyTrade` → (b) station modal +
   repair/refit → (c) `payWages`/clock + `crewStatus` gating → (d) merchant flow.
5. **M5:** (a) `outfitting` seam (slot math, validation, loadout readers) →
   (b) battle adoption of `unit.loadout` (atomic: game + ai + hud + frame slices
   in one release) → (c) multi-weapon fire + number cells → (d) outfit modal +
   generation/AI legality.
6. **M6:** (a) `factions_DATA` + `composeFleet` + themes → (b) `reputation`
   subtree + stance wiring → (c) dialogue model + hail panel → (d) missions →
   (e) `mapAi` world life → (f) campaign-complete state + polish.

---

## 7. Migration & backward-compatibility concerns

- **×100 rescale (M1) is the single largest compat event.** Every money value
  moves; saves must migrate (scale old wallet/credits ×100 in
  `restoreStateSave`'s chain); `dev/docs/game_balance.md` (v70-era, stale) is
  **regenerated from data, not patched** (roadmap §5.2–5.3).
- **Save schema policy:** `beginningGameState_DATA`/`campaign_DATA` carry
  `version`/`schema`; every schema-touching update bumps the version and adds its
  migration inside `restoreStateSave`'s child chain. M1's round-trip test is the
  regression net; keep a v99-shaped fixture restored at each milestone boundary.
- **`unit.loadout` adoption (M5)** is atomic across game/ai/hud/frame slices in
  one release; during M1–M4 the roster carries loadout strings while battle units
  keep `wType`/`firepower`/`range` (dual representation is contained in
  `beginBattle`/`applyBattleResult` — the only translators). `pdc`→`cannon`
  strings die at M5 (grep-clean acceptance: zero `pdc` matches remain).
- **`-shielded` latch (DESIGN §2.5, master-plan U01):** the roadmap does not
  schedule its removal even though code still carries it (§0 evidence). Fold the
  removal + `flagDescriptions` update into M2(a) as repair work **if verification
  confirms the DESIGN behavior is unmet** — one grep + harness check decides.
- **Frame DTO:** additive-only inside milestones; M5's number-cell change rides
  the atomic adoption release with whole-frame parity evidence (render-coupled
  DTO — roadmap M5 risk).
- **Frozen surfaces** (§5.0) may only change at a milestone seam
  (`executeShoot`'s `weaponName?` at M5 is the planned exception — additive
  parameter, old arity preserved).

---

## 8. Architecture risks

| # | Risk | Why it bites later | Mitigation (design-level) |
|---|------|--------------------|---------------------------|
| R1 | **`main.js` god-file concentration** (compliance A07 converges all state + effects there; M4 adds clock/storage effects) | Every feature collides in one file; layering degrades into "main.js sections" | Named sections (compliance §8.10); effects stay thin adapters around pure `{state, events}` transforms; no domain state in `main.js` beyond the container |
| R2 | **`game.js` as universal composer** — now parent of 7 new subtrees plus battle/hud/ai | Nearly every milestone touches it; parallel updates conflict; the composer function bloats into a second god-file | Composer stays trivial assembly (A05 semantics); each subtree stem exposes one function; serialize/merge all `game.js`-touching updates (§6); push domain logic DOWN into children, never into the stem |
| R3 | **Dual unit representation** (battle `wType/firepower/range` vs roster `loadout`) until M5 | Half-migrated reads create two sources of truth for weapon stats | Translators exist ONLY in `beginBattle`/`applyBattleResult`; the M5 adoption is atomic; grep gate at M5: no raw reads outside `outfitting.js` |
| R4 | **`aiThreatScorer.js` in both M5 and M6 scope** (+ its pending A06 split) | Three-way collision: compliance split, loadout adoption, tactics mapping | Finish the A06 split before M5 (M1 gate rule); M5 and M6 updates touching it serialize or merge into one agent |
| R5 | **Missing faction abstraction in battle state** (`activeTeam`, `credits: {1,2}`) | U04-style turn-queue and faction work retrofits keying twice | D5: all new state faction-keyed; battle-state generalization is deliberately out of roadmap scope — do not half-do it inside milestones |
| R6 | **Reputation/stance/visibility coupling** (M6: sharing rules, hyperspace exceptions, non-transitivity) | Inline threshold reads scatter; sharing silently becomes transitive | Stance resolution ONLY in `reputation.js` children; visibility consumes a precomputed share-set as data |
| R7 | **Map domain inside `game.js` (D1)** — the lost layering a separate core would give | Map logic leaks into battle transforms and vice-versa | Enforce the subtree boundary: `campaignMap` children touch `MapState` + campaign section only; the map↔battle contract is exactly `BattleSetup`/`BattleResult`; `mapFrame` is the only render exit |
| R8 | **Save-format fragility** across the ×100 rescale + ~20 schema touches | Old saves (and harness fixtures) restore half-migrated | Per-update migrations in the `restoreStateSave` chain; version bumps; v99 fixture restored at each milestone boundary (§7) |
| R9 | **Data-as-code drift** — money/price/flag values in verb bodies; stale `game_balance.md` | Tuning edits break legality logic; balance docs contradict data | Values live in `*_DATA.js` only; regenerate `game_balance.md` from data at M1; flag copy changes ship with the logic change in one release |
| R10 | **Source divergence** (roadmap §2 "implemented" vs master-plan U-list "pending" vs code — e.g. `-shielded` latch live, mirages absent) | Implementers build on a false "already done" or duplicate shipped work | First update of each milestone verifies its deliverables against code (grep + harness probe) and records the delta; repair items fold into the milestone's (a) update |
| R11 | **No CLI test suite** — verification is ad-hoc harnesses + browser probes | Regressions hide between releases; contract drift across milestones | Every §5 interface names its assertion style; two-era parity harnesses for shape changes (M5 adoption, frame DTO); standing gates per vNN release |
| R12 | **Screen-flash policy vs new VFX** (M2 mirage-ram explosion, M3 hyperspace, M6 world-life battles) | Standing user requirement: the screen never flashes | Event DTOs carry presentation intent only; VFX implementations follow the flash policy (warm fading shockwaves, dark from first paint); audit new VFX in the milestone's final update |
| R13 | **`campaign_DATA.js` multi-milestone hotspot** (M1 ∥ M3 ∥ M4 ∥ M6 all add tables to it) | Four milestones collide on one data file | Keep additions sectioned per domain (`initial`, `map`, `trade`, `factions`); parallel milestones land data-table additions as separate small releases; never two concurrent edits |
| R14 | **Docs split** (planning docs at repo-root `docs/` vs standing decision (g) `dev/docs/`) | Workers look in the wrong tree | Resolved for this program: both planning docs at root `docs/` per commission (roadmap Q12 open); revisit at the compliance A08 docs sync |

---

## 9. Open questions & adopted defaults (structure-relevant)

The roadmap's §7 Q1–Q13 carry the behavioral defaults; the ones that fix
**structure** are restated here as adopted so workers proceed without stalls:

1. **Q1 carry-over** — parts at 50% of hull slot value; captured ships retained;
   starting fleet/funds in `campaign_DATA.js` (shapes §5.2).
2. **Q2 deployment overflow** — player picks in a deployment step
   (`planDeployment(choice?)`).
3. **Q3 reserve/credit reconciliation** — remove in-battle purchasing; reserves
   are campaign reserve ships (M2).
4. **Q4 battle↔map clock** — map frozen during battles; entering fleet on the
   nearest map-relative edge (`battleEventAt` contract, §5.3).
5. **Q5 hyperspace** — jump points at system edges; gravity wells destinations
   only.
6. **Q8 multi-weapon fire** — player picks the weapon per shot; red numbers show
   that weapon only (`executeShoot(…, weaponName?)`).
7. **Q9 missions** — fixed station contracts first; sandbox + campaign-complete
   end state.
8. **Q10 reputation** — five 60-point quintiles over −100..200.
9. **Q12 doc home** — leave both planning docs at repo-root `docs/` until ruled.
10. **Q13 cadence** — several vNN updates per milestone for M4–M6 (their surfaces
    are large); the intra-milestone order in §6 is the batching guide.

Open items that remain genuinely blocked on the requester (no structural impact —
safe to proceed on defaults): Q6 wage rounding details (M4), Q7 hyperspace
mechanics edge cases (M3), Q11 dialogue/interaction content scope (M6).
