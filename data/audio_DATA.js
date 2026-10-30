"use strict";

// ============================================================
// AUDIO DATA — clip manifests (offsets into the baked theme buffers), the
// destruction-sound tier per ship category, and the background loop mix.
// Privately registered with SoundEngine (sounds.js); exposes zero globals.
// ============================================================
SoundEngine._registerModule("data", {
  version: "V58-1.0",
  schema: "seek-and-destroy.audio-data",
  // One-shot effects: { offset, duration } in seconds, bus, optional radioMs /
  // spatial / fixed pan.
  sfxClips: {
    "combat.impact.shield":   { offset: 0.00, duration: 0.22, bus: "COMBAT" },
    "combat.impact.hull":     { offset: 0.24, duration: 0.20, bus: "COMBAT" },
    "combat.destroy.light":   { offset: 0.76, duration: 0.24, bus: "COMBAT" },
    "combat.destroy.medium":  { offset: 1.02, duration: 0.44, bus: "COMBAT" },
    "combat.destroy.heavy":   { offset: 1.48, duration: 0.52, bus: "COMBAT" },
    "combat.destroy.capital": { offset: 2.02, duration: 1.02, bus: "COMBAT" },
    "ui.enableAudio":         { offset: 3.06, duration: 0.18, bus: "UI",        radioMs: 120 },
    "selectUnit":             { offset: 3.26, duration: 0.10, bus: "UI",        radioMs: 75,  spatial: true },
    "hoverCell":              { offset: 3.38, duration: 0.04, bus: "UI",                      spatial: true },
    "hoverHostile":           { offset: 3.44, duration: 0.07, bus: "UI",                      spatial: true },
    "moveAction":             { offset: 3.53, duration: 0.28, bus: "SYSTEMS",   radioMs: 240, spatial: true },
    "laserShoot":             { offset: 3.83, duration: 0.23, bus: "COMBAT",    radioMs: 190, spatial: true },
    "railgunShoot":           { offset: 4.08, duration: 0.30, bus: "COMBAT",    radioMs: 260, spatial: true },
    "missileShoot":           { offset: 4.40, duration: 0.29, bus: "COMBAT",    radioMs: 250, spatial: true },
    "captureAction":          { offset: 4.71, duration: 0.32, bus: "SYSTEMS",   radioMs: 290, spatial: true },
    "shieldRegen":            { offset: 5.05, duration: 0.26, bus: "SYSTEMS",   radioMs: 230, spatial: true },
    "shieldDrop":             { offset: 5.33, duration: 0.19, bus: "SYSTEMS",   radioMs: 160, spatial: true },
    "blindCollision":         { offset: 5.54, duration: 0.34, bus: "COMBAT",    radioMs: 310, spatial: true },
    "warpIn":                 { offset: 5.90, duration: 0.31, bus: "SYSTEMS",   radioMs: 280, spatial: true },
    "commandBridgeOpen":      { offset: 6.23, duration: 0.11, bus: "UI",        radioMs: 90,  pan: 0 },
    "commandBridgeClose":     { offset: 6.36, duration: 0.11, bus: "UI",        radioMs: 85,  pan: 0 },
    "inspectorToggle":        { offset: 6.49, duration: 0.11, bus: "UI",        radioMs: 95,  pan: 0.25 },
    "invalidAction":          { offset: 6.62, duration: 0.14, bus: "UI",        radioMs: 120, pan: 0 },
    "playerAction":           { offset: 6.78, duration: 0.12, bus: "TELEMETRY", radioMs: 100, pan: -0.20 },
    "enemyAction":            { offset: 6.92, duration: 0.14, bus: "TELEMETRY", radioMs: 120, pan: 0 },
    "unknownEnemyAction":     { offset: 7.08, duration: 0.20, bus: "TELEMETRY", radioMs: 180, pan: 0 },
    "playerTurnEnd":          { offset: 7.30, duration: 0.28, bus: "TELEMETRY", radioMs: 260, pan: 0 },
    "enemyTurnEnd":           { offset: 7.60, duration: 0.30, bus: "TELEMETRY", radioMs: 280, pan: 0 },
    "contactSpotted":         { offset: 7.92, duration: 0.21, bus: "TELEMETRY", radioMs: 190, spatial: true },
    "hullDestroy":            { offset: 8.15, duration: 0.38, bus: "COMBAT",    radioMs: 360, spatial: true },
    "victoryStinger":         { offset: 8.55, duration: 0.43, bus: "TELEMETRY", radioMs: 400, pan: 0 },
    "defeatStinger":          { offset: 9.00, duration: 0.44, bus: "TELEMETRY", radioMs: 410, pan: 0 },
    "minimapZoom":            { offset: 9.46, duration: 0.06, bus: "UI",        radioMs: 40,  pan: 0 }
  },
  // Ship category -> combat.destroy.<tier> clip (unlisted categories use "capital").
  destroyTierByCategory: {
    Fighter: "light",
    Bomber: "light",
    Shuttle: "light",
    Probe: "light",
    Frigate: "medium",
    Destroyer: "medium",
    "Boarding APC": "medium",
    Cruiser: "heavy"
  },
  // Looping beds (only clips that are actually played).
  musicClips: {
    "ambience.base": { offset: 9.54,  duration: 2.00, bus: "AMBIENCE", loop: true },
    "music.pad0":    { offset: 19.08, duration: 2.00, bus: "MUSIC",    loop: true }
  },
  backgroundLoops: [
    { clipKey: "ambience.base", gain: 0.85 },
    { clipKey: "music.pad0",    gain: 0.55 }
  ]
});
