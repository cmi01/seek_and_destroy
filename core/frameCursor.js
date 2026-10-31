"use strict";

// ============================================================
// frameCursor.js — job: build the render frame's cursor/presentation slice:
// cursor style, hover/press state and presentation settings.
// Owner: core/game.js (pure child). Holds no state.
// ============================================================
Game._registerModule("frameCursor", () => {
  // Button presentation DTO: only the fields the UI renderer reads.
  function buttonDTO(b){
    return {
      id: typeof b.id === "string" ? b.id : "",
      label: typeof b.label === "string" ? b.label : "",
      x: Number(b.x) || 0,
      y: Number(b.y) || 0,
      w: Number(b.w) || 0,
      h: Number(b.h) || 0,
      enabled: Boolean(b.enabled),
      active: Boolean(b.active)
    };
  }

  function build(p){
    // p = { state, cursorStyle } — state-shape params in, plain presentation
    // slice out. cursorStyle is the cursor decision the parent resolved.
    const st = p.state;

    return {
      cursor: p.cursorStyle,
      theme: st.theme || "default",
      inspectMode: Boolean(st.inspectMode),
      buttonHovered: st.buttonHovered,
      buttonPressed: st.buttonPressed,
      selectedCell: st.selectedCell ? { ...st.selectedCell } : null,
      hoveredCell: st.hoveredCell ? { ...st.hoveredCell } : null,
      canvasButtons: Array.isArray(st.canvasButtons) ? st.canvasButtons.map(buttonDTO) : [],
      audioSettings: st.audioSettings ? { muted: Boolean(st.audioSettings.muted) } : { muted: false }
    };
  }

  return { build };
});
