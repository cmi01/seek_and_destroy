# Seek & Destroy — Unified Game Design Document

Project: SG58 · Platform: Web (vanilla JS + HTML5 canvas)
Status: authoritative design source. Supersedes the SG58 draft design doc. Where this
document and any older document disagree, this document wins.

---

## 1. Core Concept

Seek & Destroy is a space fleet game in the spirit of Starsector, with turn-based
battles and a turn-based campaign map. The player builds and commands a fleet,
travels between star systems and through hyperspace, trades, outfits ships and takes
on missions. Battles are won through information, positioning and planning.

---

## 2. Battle

### 2.1 Turns and actions

- Each faction gets **4 actions per turn**. For the player these are the player's
  actions; there is no commander unit.
- Every action costs **1 AP**. The action budget never depends on fleet size —
  2 ships or 50 ships, a faction still gets 4 actions per turn.
- Action types: **move**, **attack** (fire one weapon), **board**, **raise shield**,
  **summon a reserve ship** (warp-in), **retreat**.
- Each ship may perform **each type of action at most once per turn**: it can move
  and attack and board and raise a shield in one turn, but it cannot move twice or
  attack twice.
- Turn order is **strict round-robin between factions**: one faction spends its 4
  actions, then the next faction spends its 4 actions, and so on. The initial order
  is arbitrary (going first is not an advantage). When a faction is eliminated, the
  faction that went least recently goes next.
- The player has an **END TURN** button that asks for confirmation with a prominent
  warning showing the number of unspent actions.
- The AI never voluntarily ends its turn: skipping is scored at **−99999** so it is
  taken only when the AI is mechanically forced to (nothing it can legally do).
  This is error-catching, not strategy.
- The AI is bound by the same 4 actions per turn and acts at a steady pace
  (~500 ms per action). AI planning is purely internal and never surfaced.

### 2.2 Information and the red damage number

Battles are an information game; sensor data is a central part of play. The exact
damage of an attack is always shown to the player before the attack is committed.

Red damage numbers (the exact damage the attack would deal):

- When a weapon-capable ship that **can still attack this turn** is selected, red
  numbers are shown across **its weapon radius**.
- The number is **faded** on cells that hold no visible target, and **not shown**
  on asteroid-occupied cells or cells with no line of sight (asteroid LOS rules).
- Trigger rules:
  - With **no ship selected**, hovering any weapon-capable ship shows its numbers.
  - With a **weapon-capable ship selected**, its numbers show regardless of hover.
- The number **flashes once per second** and fills most of its cell. It is an
  in-cell visual object: it scales with the game camera exactly like a ship,
  asteroid or shield bubble, and it must not change size with the browser zoom.
- A ship may only attack a cell showing a damage number. Attacks into fog are not
  allowed: only **spotted** targets can be attacked.
- Shielded targets: a **non-railgun** attack shows a flashing **yellow "1"** instead
  of a red number. A **railgun** attack shows the full damage in red, shaking
  slightly, while the target's shield bubble flickers red.

### 2.3 Movement and hazards

- One move action moves one ship up to its `move` stat distance, obeying
  line-of-sight and asteroid blocking.
- **Blind asteroid hazard:** if a ship moves into an asteroid it could not see
  (no sensor coverage of the cell), the ship is **instantly destroyed** — an
  explosion with a crashing sound.
- **Ramming:** moving into a hidden enemy ship resolves as a collision. Both ships'
  shields drop, effective HP is compared (a raised shield counts as +1 effective
  HP), and the lower side is destroyed. **Equal effective HP destroys both ships.**

### 2.4 Weapons

Three mechanical classes: **cannons**, **railguns**, and **missiles/torpedoes**
(the missile family).

- **Railguns ignore shields** and deal full damage; the hit shatters the bubble.
- **Every other weapon deals 1 damage** to a shielded target and strips the bubble.
- All weapons obey the same range, line-of-sight and fog rules.
- The game contains exactly the 15 weapon variants listed in §3.2, attached to
  hulls as listed. No other weapon types exist.

### 2.5 Shields

- Shields are binary: raised or lowered. A shielded ship **arrives with its shield
  raised**.
