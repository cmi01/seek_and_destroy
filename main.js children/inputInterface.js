"use strict";

// ============================================================
// inputInterface.js — job: carry plain input events from Inputs to Game.
// Owner: main.js. Holds no state unless it is a core.
// ============================================================
const InputInterface = (() => {
  function sanitizeEvent(evt) {
    if (!evt || typeof evt !== "object") return null;
    const type = String(evt.type || "");
    if (!type) return null;
    return {
      type,
      u: typeof evt.u === "number" ? evt.u : 0,
      v: typeof evt.v === "number" ? evt.v : 0,
      inside: Boolean(evt.inside),
      button: typeof evt.button === "number" ? evt.button : 0,
      shiftKey: Boolean(evt.shiftKey),
      deltaY: typeof evt.deltaY === "number" ? evt.deltaY : 0,
      key: typeof evt.key === "string" ? evt.key : "",
      code: typeof evt.code === "string" ? evt.code : "",
      repeat: Boolean(evt.repeat)
    };
  }

  function create(opts = {}) {
    const _queue = [];
    let _onPush = (opts && typeof opts.onPush === "function") ? opts.onPush : null;

    const producer = Object.freeze({
      pushEvent(evt) {
        const clean = sanitizeEvent(evt);
        if (!clean) return;
        _queue.push(clean);
        if (typeof _onPush === "function") {
          _onPush();
        }
      }
    });

    const consumer = Object.freeze({
      drainEvents() {
        if (_queue.length === 0) return [];
        return _queue.splice(0, _queue.length);
      },
      hasPending() {
        return _queue.length > 0;
      }
    });

    function setOnPush(fn) {
      _onPush = typeof fn === "function" ? fn : null;
    }

    return Object.freeze({ producer, consumer, setOnPush });
  }

  return Object.freeze({ create });
})();
