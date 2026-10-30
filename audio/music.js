"use strict";

// ============================================================
// MUSIC.JS — Looping ambience & music bed manifest and playback controller.
// Privately registered with SoundEngine (sounds.js); exposes zero globals.
// ============================================================
SoundEngine._registerModule("music", AUDIO => {
  if (!AUDIO) console.error("[S&D audio] data/audio_DATA.js is not loaded; ambience/music are disabled.");
  const MUSIC_AND_AMBIENCE_CLIPS = AUDIO ? AUDIO.musicClips : {};

  const BACKGROUND_LOOPS = AUDIO ? AUDIO.backgroundLoops : [];

  function stopBackgroundLoops(ctxObj) {
    const loopSources = (ctxObj && Array.isArray(ctxObj.loopSources)) ? ctxObj.loopSources : [];
    while (loopSources.length > 0) {
      const entry = loopSources.pop();
      if (!entry) continue;
      if (entry.src) {
        try { entry.src.stop(); } catch (_) { /* already stopped */ }
        try { entry.src.disconnect(); } catch (_) { /* ignore */ }
      }
      if (entry.gain) {
        try { entry.gain.disconnect(); } catch (_) { /* ignore */ }
      }
    }
  }

  function startLoopClip(ctxObj, clipKey, gainValue) {
    if (!ctxObj) return;
    const audioCtx = ctxObj.getAudioCtx();
    const buses = ctxObj.getBuses();
    const clip = MUSIC_AND_AMBIENCE_CLIPS[clipKey];
    if (!audioCtx || !buses || !clip || !buses[clip.bus]) return;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gainValue, audioCtx.currentTime);
    g.connect(buses[clip.bus]);
    const src = audioCtx.createBufferSource();
    src.buffer = ctxObj.getThemeBuffer();
    src.connect(g);
    if (clip.loop) {
      src.loop = true;
      src.loopStart = clip.offset;
      src.loopEnd = clip.offset + clip.duration;
      src.start(audioCtx.currentTime, clip.offset);
      if (Array.isArray(ctxObj.loopSources)) {
        ctxObj.loopSources.push({ src, gain: g });
      }
    } else {
      // One-shot bed element: play its span once and disconnect nodes on completion.
      src.onended = () => {
        try { src.disconnect(); } catch (_) { /* ignore */ }
        try { g.disconnect(); } catch (_) { /* ignore */ }
      };
      src.start(audioCtx.currentTime, clip.offset, clip.duration);
    }
  }

  function startBackgroundLoops(ctxObj) {
    if (!ctxObj || !ctxObj.getAudioCtx()) return;
    stopBackgroundLoops(ctxObj);
    BACKGROUND_LOOPS.forEach(l => startLoopClip(ctxObj, l.clipKey, l.gain));
  }

  return {
    getClips: () => MUSIC_AND_AMBIENCE_CLIPS,
    getBackgroundLoopKeys: () => BACKGROUND_LOOPS.map(l => l.clipKey),
    startBackgroundLoops,
    stopBackgroundLoops,
    startLoopClip
  };
});