- A shield is lowered when: **the ship fires** any weapon, or **the ship takes any
  hit** — railgun, other weapon, or a ram. Any hit always strips the shield.
- Raising a shield costs **1 AP** and requires a **shield generator**. There is no
  cooldown: a ship can raise its shield again later in the same turn if it was
  stripped (each raise costs 1 AP), and re-raising is blocked only by an already
  raised shield, no shield generator, or no AP. Shielding matters at the end of a
  faction's turn, so raising more than once per turn is allowed.
- Damage: non-railgun hit on a raised shield → **1 damage + shield stripped**;
  railgun hit → **full damage + shield stripped**.
- Three distinct shield-drop animations:
  1. **Graceful collapse** — the ship lowers its own shield to fire.
  2. **Stress dissipation** — a normal weapon hit strips the bubble.
  3. **Shatter** — a railgun hit shatters the bubble and full damage goes through.
- Shield bubbles are rendered as a **smooth gradient bubble**.

### 2.6 Boarding

- Ships with a marine contingent can **board an adjacent (d ≤ 1), spotted,
  non-flagship enemy** for 1 AP (at most once per ship per turn) and capture it —
  the captured ship switches to the capturing side inside the battle.
- Flagships are immune to boarding capture.

### 2.7 Sensors, stealth and shared vision

- **In battle**, each unit has its own `scan` range (1–8). Fog of war hides
  everything outside friendly scan.
- **Nebula stealth:** ships inside a nebula are cloaked — rendered shaded with an
  eye-with-a-slash stealth badge — and are only visible to enemies at **d ≤ 1**.
  The badge is the source of truth for the d ≤ 1 rule (anything wearing the badge
  is only visible from d ≤ 1). Exceptions — the badge is removed from:
  - a ship that is **warping in** (a mirage is visible at normal scan range even
    inside a nebula);
  - a ship that has **fired** this turn (stealth returns at the start of its next
    turn).
