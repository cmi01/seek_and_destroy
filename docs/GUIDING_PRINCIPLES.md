# Seek & Destroy — Guiding Principles

## 1. Strict Encapsulation

The governing idea: **every file knows as little as possible, and only about the things it directly owns or directly talks to.**

1. **A file may be known only by its direct parent.** No file is referenced by any other file except the one that owns it. The sole exception is the relationship between a core system and its interfaces: a core may know the interfaces it connects through, and an interface may know the two cores it sits between. No core knows an interface that isn't directly between it and another core.
2. **Cores never know each other.** Each core system knows only the interface it talks to and the shape of the data it expects from it.
3. **Every relationship between two cores gets its own dedicated interface.** `main.js` creates the cores and the interfaces and wires them together. It knows nothing else.
4. **Composition is by call.** A file's children are the pure functions it
   calls; it references each only for its one function. Nothing travels
   between files except arguments and plain-data returns.
5. **A child never references its parent** — not its name, not a registration
   channel. The child file is just its function; it exposes no globals and
   contains no registration code.
6. **Loading is `main.js`'s act.** `main.js` loads every file once and wires
   the call graph. Each file exposes exactly one default export and imports
   only its own children — `import` is the only reference edge. (The
   parent-scoped loaders and the `X._register` handshake are retired under
   this requirement.)
7. **The folder tree is the ownership tree.** Root holds `index.html`,
   `main.js`, `main.js children`, `assets` and `dev`; every file lives in its
   parent's `<filename>.js children` folder, which sits next to the file at
   every depth (structure standard §5).

## 2. Core Systems and Interfaces

The game runs as four system domains, connected only through plain-data
boundaries. Every system's files are pure functions; the imperative shell —
the state container and the hardware (canvas context, audio context, input
listeners, timers, storage) — lives in `main.js`, which applies the data the
systems compute.

| System | Responsibility |
|---|---|
| **Inputs** | Translate raw hardware events into plain input events. Nothing else. `main.js` owns the listeners. |
| **Game** | Compute all rules and turn flow as pure transforms of state. Decide what every input means. `main.js` owns the state container and applies returned state. |
| **Graphics** | Compute frames and draw lists as plain data. `main.js` draws exactly what it is given. |
| **Audio** | Compute audio command lists as plain data. `main.js` plays whatever commands it is given. |

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

Files compose into a call tree under `main.js`; a file's children are the pure
functions it calls.

- Every file except `main.js` is **exactly one pure function** (plus its private helpers):
  data in, data out.
- A child holds **no state** and **never modifies state**. "State" means any
  value held between calls — module variables, computed constants, caches,
  memoized tables — mutable or not.
- **Everything arrives as arguments and leaves as data** — randomness and time
  included (seeded RNG values and timestamps are passed in by `main.js`);
  functions capture nothing and memoize nothing.
- **A child exposes one pure function, never state.** Nothing a child offers
  to its parent is a variable, a mutable object, or a handle to something that
  changes. The parent calls that one function and gets plain data back.
- A child knows **nothing about its parent, siblings or cousins**, only its own direct children.
- Siblings never call each other. The parent orchestrates them as a pipeline, passing one child's output to the next as plain data.
- **State lives only in `main.js`.** The state container, caches, audio nodes,
  timers and hardware belong to the shell; the pure functions compute values
  and return them. No other file holds, mutates, or aliases state.
- **The state container is `main.js`'s instrument.** Logic receives state as an
  argument and returns plain data (new state, events); it never returns live
  references to the state object.
- The AI is a pure child of Game. It receives a snapshot of only what the AI is allowed to see and returns a decision. It never reaches into live state.
- Declarative data (rules, campaign, themes, AI priorities, audio definitions, initial state) lives in dedicated data files. Each data file has exactly one owner and references nothing.
- Assets are split by ownership. Graphics owns its asset pack and Audio owns its own.
- Tests are split by ownership and each is one pure function
  (`state → results`). **The state-mutating test bridge is retired** — results
  are plain data and `main.js`'s test entry runs them.

## 4. Narrow Surfaces

A wide API is a sign of a design flaw. Each boundary exposes the smallest possible surface.

- The audio core exposes one capability: play a named sound.
- The AI exposes one function: given the state visible to it and its priorities, return an action and, for spawns, a coordinate.
- Graphics receives one thing: the frame to draw.
- State access is gated: initialize, read, and attempt a patch that is allowed to fail if the change is invalid.
- A file with more than one exposed function is non-compliant: give each
  behavior its own child, or collapse the domain to one entry function
  selected by its arguments.

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
