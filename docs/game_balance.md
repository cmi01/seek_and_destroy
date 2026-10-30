# Game Balance — Seek & Destroy (v70)

*Source: `data/rules_DATA.js`, `data/campaign_DATA.js`.*

## Core constants

32×32 grid; **4 AP per turn** (`maxAp`); warp-in / spawn radius **R:6**; zoom ladder 5→32. The map uses asteroid clusters (block line of sight, flanking cover) and Purple Fog nebulae (reduce effective scan to 1 and cloak occupants at range ≤ 1).

## Difficulty profiles

| Profile | AP | Mistake % | Look-ahead | Focus fire |
|---|---:|---:|---:|:--:|
| EASY | 3 | 30% | 1 | no |
| NORMAL | 4 | 12% | 2 | yes |
| HARD | 4 | 4% | 2 | yes |
| ACE | 5 | 0% | 3 | yes |

Lower `seqCost` (EASY 60 → ACE 10) lets harder AIs chain longer action sequences; `beliefDecay` rises so tougher AIs remember spotted enemies longer.

## Ship roster (19 specs)

Cost scales with capability, from 5-credit screens (Shuttle, Fighter, Probe) to the 95-credit **Flagship Battlecruiser**. Each spec sets hp, move, firepower, range, scan, weapon type (`pdc` / `missile` / `railgun` / `none`) and ability flags. Rough tiers: Shuttle/Fighter/Probe (5) → Bomber/Boarding APC/Attack Frigate (10) → Missile Frigate/Destroyers/Light Cruiser (15–20) → Cruisers (20–25) → Battlecruiser (35) → Battleships (45–50).

Key ability flags:

- **`!flagship`** — losing all your flagships is an instant loss; immune to boarding capture.
- **`#capital ship`** — select and press `[Space]` to warp in reinforcements within R:6.
- **`#railgun`** — bypasses shield bubbles, dealing full firepower to hull.
- **`#space marines`** — can board and capture an adjacent (d ≤ 1) spotted non-flagship enemy.
- **`#shield generator` / `+shield`** — spend 1 AP to raise an octagon shield; reduces a non-railgun hit to 1 HP then collapses, and drops when firing.
- Status flags `-moved`, `-attacked`, `-shielded`, `-sent boarding party` track what a ship has spent this turn.

## Campaign escalation (4 sectors)

Difficulty ramps through the enemy Syndicate's economy and doctrine rather than player nerfs:

| Sector | Doctrine | Enemy credits | Enemy income | Comp. budget |
|---|---|---:|---:|---:|
| 101 Tutorial | DEFENSIVE_HOLD | 0 | 0 | 0 |
| 01 Wolfpack | AGGRESSIVE_SWARM | 65 | 4 | 75 |
| 02 Crossfire | ARTILLERY_SCREEN | 140 | 6 | 95 |
| 03 Citadel | APEX_ARMADA | 260 | 8 | 130 |

Later sectors also add more asteroid/nebula patches and tougher fixed spawn lists (up to three enemy Flagships plus railgun dreadnoughts in the finale). The player's economy grows only modestly (starting credits 35→60, income 5), so the challenge comes from the widening enemy force budget and smarter doctrine.