- **Sensor data sharing:**
  - **In a battle:** friendly and allied factions share raw sensor vision.
  - **Outside a battle:** only **allied** factions share sensor data; merely
    friendly factions do not.
  - **Never** shared in hyperspace, and **never** across different solar systems.
  - Sharing is **not transitive** (A↔B and B↔C allies does not give A C's data).
- **Map visibility:** a fleet is detected on the campaign map at a distance in
  squares equal to **the number of ships in the fleet** (every fleet carries a
  flagship, which has maximum scan).

### 2.8 Reserves and warp-in (the mirage)

- A fleet is **deployed ships + reserve ships**. There is no size limit on a fleet
  or its reserve.
- **Summoning** costs **1 AP only** (no credits). A reserve ship is placed as a
  **"warping in" mirage** at a random **visible, empty** cell within **3 of the
  flagship**. Only the flagship anchors summoning — capital hulls have no special
  warp role.
- The mirage **materializes into the real ship at the start of the summoning
  player's next turn**.
- Mirage rules:
  - The mirage occupies its cell and can only be summoned into an empty cell.
  - It can be shot: it has **no HP** and **any hit destroys it**.
  - If a ship rams it, **both are destroyed** — the ramming ship dies in a
    distinctive, flashy explosion.
  - Mirages are visible at normal scan range even inside a nebula.

### 2.9 Battle start

- The **player's flagship** spawns at a random empty spot within **6 of the
  bottom-left corner**. The player's other deployed ships also spawn within 6 of
  the bottom-left corner; if the fleet is too large to fit, the rest remain in
  reserve.
- The **enemy flagship** spawns within 6 of the **top-right corner**, with enemy
  deployed ships likewise in that corner region.
- If other factions are present, each takes one of the **remaining two corners**
  (randomly assigned).
- Each faction has exactly **one flagship** (enemies included).
- Asteroid fields are **biased toward the middle** of the map and will never be
  dense enough to fill a corner spawn region. If generation ever fails to leave a
  corner spawnable, the level is **re-rolled before it is ever shown**.

### 2.10 Victory, defeat and retreat

- If the **enemy flagship is destroyed, the battle is won immediately** and every
  surviving enemy ship is **scrapped for resources**.
- If the **player's flagship is destroyed, the campaign is over.**
- If the player's flagship is **crew-incapacitated** (under 50% crew) but alive,
  the battle continues as long as other ships can fight — but the fleet **loses
  the ability to retreat**.
- **Retreat:** any non-incapacitated ship within **3 of the flagship** and
  **outside enemy sensor range** can retreat into reserves at any time, using an
  action. The **flagship itself** can retreat at any time when outside enemy
  sensor range — but all other ships are left behind.
- After a battle, **crew are automatically transferred** to the flagship from the
  other ships.

---

## 3. Ships and Weapons

The game contains exactly the **22 ship types** and **15 weapon variants** below.
No others are added. All values are the design target; prices are on the ×100
economy scale (§4.5).

### 3.1 Ship types (22)

Default loadout shown; weapons are swappable (§3.3). "Flagship" = command locus
(!flagship): losing your flagship ends the campaign (§2.10); flagships are immune
to boarding.

| # | Type | HP | Move | Scan | Default weapon | Dmg/Range | Slots | Cost ⒸB | Crew | Notes |
|---|------|----|------|------|----------------|-----------|-------|---------|------|-------|
| 1 | Shuttle | 1 | 3 | 5 | Light Cannon | 1/1 | 1 | 500 | 5 | |
| 2 | Fighter | 2 | 9 | 2 | Dual Light Assault Cannon | 2/2 | 4 | 500 | 5 | |
| 3 | Probe | 1 | 7 | 8 | — | — | 0 | 500 | 5 | unarmed, max scan |
| 4 | Bomber | 1 | 7 | 1 | Unguided Torpedo | 7/1 | 7 | 1,000 | 10 | |
| 5 | Boarding APC | 3 | 4 | 2 | — | — | 0 | 1,000 | 10 | unarmed, marines |
| 6 | Attack Frigate | 4 | 8 | 5 | Dual Light Cannons | 2/3 | 6 | 1,000 | 10 | shield |
| 7 | Missile Frigate | 3 | 6 | 5 | Light Missile Battery | 1/8 | 8 | 1,500 | 15 | shield |
| 8 | Attack Destroyer | 6 | 6 | 3 | Medium Assault Cannon Battery | 4/4 | 16 | 1,500 | 15 | |
| 9 | Railgun Destroyer | 6 | 6 | 3 | Light Railgun | 3/3 | 14 | 2,000 | 20 | |
| 10 | Missile Destroyer | 4 | 6 | 3 | Medium Missile Battery | 2/8 | 16 | 2,000 | 20 | |
| 11 | Light Cruiser | 6 | 6 | 3 | Medium Cannon Battery | 3/5 | 15 | 2,000 | 20 | shield (range 5) |
| 12 | Railgun Cruiser | 10 | 4 | 3 | Capital Railgun | 7/4 | 42 | 2,500 | 25 | shield |
| 13 | Heavy Cruiser | 12 | 4 | 3 | Heavy Railgun | 5/3 | 23 | 2,500 | 25 | shield, armor belt |
| 14 | Missile Cruiser | 8 | 4 | 5 | Medium Missile Battery | 2/8 | 16 | 2,500 | 25 | shield |
| 15 | Battlecruiser | 12 | 4 | 3 | Heavy Cannon Battery | 7/6 | 42 | 3,500 | 35 | shield |
| 16 | Missile Battleship | 18 | 2 | 5 | Heavy Missile Battery | 4/8 | 32 | 4,500 | 45 | shield, marines |
| 17 | Battleship | 25 | 2 | 3 | Ultra Railgun | 9/6 | 81 | 5,000 | 50 | shield, marines |
| 18 | Dreadnought | 47 | 1 | 3 | Storm Missile Battery | 8/8 | 64 | 10,000 | 100 | marines, no shield |
| 19 | Flagship Battlecruiser | 12 | 4 | 8 | Heavy Cannon Battery | 7/6 | 42 | 8,750 | 88 | shield, FLAGSHIP |
| 20 | Dreadnought Flagship | 47 | 1 | 8 | Storm Missile Battery | 8/8 | 64 | 25,000 | 250 | marines, no shield, FLAGSHIP |
| 21 | Attack Frigate Flagship | 4 | 8 | 8 | Dual Light Cannons | 2/3 | 6 | 2,500 | 25 | shield, FLAGSHIP |
| 22 | Light Cruiser Flagship | 6 | 6 | 8 | Medium Cannon Battery | 3/5 | 15 | 5,000 | 50 | shield, FLAGSHIP |

Rules encoded in the table:

- **Flagship variants cost 2.5× the non-flagship variant** and only one flagship can
  be owned at a time (player and enemy fleets alike). The Flagship Battlecruiser is
  the flagship variant of the Battlecruiser (2.5 × 3,500 = 8,750).
- **Dreadnought costs 2× the Battleship** (2 × 5,000 = 10,000); the Dreadnought
  Flagship is its 2.5× flagship variant.
- Flagship variants have the base hull's stats except **scan 8**.
- **Crew needed = cost ÷ 100** (fractional results round up).

### 3.2 Weapon variants (15)

Slot size = **damage × range**, multiplied by **1.5 for railguns**, rounded to the
nearest integer.

| Weapon | Class | Dmg | Range | Slots | Default hull(s) |
|--------|-------|-----|-------|-------|-----------------|
| Light Cannon | cannon | 1 | 1 | 1 | Shuttle |
| Dual Light Assault Cannon | cannon | 2 | 2 | 4 | Fighter |
| Dual Light Cannons | cannon | 2 | 3 | 6 | Attack Frigate (+ flagship) |
| Medium Cannon Battery | cannon | 3 | 5 | 15 | Light Cruiser (+ flagship) |
| Medium Assault Cannon Battery | cannon | 4 | 4 | 16 | Attack Destroyer |
| Heavy Cannon Battery | cannon | 7 | 6 | 42 | Battlecruiser, Flagship Battlecruiser |
| Light Railgun | railgun | 3 | 3 | 14 | Railgun Destroyer |
| Heavy Railgun | railgun | 5 | 3 | 23 | Heavy Cruiser |
| Capital Railgun | railgun | 7 | 4 | 42 | Railgun Cruiser |
| Ultra Railgun | railgun | 9 | 6 | 81 | Battleship |
| Unguided Torpedo | missile | 7 | 1 | 7 | Bomber |
| Light Missile Battery | missile | 1 | 8 | 8 | Missile Frigate |
| Medium Missile Battery | missile | 2 | 8 | 16 | Missile Destroyer, Missile Cruiser |
| Heavy Missile Battery | missile | 4 | 8 | 32 | Missile Battleship |
| Storm Missile Battery | missile | 8 | 8 | 64 | Dreadnought (+ flagship) |

Weapon names are shared between hulls only when damage, range and rail/non-rail
property are identical.

### 3.3 Weapon slots and outfitting

- Weapons can be **swapped between hulls** (at stations, §4.6).
- Each hull has a **slot capacity equal to the size of its default loadout**
  (the Slots column in §3.1).
- A loadout is valid when the sum of its weapons' slot sizes is within the hull's
  capacity. **Multiple weapons** may replace the default weapon if they fit.
- Unarmed hulls (Probe, Boarding APC) have 0 slots.

---

## 4. Campaign

### 4.1 Map contents

- Star systems containing **empty space, planets, stations and other fleets**.
- **Real space** (inside systems) and **hyperspace** (between systems).
- **Hyperspace** works like Star Control 2: fleets appear only as small gravity
  wells, locations (systems) appear as large gravity wells, and it is rendered
  **red, in the Star Control 2 style**. **Nothing but gravity wells exists** in
  hyperspace.

### 4.2 Movement

- Movement outside battles is **turn-based**; every fleet and location is a single
  unit on the map. On the map a fleet can **only move** — it cannot fire or take
  other actions (interactions happen by entering locations, §4.4).
- A fleet moves at the speed of its **slowest ship**.
- **Fuel:** a map move consumes fuel **proportional to the number of ships** in the
  fleet; fuel costs **5 ⒸB per unit**; **hyperspace moves cost 3×** the fuel of a
  real-space move.
- A fleet **cannot move** if its flagship is under 50% crew, or if it lacks the
  fuel for the move. When either blocks movement, a **merchant fleet** appears:
  the player can sell anything to it **at a discounted rate** and buy crew and
  fuel from it **at an inflated rate**.

### 4.3 Visibility

- A fleet is visible to others at a distance of **N squares, where N is the number
  of ships in the fleet** (every fleet has a flagship with maximum scan).
- A battle on the map is visible to factions **except** when it is inside a
  **nebula** map square — nebula squares hide battles from the world map. This
  does **not** disable summoning reserves in that battle.

### 4.4 Encounters and battles on the map

- **Locations** (stations, planets) and **fleets** are arriveable destinations:
  moving into one opens it. Moving into another fleet (or into a battle with
  multiple fleets) **enters the battle on the next turn**.
- When one fleet moves into another's area, the fleets **hail each other** and an
  interaction opens (dialogue, faction voice — §4.7). When the interaction ends,
  whether or not it led to a battle, the moving fleet is placed at random on one
  of the nearest open squares.

### 4.5 Economy

- Currency: **ⒸB**. The economy runs at **100× the scale of the old battle
  prototype** — ship costs, starting money and AI income are all 100× higher.
  (All prices in this document are already on that scale.)
- **Commodities with fluctuating prices:** trade **goods**, **fuel**, **crew** and
  **parts**.
- **Crew:**
  - A ship needs crew equal to its **cost ÷ 100** to be usable.
  - Crew casualties: when a ship loses HP, a percentage of its crew equal to
    **half the percentage of HP lost** is killed. A fully crewed ship therefore
    cannot be crew-incapacitated in one battle (that would require 100% damage);
    an undercrewed one can.
  - A ship under **50% crew cannot act in battle or be deployed** to a battle
    ("crew incapacitated" in battle, "insufficient crew" out of battle).
  - Crew are paid **5 ⒸB each per in-game month**.
- **Parts** are consumed when **repairing or refitting** ships.
- **No credits or income exist inside battles.** Summoning a reserve ship costs
  only 1 AP.

### 4.6 Stations

Stations work as in Starsector. At a station the player can:

- **buy and sell hulls** (ship types of §3.1),
- **buy and sell goods** (trade cargo),
- **buy and sell weapons**,
- **outfit ships** — swap weapons within the slot capacities of §3.3,
- **buy fuel**, **hire crew**, **buy parts**, and repair/refit (consuming parts).

### 4.7 Factions

Five factions. Each has a visual theme, a dialogue voice, and a fleet doctrine that
combines the shared ship/weapon pool (there are no faction-specific ship types).

1. **Syndicate** — pirates. Default alignment **−20**. Scrappy, rusty dark hulls
   with **red stripes**; rude and occasionally psychotic dialogue.
   Doctrine: **aggressive rush**.
   Flagships: Attack Frigate Flagship (common), Flagship Battlecruiser (rare).
   Common: Fighter, Bomber, Attack Destroyer.
   Uncommon: Missile Destroyer, Light Cruiser. Rare: anything else.
2. **Capital** — law enforcement (Hegemony-like authority, Tritachyon-like visuals).
   Clean, shiny **silver**; superior, polished dialogue. **Optimal AI tactics.**
   Flagships: all types. Uses all ships but **heavily emphasizes railgun ships**,
   rarely uses fighters or bombers, and heavily uses every cruiser type.
3. **Freehold** — Persean-League-like. Light **bronze** with **yellow stripes**;
   professional, egalitarian dialogue. **Heavily favors missile ships** and
   underutilizes probes.
4. **Armoury** — Tritachyon-like capitalism in **brutalist heavy-industry** style;
   extremely arrogant dialogue. **Favors capital ships and probes**; frequently
   deploys Battleships and Dreadnoughts; rarely fields a flagship other than the
   Dreadnought Flagship. Tactics: advance the whole fleet and shoot, compensating
   with massive numbers of capital ships and probes (vision and firepower).
   A small faction, relatively uncommon. **Sells the best weapons.**
5. **Fringe** — amicable but poor (pirate-like economics). Mostly destroyers,
   frigates and fighters; **almost never deploys capital ships**. Basic **grey**
   with **purple** hull stripes.

### 4.8 Reputation

- Reputation is a **200-point scale of −100 to 200**, banded into five quintiles:
  **enemy, unfriendly, neutral, friendly, allied**.
- Band membership drives relations: allied factions share sensor data out of
  battle; friendly and allied share vision in battle; enemies fight on sight.

### 4.9 Missions and bounties

The campaign offers **bounty missions and campaign missions**. (Structure, pay and
offer location are still open — see Open Questions.)

### 4.10 Campaign end

- If the player's flagship is destroyed, the campaign is over (permadeath).
- Winning a battle scraps all surviving enemy ships for resources.

---

## 5. Technical Architecture

The structural compliance standard is `docs/ARCHITECTURE_COMPLIANCE.md` (one job
per file, no library files, complex data-object builders decomposed into
per-domain pure children); the rationale lives in `docs/GUIDING_PRINCIPLES.md`.
In summary:

- `index.html` → `main.js` is the **wiring root only**: it creates the cores and
  the interfaces and connects them, and knows nothing else.
- **`core/game.js` (Game) owns all authoritative state**, rules and turn flow.
  Every state mutation goes through Game's action executors
  (`executeMove`, `executeShoot`, `executeCapture`, `executeShield`,
  `executeWarpIn`, `executeRetreat`, …), which call their **stateless pure
  children** (rules, sector generation, AI, data) and apply the results to state
  in a simple procedural pattern.
- Children are **stateless and pure**, register privately with their direct parent
  at load time, and expose pure functions only. Data files are frozen at receipt.
- Every core-to-core relationship gets a **dedicated, one-way interface carrying
  plain data only**:
  `Inputs → InputInterface → Game → GraphicsInterface → Graphics`,
  and `Game → AudioInterface → Audio`.
- **Rendering:** Game builds a frame as plain data (positions, HUD model, cursor
  style, damage-number cells) and Graphics draws exactly what it is given.
  Presentation decisions are made by Game and delivered as data.
- No globals, no sibling calls, no state outside the cores.

---

## 6. Open Questions

1. **Battle ↔ map clock.** Does the campaign map advance while a battle is being
   fought (fuel burned, crew wages, NPC fleets moving)? When a fleet enters a
   battle already in progress, where does it enter the grid (map-relative side,
   nearest edge, corner)?
2. **Multi-weapon fire.** A ship attacks once per turn but may mount several
   weapons: which weapon fires on that attack (player picks per shot?), and what
   do the red numbers show when the selected ship's weapons differ in damage?
3. **Missions.** Structure (offered at stations? procedural? fixed contracts?),
   what they pay, and whether the campaign is an open sandbox or has an end state.
4. **Reputation.** The stated −100..200 range spans 300 points — confirm the band
   boundaries — and which actions move reputation (kills, missions, trade?).
5. **Battle payouts and carry-over.** Scrapped enemy ships → what resources
   (parts? credits at what fraction of hull value?)? Do boarding-captured ships
   carry into the fleet after the battle? What does the campaign start with?
   Confirm: player flagship destroyed = campaign over even with other ships alive.
6. **World life.** Do NPC fleets move, trade and fight autonomously? How do fleets
   enter and exit hyperspace (jump points?), and what do gravity wells do
   mechanically beyond being destinations?
7. **Deployment selection.** When a fleet overflows its corner spawn region, who
   chooses which ships deploy and which stay in reserve?
8. **Crew details.** Is the wage 5 ⒸB per crew member per month, and confirm
   rounding (e.g. Flagship Battlecruiser needs 87.5 → 88 crew)?
9. **Flagship Battlecruiser price.** The 2.5× rule gives 8,750 ⒸB (the prototype
   had 9,500). Confirm the rule wins.
10. **Fleet interactions.** Beyond hailing and battle, what can a fleet-to-fleet
    interaction do (trade, bribe, demand surrender, recruit)?
