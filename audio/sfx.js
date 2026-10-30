"use strict";

// ============================================================
// SFX.JS — One-shot sound effects manifest, viewport-relative spatial panning,
// WebAudio clock scheduling, node cleanup & event routing.
// Privately registered with SoundEngine (sounds.js); exposes zero globals.
// ============================================================
SoundEngine._registerModule("sfx", AUDIO => {
  if (!AUDIO) console.error("[S&D audio] data/audio_DATA.js is not loaded; sound effects are disabled.");
  const SFX_CLIPS = AUDIO ? AUDIO.sfxClips : {};

  const DESTROY_TIER_BY_CATEGORY = AUDIO ? AUDIO.destroyTierByCategory : {};

  const WEAPON_CLIP_BY_TYPE = {
    railgun: "railgunShoot",
    missile: "missileShoot"
  };

  const DIRECT_EVENT_CLIPS = {
    "unit.select": "selectUnit",
    "ui.select": "selectUnit",
    "ui.buttonClick": "selectUnit",
    "enemy.unknownAction": "unknownEnemyAction",
    "ui.modal.open": "commandBridgeOpen",
    "ui.modal.close": "commandBridgeClose",
    "ui.invalid": "invalidAction",
    "ui.inspect": "inspectorToggle",
    "ui.zoom": "minimapZoom",
    "ui.enableAudio": "ui.enableAudio",
    "turn.playerEnd": "playerTurnEnd",
    "turn.aiEnd": "enemyTurnEnd"
  };

  const SCHEDULED_ACTION_CLIPS = {
    "unit.move": { clip: "moveAction", cellKey: "from" },
    "unit.move.collision": { clip: "blindCollision", cellKey: "to" },
    "unit.capture": { clip: "captureAction", cellKey: "to" },
    "unit.shieldUp": { clip: "shieldRegen", cellKey: "from" },
    "unit.warpIn": { clip: "warpIn", cellKey: "to" }
  };

  const TEAM_ACTION_CONFIG = {
    1: { clip: "playerAction", delaySec: 0.09 },
    2: { clip: "enemyAction", delaySec: 0.10 }
  };

  // Viewport-relative stereo pan + off-screen distance attenuation (ISS-055).
  function getSpatialParams(ctxObj, cell) {
    const gx = Number(cell ? cell.x : NaN);
    const gy = Number(cell ? cell.y : NaN);
    if (Number.isNaN(gx)) return { pan: 0, gain: 1 };
    const vp = (ctxObj && typeof ctxObj.getViewport === "function") ? ctxObj.getViewport() : null;
    const viewX = (vp && Number.isFinite(vp.viewX)) ? vp.viewX : 0;
    const viewY = (vp && Number.isFinite(vp.viewY)) ? vp.viewY : 0;
    const viewSpan = (vp && Number.isFinite(vp.viewSpan) && vp.viewSpan > 0) ? vp.viewSpan : 32;
    const halfSpan = Math.max(2.5, viewSpan * 0.5);
    const cx = viewX + viewSpan * 0.5;
    const cy = viewY + viewSpan * 0.5;
    const normX = (gx + 0.5 - cx) / halfSpan;
    const normY = Number.isNaN(gy) ? 0 : ((gy + 0.5 - cy) / halfSpan);
    const pan = Math.max(-0.65, Math.min(0.65, normX * 0.5));
    const normDist = Math.hypot(normX, normY);
    const gain = normDist <= 1.0
      ? 1.0
      : Math.max(0.35, 1.0 - (normDist - 1.0) * 0.32);
    return { pan, gain };
  }

  function isHiddenEnemy(p) {
    return Boolean(p && p.team === 2 && !p.isVisible);
  }

  function resolveClipName(soundName) {
    if (DIRECT_EVENT_CLIPS[soundName]) return DIRECT_EVENT_CLIPS[soundName];
    if (soundName.startsWith("play") && soundName.endsWith("Sound")) {
      const core = soundName.slice(4, -5);
      return core.charAt(0).toLowerCase() + core.slice(1);
    }
    return soundName;
  }

  function playOneShot(ctxObj, clipKey, cell, isPassiveHover, delaySec = 0, ignoreGameOver = false) {
    if (!ctxObj) return false;
    if (!ignoreGameOver && typeof ctxObj.isGameOver === "function" && ctxObj.isGameOver()) {
      // Allow killing-blow combat clips scheduled during the endgame frame.
    }
    const allClips = ctxObj.allClips || SFX_CLIPS;
    const clip = allClips[clipKey] || SFX_CLIPS[clipKey];
    if (!clip || !ctxObj.ensureReady(isPassiveHover)) return false;

    const audioCtx = ctxObj.getAudioCtx();
    const buses = ctxObj.getBuses();
    if (!audioCtx || !buses) return false;

    const bus = buses[clip.bus];
    if (!bus) return false;

    const waitSec = Math.max(0, Number(delaySec) || 0);
    const startTime = audioCtx.currentTime + waitSec;

    // Enforce per-bus polyphony cap (ISS-056).
    if (typeof ctxObj.acquireVoice === "function") {
      if (!ctxObj.acquireVoice(clip.bus, startTime, clip.duration)) return false;
    }

    if (clip.radioMs) {
      ctxObj.bumpRadioUntil(performance.now() + waitSec * 1000 + Math.max(140, clip.radioMs));
    }

    const src = audioCtx.createBufferSource();
    src.buffer = ctxObj.getThemeBuffer();

    let panVal = 0;
    let distGainVal = 1;
    if (clip.spatial) {
      const sp = getSpatialParams(ctxObj, cell);
      panVal = sp.pan;
      distGainVal = sp.gain;
    } else if (Number.isFinite(Number(clip.pan))) {
      panVal = Number(clip.pan);
    }

    let lastNode = src;
    let distGainNode = null;
    let pannerNode = null;

    if (distGainVal < 0.999) {
      distGainNode = audioCtx.createGain();
      distGainNode.gain.setValueAtTime(distGainVal, startTime);
      lastNode.connect(distGainNode);
      lastNode = distGainNode;
    }

    if (Math.abs(panVal) > 1e-4 && typeof audioCtx.createStereoPanner === "function") {
      pannerNode = audioCtx.createStereoPanner();
      pannerNode.pan.setValueAtTime(panVal, startTime);
      lastNode.connect(pannerNode);
      lastNode = pannerNode;
    }

    lastNode.connect(bus);

    // Disconnect one-shot nodes when playback finishes so the bus graph never leaks (ISS-033).
    src.onended = () => {
      try { src.disconnect(); } catch (_) { /* ignore */ }
      if (distGainNode) {
        try { distGainNode.disconnect(); } catch (_) { /* ignore */ }
      }
      if (pannerNode) {
        try { pannerNode.disconnect(); } catch (_) { /* ignore */ }
      }
    };

    src.start(startTime, clip.offset, clip.duration);
    return true;
  }

  function scheduleTeamAction(ctxObj, p, clipKey, cell) {
    if (isHiddenEnemy(p)) return playOneShot(ctxObj, "unknownEnemyAction", null, false, 0, true);
    const cfg = TEAM_ACTION_CONFIG[p && p.team] || TEAM_ACTION_CONFIG[1];
    playOneShot(ctxObj, cfg.clip, null, false, 0, true);
    return playOneShot(ctxObj, clipKey, cell, false, cfg.delaySec, true);
  }

  function handleHover(ctxObj, p) {
    if (!p || !p.from) return false;
    const hs = (ctxObj && ctxObj.hoverState) ? ctxObj.hoverState : { lastHoverKey: "", lastHoverTime: 0 };
    const now = performance.now();
    const hoverKey = `${p.from.x},${p.from.y}:${p.context || ""}`;
    if (hoverKey === hs.lastHoverKey || now - hs.lastHoverTime < 90) return false;
    hs.lastHoverKey = hoverKey;
    hs.lastHoverTime = now;
    if (p.context === "hostile") return playOneShot(ctxObj, "hoverHostile", p.from, true);
    if (p.context === "actionable" || p.context === "occupied") {
      return playOneShot(ctxObj, "hoverCell", p.from, true);
    }
    return false;
  }

  function handleDestroy(ctxObj, p) {
    if (isHiddenEnemy(p)) return false;
    const tier = DESTROY_TIER_BY_CATEGORY[p.category] || "capital";
    // Chronological order on WebAudio clock: fire (0.09s) -> impact (0.17s) -> destroy (0.24s) (ISS-031, ISS-066).
    const delaySec = (p && p.immediate) ? 0.08 : 0.24;
    playOneShot(ctxObj, "hullDestroy", p.to, false, delaySec, true);
    playOneShot(ctxObj, "combat.destroy." + tier, p.to, false, delaySec, true);
    return true;
  }

  function handleWeaponFire(ctxObj, p) {
    const clipKey = WEAPON_CLIP_BY_TYPE[p.wType] || "laserShoot";
    return scheduleTeamAction(ctxObj, p, clipKey, p.from);
  }

  function dispatchEvent(ctxObj, soundName, p) {
    if (soundName === "unit.hover") return handleHover(ctxObj, p);
    if (soundName === "unit.destroy") return handleDestroy(ctxObj, p);
    if (soundName === "weapon.fire") return handleWeaponFire(ctxObj, p);
    if (soundName === "unit.spotted") {
      if (isHiddenEnemy(p)) return false;
      const delaySec = Number.isFinite(Number(p.delaySec)) ? Number(p.delaySec) : 0.14;
      return playOneShot(ctxObj, "contactSpotted", p.from, false, delaySec);
    }
    if (soundName === "weapon.impact") {
      if (isHiddenEnemy(p)) return false;
      const mat = p.material || "hull";
      return playOneShot(ctxObj, "combat.impact." + mat, p.from, false, 0.17, true);
    }
    if (soundName === "weapon.shieldStrip") {
      if (isHiddenEnemy(p)) return false;
      const delaySec = (p && p.attackerStrip) ? 0.02 : 0.16;
      return playOneShot(ctxObj, "shieldDrop", p.to, false, delaySec, true);
    }
    if (soundName === "game.victory") {
      ctxObj.stopBackgroundLoops();
      return playOneShot(ctxObj, "victoryStinger", null, false, 0.32, true);
    }
    if (soundName === "game.defeat") {
      ctxObj.stopBackgroundLoops();
      return playOneShot(ctxObj, "defeatStinger", null, false, 0.32, true);
    }

    const scheduled = SCHEDULED_ACTION_CLIPS[soundName];
    if (scheduled) {
      return scheduleTeamAction(ctxObj, p, scheduled.clip, p[scheduled.cellKey]);
    }

    const clipKey = resolveClipName(soundName);
    const delaySec = (p && Number.isFinite(Number(p.delaySec))) ? Number(p.delaySec) : 0;
    return playOneShot(ctxObj, clipKey, p.from || p.to || p, false, delaySec, true);
  }

  // Every clip name the router above can request (used by the audio self-test
  // to prove each routed event resolves to a real clip).
  function getReferencedClips() {
    const names = new Set();
    Object.values(DIRECT_EVENT_CLIPS).forEach(n => names.add(n));
    Object.values(SCHEDULED_ACTION_CLIPS).forEach(s => names.add(s.clip));
    Object.values(WEAPON_CLIP_BY_TYPE).forEach(n => names.add(n));
    Object.values(TEAM_ACTION_CONFIG).forEach(t => names.add(t.clip));
    Object.values(DESTROY_TIER_BY_CATEGORY).concat(["capital"]).forEach(tier => names.add("combat.destroy." + tier));
    // Clip names hard-coded inside the handlers above.
    [
      "laserShoot", "unknownEnemyAction", "hoverHostile", "hoverCell", "hullDestroy",
      "contactSpotted", "combat.impact.shield", "combat.impact.hull", "shieldDrop",
      "victoryStinger", "defeatStinger"
    ].forEach(n => names.add(n));
    return Array.from(names);
  }

  return {
    getClips: () => SFX_CLIPS,
    getReferencedClips,
    playClip: (ctxObj, clipKey, cell, isPassiveHover, delaySec = 0, ignoreGameOver = false) =>
      playOneShot(ctxObj, clipKey, cell, isPassiveHover, delaySec, ignoreGameOver),
    dispatchEvent: (ctxObj, eventName, payload) => dispatchEvent(ctxObj, eventName, payload || {})
  };
});
