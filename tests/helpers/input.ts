// input.ts — synthesize the game's input events at normalized canvas
// coordinates (audit §3 input surface: POINTER_MOVE/DOWN/UP, WHEEL, KEY_DOWN/UP).
// Contract: pure dispatch helpers — (page, u, v, …) → void; u,v ∈ [0,1] are
// fractions of the canvas box, so specs are resolution-independent (test-architecture doc §2).
//
// TODO(06-hud-buttons.spec.ts): implement dispatchPointer(page, type, u, v) —
//      resolve u,v against the canvas bounding box, emit the PointerEvent the
//      game's inputs.js listens for (verify exact event names/fields against
//      inputs.js before coding — do not guess).
// TODO(09-camera-zoom.spec.ts): dispatchWheel(page, u, v, deltaY).
// TODO(03-movement.spec.ts): dispatchKey(page, type, key) for KEY_DOWN/UP.
