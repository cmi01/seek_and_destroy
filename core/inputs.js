"use strict";

// ============================================================
// INPUT PROCESS — Strictly 1-Way Hardware Event Producer (V66).
// Listens to DOM/window events (pointer, wheel, keyboard, blur, resize),
// normalizes pointer coordinates to canvas-relative [0..1] (u, v), and
// pushes plain InputEventDTOs into InputInterface.
// Holds ZERO references to Game state, UI layout, or tactical rules.
// ============================================================
const Inputs = (() => {
  let _inputProducer = null;
  let _getCanvas = null;
  let _abortController = null;

  function bindInterface(inputProducer, getBattleCanvas) {
    _inputProducer = inputProducer || null;
    if (typeof getBattleCanvas === "function") {
      _getCanvas = getBattleCanvas;
    }
  }

  function _push(evt) {
    if (_inputProducer && typeof _inputProducer.pushEvent === "function") {
      _inputProducer.pushEvent(evt);
    }
  }

  function bindAll() {
    if (_abortController) {
      _abortController.abort();
    }
    _abortController = new AbortController();
    const signal = _abortController.signal;

    const canvas = (typeof _getCanvas === "function")
      ? _getCanvas()
      : (typeof document !== "undefined" ? document.getElementById("battle-canvas") : null);
    if (!canvas) return;

    function getNormCoords(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        u: (e.clientX - rect.left) / Math.max(1, rect.width),
        v: (e.clientY - rect.top) / Math.max(1, rect.height)
      };
    }

    canvas.addEventListener("mousemove", e => {
      const { u, v } = getNormCoords(e);
      _push({ type: "POINTER_MOVE", u, v, inside: true });
    }, { signal });

    canvas.addEventListener("mouseleave", () => {
      _push({ type: "POINTER_LEAVE", inside: false });
    }, { signal });

    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= 100;
      if (dy === 0) return;
      const { u, v } = getNormCoords(e);
      _push({ type: "WHEEL", u, v, deltaY: dy });
    }, { passive: false, signal });

    canvas.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      const { u, v } = getNormCoords(e);
      _push({ type: "POINTER_DOWN", u, v, button: 0, shiftKey: Boolean(e.shiftKey) });
    }, { signal });

    canvas.addEventListener("contextmenu", e => {
      e.preventDefault();
      const { u, v } = getNormCoords(e);
      _push({ type: "CONTEXT_MENU", u, v });
    }, { signal });

    window.addEventListener("mouseup", e => {
      if (e.button !== 0) return;
      const { u, v } = getNormCoords(e);
      _push({ type: "POINTER_UP", u, v, button: 0 });
    }, { signal });

    window.addEventListener("keydown", e => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (
        e.code === "KeyW" ||
        e.code === "KeyA" ||
        e.code === "KeyS" ||
        e.code === "KeyD" ||
        e.code === "Space"
      ) {
        e.preventDefault();
      }
      _push({
        type: "KEY_DOWN",
        key: String(e.key || ""),
        code: String(e.code || ""),
        repeat: Boolean(e.repeat)
      });
    }, { signal });

    window.addEventListener("keyup", e => {
      _push({
        type: "KEY_UP",
        key: String(e.key || ""),
        code: String(e.code || "")
      });
    }, { signal });

    window.addEventListener("blur", () => {
      _push({ type: "BLUR" });
    }, { signal });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        _push({ type: "BLUR" });
      }
    }, { signal });

    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        _push({ type: "RESIZE" });
      }, 100);
    };
    window.addEventListener("resize", onResize, { signal });
  }

  return Object.freeze({
    bindInterface,
    bind: bindAll
  });
})();
