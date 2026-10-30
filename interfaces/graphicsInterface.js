"use strict";

// ============================================================
// GRAPHICS INTERFACE — Strictly 1-Way Data Broker (Game ---> Graphics)
// Initialized and wired by main.js.
// Game only sees `producer.publishStaticConfig(cfg)` & `producer.publishFrame(frameDTO)`.
// Graphics only sees `consumer.getStaticConfig()` & `consumer.readFrame()`.
// ============================================================
const GraphicsInterface = (() => {
  function create() {
    let _staticConfig = null;
    let _latestFrame = null;

    const producer = Object.freeze({
      publishStaticConfig(cfg) {
        _staticConfig = cfg || null;
      },
      publishFrame(frameDTO) {
        _latestFrame = frameDTO || null;
      }
    });

    const consumer = Object.freeze({
      getStaticConfig() {
        return _staticConfig;
      },
      readFrame() {
        return _latestFrame;
      }
    });

    return Object.freeze({ producer, consumer });
  }

  return Object.freeze({ create });
})();
