"use strict";

// ============================================================
// music.js — job: manage music and ambience playback.
// Owner: audio/sounds.js. Holds no state unless it is a core.
// ============================================================
SoundEngine._registerModule("music", AUDIO => {
  if (!AUDIO) console.error("[S&D audio] audio data manifest is not loaded; ambience/music are disabled.");
  const MUSIC_AND_AMBIENCE_CLIPS = AUDIO ? AUDIO.musicClips : {};

  const BACKGROUND_LOOPS = AUDIO ? AUDIO.backgroundLoops : [];

  // Pure loop plan: plain scheduling descriptors ({clipKey, gain, loop, offset,
  // duration}) built from the manifest. No nodes, no registry — the parent
  // decides what to run and owns the loop-source registry (§3).
  function getLoopPlan() {
    const plan = [];
    BACKGROUND_LOOPS.forEach(l => {
      const clip = MUSIC_AND_AMBIENCE_CLIPS[l.clipKey];
      if (!clip) return;
      plan.push({
        clipKey: l.clipKey,
        gain: l.gain,
        loop: Boolean(clip.loop),
        offset: clip.offset,
        duration: clip.duration
      });
    });
    return plan;
  }

  // Build the WebAudio nodes for ONE plan entry and return them as a plain
  // {src, gain} entry — registering it is the parent's job. One-shot bed
  // elements clean up after themselves (src.onended) and return null: nothing
  // to register, so stopping loops never cuts a bed short.
  function makeLoopNodes(ctxObj, entry) {
    if (!ctxObj || !entry) return null;
    const audioCtx = ctxObj.getAudioCtx();
    const buses = ctxObj.getBuses();
    const clip = MUSIC_AND_AMBIENCE_CLIPS[entry.clipKey];
    if (!audioCtx || !buses || !clip || !buses[clip.bus]) return null;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(entry.gain, audioCtx.currentTime);
    g.connect(buses[clip.bus]);
    const src = audioCtx.createBufferSource();
    src.buffer = ctxObj.getThemeBuffer();
    src.connect(g);
    if (entry.loop) {
      src.loop = true;
      src.loopStart = entry.offset;
      src.loopEnd = entry.offset + entry.duration;
      src.start(audioCtx.currentTime, entry.offset);
      return { src, gain: g };
    }
    // One-shot bed element: play its span once and disconnect nodes on completion.
    src.onended = () => {
      try { src.disconnect(); } catch (_) { /* ignore */ }
      try { g.disconnect(); } catch (_) { /* ignore */ }
    };
    src.start(audioCtx.currentTime, entry.offset, entry.duration);
    return null;
  }

  // Stop and disconnect ONE entry makeLoopNodes returned (no registry access).
  function teardownEntry(entry) {
    if (!entry) return;
    if (entry.src) {
      try { entry.src.stop(); } catch (_) { /* already stopped */ }
      try { entry.src.disconnect(); } catch (_) { /* ignore */ }
    }
    if (entry.gain) {
      try { entry.gain.disconnect(); } catch (_) { /* ignore */ }
    }
  }

  return {
    getClips: () => MUSIC_AND_AMBIENCE_CLIPS,
    getBackgroundLoopKeys: () => BACKGROUND_LOOPS.map(l => l.clipKey),
    getLoopPlan,
    makeLoopNodes,
    teardownEntry
  };
});
