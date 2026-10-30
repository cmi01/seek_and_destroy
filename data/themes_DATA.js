"use strict";

// ============================================================
// THEME DATA — the three visual themes: board palettes, the colour remap
// that re-tints UI/VFX colours for non-default themes, and the baked
// sprite-atlas layout.
// Privately registered with Game (core/game.js); exposes zero globals.
// ============================================================
Game._registerModule("themesData", {
  version: "V58-1.0",
  schema: "seek-and-destroy.theme-data",
  // Cycle order for the THM button; the first entry is the default theme.
  order: ["default", "retro", "alien"],
  // Legacy names accepted from saved state / old builds.
  aliases: { b: "default", iron_dusk: "default" },

  // Board palettes (formerly graphics.js _boardPalette()).
  palettes: {
    default: {
      bg: "#06080e",
      gridMajor: "rgba(56, 189, 248, 0.11)",
      gridMinor: "rgba(255, 255, 255, 0.05)",
      ticks: "rgba(255, 255, 255, 0.12)",
      neb0: "rgba(147, 51, 234, 0.35)",
      neb1: "rgba(88, 28, 135, 0.22)",
      neb2: "rgba(88, 28, 135, 0)",
      rock0: "#475569", rock1: "#334155", rock2: "#1e293b", rockStroke: "#64748b",
      sensorFill: "rgba(60, 180, 255, 0.08)", sensorStroke: "rgba(60, 180, 255, 0.22)",
      wedgeFill: "rgba(60, 180, 255, 0.14)",
      fogFill: "rgba(3, 5, 9, 0.65)",
      moveBox: "rgba(56, 189, 248, 0.45)", moveArrow: "rgba(56, 189, 248, 0.75)",
      accent: "#38bdf8", hostile: "#f43f5e", gold: "#facc15",
      mmRockOuter: "#334155", mmRockInner: "#475569",
      hull: {
        1: { lit: "#c2c9d0", dark: "#3a4149" },
        2: { lit: "#c9924f", dark: "#42290f" }
      },
      plume: {
        1: { outer: "rgba(176,192,208,0.85)", mid: "rgba(214,224,234,0.70)", inner: "rgba(255,255,255,0.75)", core: "#ffffff" },
        2: { outer: "rgba(255,198,58,0.85)", mid: "rgba(255,222,120,0.70)", inner: "rgba(255,244,206,0.80)", core: "#fff6d2" }
      },
      plumeSpec: {
        nozzleX: -0.78, halfWidthR: 0.09, flickerBase: 0.85, flickerAmp: 0.15, flickerFreq: 0.02,
        flickerSpatial: 0.1, baseLenR: 0.34, lenAmpR: 0.06, lenFreq: 0.015, phaseFreq: 0.018,
        phaseStep: 1.3, phaseBase: 0.9, phaseAmp: 0.1, midLenScale: 0.7, innerLenScale: 0.4,
        innerHeightPx: 2.0, coreRadiusR: 0.035, minCoreRadiusPx: 1.0
      },
      rail: {
        core: "#ff3b26", glow: "rgba(255,70,45,0.55)",
        glowZero: "rgba(255,70,45,0)", hotZero: "rgba(255,59,38,0)",
        periodMs: 1100, segmentScale: 0.22, glowHeightScale: 1.9, coreHeightScale: 0.5
      },
      shield: {
        pulseBase: 0.92, pulseAmp: 0.08, pulseFreq: 0.004, radiusScale: 1.04,
        innerGradScale: 0.3, outerGradScale: 1.15,
        gradStop0: "rgba(120, 220, 255, 0.05)", gradStopMid: "rgba(120, 220, 255, 0.12)", gradStop1: "rgba(120, 220, 255, 0)",
        vertices: 8, rotFreq: 0.0003, wobbleAmp: 0.03, wobbleFreq: 0.006, wobblePhaseStep: 0.8,
        strokeColor: "rgba(120, 220, 255, 0.72)", lineWidth: 1.2, nodeColor: "#e0f2fe", nodeSize: 2.0
      },
      hpBadge: { bgColor: "rgba(4, 6, 11, 0.85)", damagedColor: "#facc15", healthyColor: "#e2e8f0" }
    },
    retro: {
      bg: "#020a05",
      gridMajor: "rgba(74, 222, 128, 0.22)",
      gridMinor: "rgba(74, 222, 128, 0.07)",
      ticks: "rgba(74, 222, 128, 0.24)",
      neb0: "rgba(244, 114, 182, 0.38)",
      neb1: "rgba(157, 23, 77, 0.22)",
      neb2: "rgba(157, 23, 77, 0)",
      rock0: "#065f46", rock1: "#064e3b", rock2: "#022c22", rockStroke: "#4ade80",
      sensorFill: "rgba(74, 222, 128, 0.09)", sensorStroke: "rgba(74, 222, 128, 0.28)",
      wedgeFill: "rgba(74, 222, 128, 0.16)",
      fogFill: "rgba(1, 6, 3, 0.72)",
      moveBox: "rgba(74, 222, 128, 0.50)", moveArrow: "rgba(74, 222, 128, 0.85)",
      accent: "#4ade80", hostile: "#f472b6", gold: "#fde047",
      mmRockOuter: "#064e3b", mmRockInner: "#4ade80",
      hull: {
        1: { lit: "#4ade80", dark: "#064e3b" },
        2: { lit: "#f472b6", dark: "#831843" }
      },
      plume: {
        1: { outer: "rgba(74,222,128,0.90)", mid: "rgba(134,239,172,0.80)", inner: "rgba(220,252,231,0.92)", core: "#ffffff" },
        2: { outer: "rgba(244,114,182,0.90)", mid: "rgba(251,146,60,0.82)", inner: "rgba(254,240,138,0.92)", core: "#fef08a" }
      },
      plumeSpec: {
        nozzleX: -0.78, halfWidthR: 0.1, flickerBase: 0.82, flickerAmp: 0.18, flickerFreq: 0.03,
        flickerSpatial: 0.12, baseLenR: 0.38, lenAmpR: 0.08, lenFreq: 0.022, phaseFreq: 0.025,
        phaseStep: 1.3, phaseBase: 0.9, phaseAmp: 0.1, midLenScale: 0.72, innerLenScale: 0.44,
        innerHeightPx: 2.2, coreRadiusR: 0.04, minCoreRadiusPx: 1.2
      },
      rail: {
        core: "#fde047", glow: "rgba(253,224,71,0.65)",
        glowZero: "rgba(253,224,71,0)", hotZero: "rgba(253,224,71,0)",
        periodMs: 850, segmentScale: 0.25, glowHeightScale: 2.1, coreHeightScale: 0.6
      },
      shield: {
        pulseBase: 0.94, pulseAmp: 0.06, pulseFreq: 0.006, radiusScale: 1.05,
        innerGradScale: 0.3, outerGradScale: 1.15,
        gradStop0: "rgba(74, 222, 128, 0.06)", gradStopMid: "rgba(74, 222, 128, 0.16)", gradStop1: "rgba(74, 222, 128, 0)",
        vertices: 6, rotFreq: 0.0005, wobbleAmp: 0.015, wobbleFreq: 0.008, wobblePhaseStep: 1.0,
        strokeColor: "rgba(74, 222, 128, 0.85)", lineWidth: 1.5, nodeColor: "#fef08a", nodeSize: 2.4
      },
      hpBadge: { bgColor: "rgba(2, 20, 14, 0.90)", damagedColor: "#fde047", healthyColor: "#86efac" }
    },
    alien: {
      bg: "#070312",
      gridMajor: "rgba(45, 212, 191, 0.20)",
      gridMinor: "rgba(192, 132, 252, 0.07)",
      ticks: "rgba(163, 230, 53, 0.22)",
      neb0: "rgba(163, 230, 53, 0.34)",
      neb1: "rgba(63, 98, 18, 0.20)",
      neb2: "rgba(63, 98, 18, 0)",
      rock0: "#4c1d95", rock1: "#3b0764", rock2: "#1e1b4b", rockStroke: "#c084fc",
      sensorFill: "rgba(45, 212, 191, 0.09)", sensorStroke: "rgba(45, 212, 191, 0.28)",
      wedgeFill: "rgba(163, 230, 53, 0.16)",
      fogFill: "rgba(4, 1, 10, 0.72)",
      moveBox: "rgba(45, 212, 191, 0.50)", moveArrow: "rgba(45, 212, 191, 0.85)",
      accent: "#2dd4bf", hostile: "#c084fc", gold: "#a3e635",
      mmRockOuter: "#3b0764", mmRockInner: "#a855f7",
      hull: {
        1: { lit: "#2dd4bf", dark: "#134e4a" },
        2: { lit: "#c084fc", dark: "#3b0764" }
      },
      plume: {
        1: { outer: "rgba(45,212,191,0.88)", mid: "rgba(163,230,53,0.76)", inner: "rgba(217,249,157,0.86)", core: "#ecfccb" },
        2: { outer: "rgba(192,132,252,0.88)", mid: "rgba(232,121,249,0.76)", inner: "rgba(245,208,254,0.86)", core: "#fae8ff" }
      },
      plumeSpec: {
        nozzleX: -0.78, halfWidthR: 0.1, flickerBase: 0.8, flickerAmp: 0.2, flickerFreq: 0.024,
        flickerSpatial: 0.14, baseLenR: 0.36, lenAmpR: 0.08, lenFreq: 0.018, phaseFreq: 0.022,
        phaseStep: 1.5, phaseBase: 0.88, phaseAmp: 0.12, midLenScale: 0.72, innerLenScale: 0.42,
        innerHeightPx: 2.2, coreRadiusR: 0.04, minCoreRadiusPx: 1.2
      },
      rail: {
        core: "#a3e635", glow: "rgba(163,230,53,0.62)",
        glowZero: "rgba(163,230,53,0)", hotZero: "rgba(163,230,53,0)",
        periodMs: 950, segmentScale: 0.24, glowHeightScale: 2.1, coreHeightScale: 0.55
      },
      shield: {
        pulseBase: 0.9, pulseAmp: 0.1, pulseFreq: 0.005, radiusScale: 1.06,
        innerGradScale: 0.25, outerGradScale: 1.18,
        gradStop0: "rgba(45, 212, 191, 0.06)", gradStopMid: "rgba(163, 230, 53, 0.15)", gradStop1: "rgba(45, 212, 191, 0)",
        vertices: 12, rotFreq: 0.0004, wobbleAmp: 0.045, wobbleFreq: 0.008, wobblePhaseStep: 0.9,
        strokeColor: "rgba(94, 234, 212, 0.78)", lineWidth: 1.4, nodeColor: "#d9f99d", nodeSize: 2.2
      },
      hpBadge: { bgColor: "rgba(9, 4, 18, 0.88)", damagedColor: "#e879f9", healthyColor: "#99f6e4" }
    }
  },

  // UI / VFX colour remap. Renderers write their colours as default-theme
  // literals and pass them through Themes.color(); for other themes each
  // listed hex colour or rgb triplet is swapped (alpha is preserved).
  // Unlisted colours (faction red/orange, gold, white, black) are kept on
  // purpose so their gameplay meaning is identical in every theme.
  colorRemap: {
    retro: {
      // cyan accents -> phosphor green
      "56,189,248": "74,222,128", "#38bdf8": "#4ade80", "#78dcff": "#86efac", "2,132,199": "22,163,74",
      // violet accents -> cyan
      "#c084fc": "#38bdf8",
      // emerald
      "#34d399": "#a3e635",
      // dark panel backgrounds -> green-black
      "6,8,14": "3,12,6", "3,5,10": "2,8,4", "10,15,26": "6,20,10", "4,6,11": "3,10,5", "15,23,42": "8,30,14",
      "#06080e": "#020a05", "#060911": "#03100a", "#06040b": "#020805",
      // slate text -> green-grey
      "148,163,184": "134,179,154", "#94a3b8": "#86b39a", "#e2e8f0": "#dcfce7", "#cbd5e1": "#bbf7d0",
      "#64748b": "#4d7c5f", "#475569": "#3f6b52", "#334155": "#2c4a3a"
    },
    alien: {
      // cyan accents -> teal
      "56,189,248": "45,212,191", "#38bdf8": "#2dd4bf", "#78dcff": "#5eead4", "2,132,199": "13,148,136",
      // violet accents -> fuchsia
      "#c084fc": "#e879f9",
      // emerald
      "#34d399": "#67e8f9",
      // dark panel backgrounds -> violet-black
      "6,8,14": "9,4,20", "3,5,10": "6,2,14", "10,15,26": "16,7,32", "4,6,11": "8,3,17", "15,23,42": "24,10,48",
      "#06080e": "#070312", "#060911": "#0a0418", "#06040b": "#0b0316",
      // slate text -> lavender-grey
      "148,163,184": "168,156,200", "#94a3b8": "#a89cc8", "#e2e8f0": "#ede9fe", "#cbd5e1": "#ddd6fe",
      "#64748b": "#6d5f8f", "#475569": "#574a78", "#334155": "#3f3560"
    }
  },

  // Baked sprite-atlas layout (shared by all themes): row index of each
  // ship type and the extra rows for "marines sent" variants.
  spriteAtlas: {
    tilePx: 106,
    shipRows: [
      "Shuttle", "Fighter", "Probe", "Bomber", "Boarding APC",
      "Attack Frigate", "Missile Frigate", "Attack Destroyer", "Railgun Destroyer", "Missile Destroyer",
      "Light Cruiser", "Railgun Cruiser", "Heavy Cruiser", "Missile Cruiser",
      "Battlecruiser", "Missile Battleship", "Battleship", "Flagship Battlecruiser"
    ],
    marineSentRows: {
      "Boarding APC": 18,
      "Missile Battleship": 19,
      "Battleship": 20
    }
  }
});
