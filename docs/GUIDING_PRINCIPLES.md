# Seek & Destroy — Guiding Principles

## 1. Strict Encapsulation

The governing idea: **every file knows as little as possible, and only about the things it directly owns or directly talks to.**

1. **A file may be known only by its direct parent.** No file is referenced by any other file except the one that owns it. The sole exception is the relationship between a core system and its interfaces: a core may know the interfaces it connects through, and an interface may know the two cores it sits between. No core knows an interface that isn't directly between it and another core.
2. **Cores never know each other.** Each core system knows only the interface it talks to and the shape of the data it expects from it.
3. **Every relationship between two cores gets its own dedicated interface.** `main.js` creates the cores and the interfaces and wires them together. It knows nothing else.
4. **Parents own their children completely.** A parent loads its own children, with its own small loader. There is no shared loader, and nothing is injected from above.
5. **Children register privately with their direct parent.** They expose no globals. Nothing outside the parent can reach them.
6. **Load registrars are transient.** While loading its children, a parent may expose a name-gated registration channel (e.g. `getAIAction._register`, a temporary `g.AILogic`, the `Graphics._registerLayer` load window). It is deleted after load and is never a runtime data channel.

## 2. Core Systems and Interfaces

The game runs as separate core systems, connected only through interfaces.

| Core | Responsibility |
|---|---|
| **Inputs** | Translate raw hardware events into plain input events. Nothing else. |
| **Game** | Owns all authoritative state, rules and turn flow. Decides what every input means. |
| **Graphics** | Owns the canvas and sprite caches. Draws whatever frame it is given. |
| **Audio** | Owns the audio context and active sound nodes. Plays whatever commands it is given. |

**Interfaces are purpose-built, one-way, and carry data only.**

```
Inputs ──▶ InputInterface ──▶ Game ──▶ GraphicsInterface ──▶ Graphics
                                  └──▶ AudioInterface ─────▶ Audio
```

- Interfaces transfer plain data objects: input events, render frames, audio commands. Never live state, never methods of another file.
- No procedural file ever sees another procedural file's state.
- Interfaces never run in both directions. If a core seems to need data back, the design is wrong. Give the data to the producer in the first place.
- **Inputs knows nothing about the game.** It does no hit-testing, no rule checks and no cursor logic. Game resolves what a click or keypress means.
- **Presentation decisions are made by Game and delivered as data.** For example, the cursor style is a field of the render frame, and Graphics simply applies it.
- **Hover and press states are part of game state**, not private to the UI.

## 3. Pure-Function Children

Core systems may have children, and those children may have children of their own.

- Every child is a **pure function library**: data in, data out.
- A child holds **no state** and **never modifies state**.
- **Children expose only pure functions, never state.** Nothing a child offers to its parent is a variable, a mutable object, or a handle to something that changes. The parent calls functions and gets plain data back.
- A child knows **nothing about its parent, siblings or cousins**, only its own direct children.
- Siblings never call each other. The parent orchestrates them as a pipeline, passing one child's output to the next as plain data.
- **State lives only in the owning core.** Caches, audio nodes, timers and the game state belong to the core, never to a child.
- **The state store is the owning core's instrument.** The store container lives in the core (e.g. `core/game.js`); the store child (`core/gameState.js`) operates only on the container its parent passes it and returns plain data. It never returns live references to the state object: return copies, or make access parent-only.
- The AI is a pure child of Game. It receives a snapshot of only what the AI is allowed to see and returns a decision. It never reaches into live state.
- Declarative data (rules, campaign, themes, AI priorities, audio definitions, initial state) lives in dedicated data files. Each data file has exactly one owner and references nothing.
- Assets are split by ownership. Graphics owns its asset pack and Audio owns its own.
- Tests are split by ownership and loaded on demand by the core they test.
- **The test bridge is a sanctioned exception.** Tests loaded on demand by the core they test receive a parent-supplied bridge and may mutate state through it. It is the one exception to "a child never modifies state."

## 4. Narrow Surfaces

A wide API is a sign of a design flaw. Each boundary exposes the smallest possible surface.

- The audio core exposes one capability: play a named sound.
- The AI exposes one function: given the state visible to it and its priorities, return an action and, for spawns, a coordinate.
- Graphics receives one thing: the frame to draw.
- State access is gated: initialize, read, and attempt a patch that is allowed to fail if the change is invalid.
- If a caller needs many different functions from one file, question the architecture before accepting the surface.

## 5. Simplicity

- No circular dependencies, ever.
- Prefer the simplest implementation that does the job. A component that merely plays sounds should not be complicated.
- Don't retain code that is no longer needed at runtime. Sprites and sounds are baked into assets rather than generated by retained code.
- Complexity gets distributed into children rather than concentrated in one file.
- Size and complexity are measured, and the biggest and most complex files are the first candidates for splitting.

## 6. One Input System, One UI System

- All UI lives inside the canvas. No HTML elements outside it, and no separate stylesheet.
- Buttons and menus are drawn by the graphics core from game state.
- The page is a thin shell: a canvas and a script entry point.
- Clicks on HUD panels and overlays never pass through to the board beneath.

## 7. Data-Driven Design

- Game content is data, not code: sprites, sounds, AI priorities, rules, campaign, and starting state.
- Themes swap data sets, not code. Each theme provides its own sprites and sounds, and the player picks one from the game UI.
- Balance values, such as ship costs and scan ranges, live in one place, and every piece of UI that displays them reads from that place. A stale number on screen is a bug.
- AI behavior is tuned through a priorities table passed in as an argument, not hard-coded in the logic.

## 8. Information and Fairness

- Fog of war is real. The AI sees only what it is allowed to see.
- Enemy actions taken out of the player's sight still give the player a cue, such as an "unknown enemy action" sound.
- The player always gets accurate feedback: visuals must keep rendering while the game progresses, and sizes and scales on screen must be correct.

## 9. Working Method

- **Every change is a new version.** Copy the current version, then edit the copy. Earlier versions are never modified. Version numbers are plain integers.
- **Respect edit boundaries.** When a task names the files that may be edited, no other files change.
- **Architecture before details.** Fix structural problems first, because many granular fixes disappear once the structure is right.
- **Plan before building.** Large changes get a holistic plan first. Phase the work into versions with a reasonable number of fixes each, then pause for testing between phases unless told to continue.
- **Document analysis.** Reviews go in the Design Documents folder. Issues are tracked in the issue tracker with version reported, version fixed, priority, ID, name, description and file references.
- **Measure compliance.** The reference graph and reference audit are used to check that the encapsulation rules actually hold.
- **Verify every version.** Run the self-tests, the audio tests and the reference audit before calling a version done.
