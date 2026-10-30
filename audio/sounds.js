"use strict";

// ============================================================
// SOUNDS.JS — WebAudio engine. Owns the AudioContext, bus graph, master
// DynamicsCompressorNode, per-bus polyphony cap, theme buffers and persisted
// mixer settings; delegates one-shot effects to SfxEngine (sfx.js) and
// looping beds to MusicEngine (music.js).
//
// Public API (SoundEngine):
//   bindHost(host)            — inject game services (timers, game-over, settings, enable-button, viewport)
//   play(eventName, payload)  — play a semantic sound event ("unit.move", "weapon.fire", ...)
//   unlock()                  — create/resume the AudioContext and unmute (needs a user gesture)
//   isReady()                 — true when AudioContext is running
//   stopLoops()               — stop looping ambience & music beds without cancelling one-shots
//   toggleMute() / setMaster(v) / setBusGain(name, v) / setReduced(bool)
//   setTheme(key) / getTheme()
//   clearAll()                — cancel tracked audio timers & stop loops
//   getAnalyser() / getRadioActiveUntil()
//   runSelfTests()            — validate clip manifest, event routing, loops, themes, buses
// ============================================================
const SoundEngine = (() => {
  const AUDIO_CHILDREN = [
    "data/audio_DATA.js",
    "audio/sfx.js",
    "audio/music.js",
    "assets/audio.pak"
  ];
  const BAKED_SAMPLE_RATE = 22000;
  const BAKED_BUFFER_SECONDS = 28;
  const STORAGE_KEY = "sd.audio.settings.v2";

  let _registrationOpen = true;
  let _loadPromise = null;
  let _audioData = null;
  let _sfxFactory = null;
  let _musicFactory = null;
  let _sfx = null;
  let _music = null;
  let _bakedSounds = null;

  // The audio manifest is deep-frozen at receipt so no consumer can mutate it.
  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.values(o).forEach(deepFreeze);
    }
    return o;
  }

  function _registerModule(name, mod) {
    if (!_registrationOpen) return;
    if (name === "audioData") _audioData = deepFreeze(mod);
    else if (name === "sfx") _sfxFactory = mod;
    else if (name === "music") _musicFactory = mod;
    else if (name === "assets") _bakedSounds = mod;
  }

  // Inline loader: this file loads ONLY its own direct children.
  function _loadScripts(list, optional) {
    return Promise.allSettled(list.map(src => new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false; // force in-order execution
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error("Failed to load script: " + src));
      document.head.appendChild(s);
    }))).then(results => {
      const failures = [];
      results.forEach(r => {
        if (r.status !== "rejected") return;
        if (optional) console.error("[S&D audio] Optional script failed to load; continuing without it:", r.reason.message);
        else failures.push(r.reason.message);
      });
      if (failures.length > 0) throw new Error(failures.join("\n"));
    });
  }

  const SOUND_THEMES = {
    default: "sounds_default.wav",
    retro: "sounds_retro.wav",
    alien: "sounds_alien.wav"
  };

  const DEFAULT_BUS_LEVELS = {
    UI: 0.40,
    TELEMETRY: 0.65,
    SYSTEMS: 0.80,
    COMBAT: 0.95
  };

  // Per-bus concurrent voice limits to prevent clipping & voice spam (ISS-056).
  const MAX_BUS_VOICES = {
    UI: 4,
    TELEMETRY: 4,
    SYSTEMS: 6,
    COMBAT: 8
  };

  // Internal timer list, viewport, and game-over state updated via AudioInterface commands.
  let _audioConsumer = null;
  const _audioTimers = [];
  let _lastViewport = { viewX: 0, viewY: 0, viewSpan: 32 };
  let _lastGameOver = false;

  let host = {
    getAudioTimers() { return _audioTimers; },
    clearAudioTimerList() { _audioTimers.forEach(clearTimeout); _audioTimers.length = 0; },
    isGameOver() { return _lastGameOver; },
    setAudioSettings() {},
    updateEnableButton() {},
    getViewport() { return _lastViewport; }
  };

  let audioCtx = null;
  let masterGain = null;
  let compressor = null;
  let analyser = null;
  const buses = {};
  const activeBusEndTimes = {};
  let currentTheme = "default";
  const themeBuffers = {};
  let radioActiveUntil = 0;

  const settings = {
    master: 0.75,
    buses: Object.assign({}, DEFAULT_BUS_LEVELS),
    muted: false,
    reduced: false
  };

  function hasSfx() { return Boolean(_sfx); }
  function hasMusic() { return Boolean(_music); }

  function getAllClips() {
    const sfxClips = hasSfx() ? _sfx.getClips() : {};
    const musicClips = hasMusic() ? _music.getClips() : {};
    return Object.assign({}, sfxClips, musicClips);
  }

  function clampUnit(v) {
    return Math.max(0, Math.min(1, Number(v)));
  }

  function acquireVoice(busName, startTime, duration) {
    const cap = MAX_BUS_VOICES[busName];
    if (!cap || !audioCtx) return true;
    const now = audioCtx.currentTime;
    const list = activeBusEndTimes[busName] || (activeBusEndTimes[busName] = []);
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] <= now) list.splice(i, 1);
    }
    if (list.length >= cap) return false;
    list.push(startTime + Math.max(0.02, Number(duration) || 0.1));
    return true;
  }

  function scheduleAt(ms, fn) {
    const timers = host.getAudioTimers();
    const id = setTimeout(() => {
      const list = host.getAudioTimers();
      const idx = list.indexOf(id);
      if (idx >= 0) list.splice(idx, 1);
      if (!host.isGameOver()) fn();
    }, ms);
    timers.push(id);
    return id;
  }

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed) {
        settings.master = clampUnit(parsed.master);
        Object.assign(settings.buses, DEFAULT_BUS_LEVELS, parsed.buses);
        settings.muted = Boolean(parsed.muted);
        settings.reduced = Boolean(parsed.reduced);
      }
    } catch (err) {
      // Non-fatal: storage may be unavailable (privacy mode / file://) or hold bad JSON.
      console.warn("[S&D audio] Could not read saved audio settings; using defaults.", err);
    }
    host.setAudioSettings(settings);
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      // Non-fatal: settings simply won't persist across sessions.
      console.warn("[S&D audio] Could not save audio settings.", err);
    }
    host.setAudioSettings(settings);
  }

  function applyGainSettings() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const targetMaster = settings.muted ? 0 : settings.master;
    masterGain.gain.setTargetAtTime(targetMaster, now, 0.04);
    Object.keys(buses).forEach(name => {
      buses[name].gain.setTargetAtTime(settings.buses[name], now, 0.04);
    });
  }

  // Scan RIFF chunks for the "data" chunk header instead of assuming a 44-byte offset (ISS-057).
  function findWavDataChunkFromString(raw) {
    let offset = 12;
    const limit = Math.min(raw.length - 8, 4096);
    while (offset <= limit) {
      const id = raw.slice(offset, offset + 4);
      const size = (
        (raw.charCodeAt(offset + 4) & 0xff) |
        ((raw.charCodeAt(offset + 5) & 0xff) << 8) |
        ((raw.charCodeAt(offset + 6) & 0xff) << 16) |
        ((raw.charCodeAt(offset + 7) & 0xff) << 24)
      ) >>> 0;
      if (id === "data") {
        return { dataOffset: offset + 8, byteLength: Math.min(size, raw.length - (offset + 8)) };
      }
      offset += 8 + size + (size & 1);
    }
    return { dataOffset: 44, byteLength: Math.max(0, raw.length - 44) };
  }

  function findWavDataChunkFromView(view) {
    let offset = 12;
    const limit = Math.min(view.byteLength - 8, 4096);
    while (offset <= limit) {
      const c0 = view.getUint8(offset);
      const c1 = view.getUint8(offset + 1);
      const c2 = view.getUint8(offset + 2);
      const c3 = view.getUint8(offset + 3);
      const size = view.getUint32(offset + 4, true);
      if (c0 === 0x64 && c1 === 0x61 && c2 === 0x74 && c3 === 0x61) {
        return { dataOffset: offset + 8, byteLength: Math.min(size, view.byteLength - (offset + 8)) };
      }
      offset += 8 + size + (size & 1);
    }
    return { dataOffset: 44, byteLength: Math.max(0, view.byteLength - 44) };
  }

  function decodeWavDataUrl(dataUrl) {
    const raw = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
    const { dataOffset, byteLength } = findWavDataChunkFromString(raw);
    const numSamples = Math.max(1, byteLength >> 1);
    const buf = audioCtx.createBuffer(1, numSamples, BAKED_SAMPLE_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < numSamples; i++) {
      const idx = dataOffset + (i << 1);
      const u16 = (raw.charCodeAt(idx + 1) << 8) | raw.charCodeAt(idx);
      ch[i] = ((u16 << 16) >> 16) / 32767;
    }
    return buf;
  }

  function decodeWavArrayBuffer(ab) {
    const view = new DataView(ab);
    const { dataOffset, byteLength } = findWavDataChunkFromView(view);
    const numSamples = Math.max(1, byteLength >> 1);
    const buf = audioCtx.createBuffer(1, numSamples, BAKED_SAMPLE_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < numSamples; i++) {
      ch[i] = view.getInt16(dataOffset + (i << 1), true) / 32767;
    }
    return buf;
  }

  function ensureThemeBuffer(themeKey) {
    if (themeBuffers[themeKey]) return themeBuffers[themeKey];

    if (_bakedSounds && _bakedSounds[themeKey]) {
      themeBuffers[themeKey] = decodeWavDataUrl(_bakedSounds[themeKey]);
      return themeBuffers[themeKey];
    }

    const silentPlaceholder = audioCtx.createBuffer(1, BAKED_SAMPLE_RATE * BAKED_BUFFER_SECONDS, BAKED_SAMPLE_RATE);
    themeBuffers[themeKey] = silentPlaceholder;
    fetch(SOUND_THEMES[themeKey])
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(ab => {
        themeBuffers[themeKey] = decodeWavArrayBuffer(ab);
        if (themeKey === currentTheme && !host.isGameOver()) {
          startBackgroundLoops();
        }
      })
      .catch(err => {
        // Evict failed placeholder so a retry can succeed later (ISS-057).
        if (themeBuffers[themeKey] === silentPlaceholder) {
          delete themeBuffers[themeKey];
        }
        console.error("[S&D audio] Failed to load sound theme \"" + themeKey + "\":", err);
      });
    return silentPlaceholder;
  }

  function stopBackgroundLoops() {
    if (hasMusic()) {
      _ctxAdapter.loopSources.slice().forEach(entry => _music.teardownEntry(entry));
    }
    _ctxAdapter.loopSources.length = 0;
  }

  function startBackgroundLoops() {
    if (!audioCtx || host.isGameOver()) return;
    if (!hasMusic()) return;
    stopBackgroundLoops();
    // Loop sources are core-owned state (§3): music.js only plans entries and
    // builds/tears down single nodes; this registry never leaves sounds.js.
    _music.getLoopPlan().forEach(plan => {
      const entry = _music.makeLoopNodes(_ctxAdapter, plan);
      if (entry) _ctxAdapter.loopSources.push(entry);
    });
  }

  function isReady() {
    return Boolean(audioCtx) && audioCtx.state === "running";
  }

  function syncEnableButton() {
    host.updateEnableButton(isReady());
  }

  function initAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;

    // Master limiter / dynamics compressor prevents clipping when multiple buses peak (ISS-056).
    if (typeof audioCtx.createDynamicsCompressor === "function") {
      compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-14, audioCtx.currentTime);
      compressor.knee.setValueAtTime(18, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(6, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.18, audioCtx.currentTime);
    }

    masterGain = audioCtx.createGain();
    if (compressor) {
      compressor.connect(analyser);
    }
    analyser.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    const busTarget = compressor || analyser;
    Object.keys(DEFAULT_BUS_LEVELS).forEach(name => {
      const g = audioCtx.createGain();
      g.connect(busTarget);
      buses[name] = g;
    });

    loadSettings();
    applyGainSettings();
    ensureThemeBuffer(currentTheme);
    startBackgroundLoops();
    audioCtx.addEventListener("statechange", syncEnableButton);
    syncEnableButton();
  }

  function ensureReady(isPassiveHover) {
    if (!audioCtx && !isPassiveHover) initAudio();
    if (!audioCtx) return false;
    if (audioCtx.state === "suspended" && !isPassiveHover) {
      audioCtx.resume().then(syncEnableButton).catch(() => {});
    }
    syncEnableButton();
    return true;
  }

  // Audio services handed to SfxEngine / MusicEngine. hoverState and
  // loopSources are core-owned state (§3): children get plain data and return
  // results — only this module writes these fields.
  const _ctxAdapter = {
    hoverState: { lastHoverKey: "", lastHoverTime: 0 },
    loopSources: [],
    get allClips() { return getAllClips(); },
    ensureReady,
    getAudioCtx() { return audioCtx; },
    getBuses() { return buses; },
    getThemeBuffer() { return ensureThemeBuffer(currentTheme); },
    getViewport() { return (host && typeof host.getViewport === "function") ? host.getViewport() : { viewX: 0, viewY: 0, viewSpan: 32 }; },
    isGameOver() { return Boolean(host && typeof host.isGameOver === "function" && host.isGameOver()); },
    acquireVoice,
    bumpRadioUntil(untilMs) {
      radioActiveUntil = Math.max(radioActiveUntil, untilMs);
    },
    scheduleAt,
    stopBackgroundLoops,
    startBackgroundLoops
  };

  function playClip(clipKey, cell, isPassiveHover) {
    if (!hasSfx()) return false;
    return _sfx.playClip(_ctxAdapter, clipKey, cell, isPassiveHover);
  }

  // ---- Self tests ---------------------------------------------------------
  function runSelfTests() {
    const results = [];
    const record = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });

    const sfxClips = hasSfx() ? _sfx.getClips() : {};
    const musicClips = hasMusic() ? _music.getClips() : {};
    const allClips = Object.assign({}, sfxClips, musicClips);
    const clipNames = Object.keys(allClips);

    const badClips = clipNames.filter(k => {
      const c = allClips[k];
      return !(Number.isFinite(c.offset) && c.offset >= 0 &&
               Number.isFinite(c.duration) && c.duration > 0 &&
               c.offset + c.duration <= BAKED_BUFFER_SECONDS + 1e-6 &&
               Object.prototype.hasOwnProperty.call(DEFAULT_BUS_LEVELS, c.bus));
    });
    record("A-1 CLIP MANIFEST", clipNames.length > 0 && badClips.length === 0,
      `${clipNames.length} clips; invalid: ${badClips.length ? badClips.join(", ") : "none"}`);

    const referenced = hasSfx() ? _sfx.getReferencedClips() : [];
    const missingRefs = referenced.filter(k => !sfxClips[k]);
    record("A-2 EVENT ROUTING", hasSfx() && missingRefs.length === 0,
      `${referenced.length} routed clips; missing: ${missingRefs.length ? missingRefs.join(", ") : "none"}`);

    const loopKeys = hasMusic() ? _music.getBackgroundLoopKeys() : [];
    const badLoops = loopKeys.filter(k => !musicClips[k] || !musicClips[k].loop);
    const unusedMusic = Object.keys(musicClips).filter(k => !loopKeys.includes(k));
    // Manifest consistency only (no magic loop count): every scheduled loop must
    // be a real looping clip and every music clip must be scheduled. Since v73
    // there are no looping beds at all, so both lists are legitimately empty.
    record("A-3 BACKGROUND LOOPS", hasMusic() && badLoops.length === 0 && unusedMusic.length === 0,
      `${loopKeys.length} loops (none since v73); invalid: ${badLoops.length ? badLoops.join(", ") : "none"}; unused: ${unusedMusic.length ? unusedMusic.join(", ") : "none"}`);

    const baked = _bakedSounds || {};
    const isBakedWav = v => {
      if (typeof v !== "string" || v.length < 16) return false;
      try {
        const head = atob(v.slice(v.indexOf(",") + 1, v.indexOf(",") + 17));
        return head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WAVE";
      } catch (err) {
        return false;
      }
    };
    const themesMissing = Object.keys(SOUND_THEMES).filter(t => !isBakedWav(baked[t]));
    record("A-4 SOUND THEMES", themesMissing.length === 0,
      `${Object.keys(SOUND_THEMES).length} themes; missing/invalid baked WAV: ${themesMissing.length ? themesMissing.join(", ") : "none"}`);

    const busNames = Object.keys(DEFAULT_BUS_LEVELS);
    const badLevels = busNames.filter(b => !(settings.buses[b] >= 0 && settings.buses[b] <= 1));
    // Expect exactly the declared buses: every default level present and no extras.
    const missingBuses = busNames.filter(b => !(b in settings.buses));
    record("A-5 BUS LEVELS", badLevels.length === 0 && missingBuses.length === 0 &&
           settings.master >= 0 && settings.master <= 1,
      `${busNames.length} buses; master ${settings.master}; out of range: ${badLevels.length ? badLevels.join(", ") : "none"}` +
      `${missingBuses.length ? "; missing: " + missingBuses.join(", ") : ""}`);

    const allPass = results.every(r => r.pass);
    console.log("%cSEEK & DESTROY — AUDIO SELF-TEST RESULTS", "color:#c084fc;font-size:14px;");
    results.forEach(r => console.log(`%c${r.pass ? "PASS" : "FAIL"}  ${r.name} — ${r.detail}`, `color:${r.pass ? "#34d399" : "#f43f5e"};`));
    console.log(`%c${allPass ? "ALL AUDIO TESTS PASSED" : "SOME AUDIO TESTS FAILED"} (${results.filter(r => r.pass).length}/${results.length})`,
      `color:${allPass ? "#34d399" : "#f43f5e"};font-weight:bold;`);
    return results;
  }

  // ---- Public API ---------------------------------------------------------
  function bindInterface(audioConsumer) {
    _audioConsumer = audioConsumer || null;
    loadSettings();
    return true;
  }

  function step() {
    if (!_audioConsumer || typeof _audioConsumer.drainCommands !== "function") return;
    const cmds = _audioConsumer.drainCommands();
    for (let i = 0; i < cmds.length; i++) {
      const cmd = cmds[i];
      if (!cmd) continue;
      if (cmd.viewport) _lastViewport = cmd.viewport;
      if (typeof cmd.gameOver === "boolean") _lastGameOver = cmd.gameOver;
      if (cmd.type === "PLAY") {
        play(cmd.kind, cmd.payload);
      } else if (cmd.type === "UNLOCK") {
        unlock();
      } else if (cmd.type === "SET_MUTE") {
        settings.muted = Boolean(cmd.muted);
        applyGainSettings();
        saveSettings();
      } else if (cmd.type === "TOGGLE_MUTE") {
        toggleMute();
      } else if (cmd.type === "SET_THEME") {
        setTheme(cmd.theme);
      } else if (cmd.type === "STOP_LOOPS") {
        stopBackgroundLoops();
      } else if (cmd.type === "CLEAR_ALL") {
        clearAll();
      }
    }
  }

  function bindHost(newHost) {
    if (!newHost) return false;
    host = newHost;
    loadSettings();
    syncEnableButton();
    return true;
  }

  function setTheme(themeKey) {
    const LEGACY = { A: "default", B: "retro", C: "alien" };
    const raw = String(themeKey || "").trim();
    const key = LEGACY[raw] || raw.toLowerCase();
    currentTheme = SOUND_THEMES[key] ? key : "default";
    if (audioCtx) {
      ensureThemeBuffer(currentTheme);
      startBackgroundLoops();
    }
    return currentTheme;
  }

  function getTheme() {
    return currentTheme;
  }

  function clearAll() {
    host.clearAudioTimerList();
    stopBackgroundLoops();
    return true;
  }

  function unlock() {
    ensureReady(false);
    settings.muted = false;
    applyGainSettings();
    saveSettings();
    syncEnableButton();
    return playClip("ui.enableAudio");
  }

  function setMaster(value) {
    settings.master = clampUnit(value);
    applyGainSettings();
    saveSettings();
    return true;
  }

  function setBusGain(name, value) {
    if (!(name in DEFAULT_BUS_LEVELS)) return false;
    settings.buses[name] = clampUnit(value);
    applyGainSettings();
    saveSettings();
    return true;
  }

  function toggleMute() {
    settings.muted = !settings.muted;
    applyGainSettings();
    saveSettings();
    return settings.muted;
  }

  function setReduced(value) {
    settings.reduced = Boolean(value);
    saveSettings();
    return true;
  }

  function play(eventName, payload) {
    if (typeof eventName !== "string") return false;
    const data = (payload && typeof payload === "object") ? payload : {};
    if (eventName === "level.start") {
      host.clearAudioTimerList();
      startBackgroundLoops();
      return true;
    }
    if (!hasSfx()) return false;
    if (eventName === "unit.hover") return playHover(data);
    return _sfx.dispatchEvent(_ctxAdapter, eventName, data);
  }

  // Hover debounce state lives here (§3): sfx.js receives the stamp as plain
  // data on the payload and returns {play, clipKey, nextHoverKey, nextHoverTime};
  // this core applies the result and performs the playback.
  function playHover(data) {
    const res = _sfx.dispatchEvent(_ctxAdapter, "unit.hover", Object.assign({}, data, {
      lastHoverKey: _ctxAdapter.hoverState.lastHoverKey,
      lastHoverTime: _ctxAdapter.hoverState.lastHoverTime
    }));
    if (!res) return false;
    _ctxAdapter.hoverState.lastHoverKey = res.nextHoverKey;
    _ctxAdapter.hoverState.lastHoverTime = res.nextHoverTime;
    return res.play ? playClip(res.clipKey, data.from, true) : false;
  }

  async function load() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
      await _loadScripts(AUDIO_CHILDREN, true);
      _registrationOpen = false;
      delete api._registerModule;
      if (typeof _sfxFactory === "function") _sfx = _sfxFactory(_audioData);
      if (typeof _musicFactory === "function") _music = _musicFactory(_audioData);
      if (!hasSfx() || !hasMusic()) {
        console.error("[S&D audio] sfx.js and/or music.js failed to register; audio will be degraded.");
      }
    })();
    return _loadPromise;
  }

  const api = {
    _registerModule,
    load,
    bindInterface,
    step,
    bindHost,
    play,
    unlock,
    isReady,
    stopLoops: stopBackgroundLoops,
    toggleMute,
    setMaster,
    setBusGain,
    setReduced,
    setTheme,
    getTheme,
    clearAll,
    getAnalyser: () => analyser,
    getRadioActiveUntil: () => radioActiveUntil,
    runSelfTests
  };

  return api;
})();
