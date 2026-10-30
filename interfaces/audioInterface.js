"use strict";

// ============================================================
// AUDIO INTERFACE — Strictly 1-Way Data Broker (Game ---> Audio)
// Initialized and wired by main.js.
// Game only sees `producer.pushCommand(cmdDTO)`.
// Audio only sees `consumer.drainCommands()`.
// ============================================================
const AudioInterface = (() => {
  function clonePayload(p) {
    if (!p || typeof p !== "object") return {};
    const out = {};
    const keys = Object.keys(p);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = p[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = { ...v };
      } else if (Array.isArray(v)) {
        out[k] = v.slice();
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function sanitizeCommand(cmd) {
    if (!cmd || typeof cmd !== "object") return null;
    const type = String(cmd.type || "");
    if (!type) return null;
    const vp = cmd.viewport && typeof cmd.viewport === "object"
      ? {
          viewX: Number(cmd.viewport.viewX) || 0,
          viewY: Number(cmd.viewport.viewY) || 0,
          viewSpan: Number(cmd.viewport.viewSpan) || 32
        }
      : { viewX: 0, viewY: 0, viewSpan: 32 };
    return {
      type,
      kind: typeof cmd.kind === "string" ? cmd.kind : "",
      payload: clonePayload(cmd.payload),
      viewport: vp,
      gameOver: Boolean(cmd.gameOver),
      muted: Boolean(cmd.muted),
      theme: typeof cmd.theme === "string" ? cmd.theme : "default"
    };
  }

  function create() {
    const _queue = [];

    const producer = Object.freeze({
      pushCommand(cmd) {
        const clean = sanitizeCommand(cmd);
        if (clean) _queue.push(clean);
      }
    });

    const consumer = Object.freeze({
      drainCommands() {
        if (_queue.length === 0) return [];
        return _queue.splice(0, _queue.length);
      },
      hasPending() {
        return _queue.length > 0;
      }
    });

    return Object.freeze({ producer, consumer });
  }

  return Object.freeze({ create });
})();
