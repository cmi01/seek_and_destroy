"use strict";

// ============================================================
// frameUnits.js — job: build the render frame's unit slice: unit DTOs with
// flags, effect animations and the selected unit's shield state.
// Owner: core/game.js (pure child). Holds no state.
// ============================================================
Game._registerModule("frameUnits", deps => {
  // deps = { getEffectiveScan, isUnitSpottedByTeam, canShield } — the parent's
  // pure vision/action queries, injected so this child holds no state and
  // references nothing outside its parent.

  // Element DTOs for the frame arrays: only the scalar/DTO fields the
  // effects and object renderers read.
  function frameCell(c){ return { x: c ? c.x : 0, y: c ? c.y : 0 }; }
  function vectorDTO(v){
    return { kind: String(v.kind || ""), from: frameCell(v.from), to: frameCell(v.to) };
  }
  function animationDTO(a){
    return {
      kind: String(a.kind || ""),
      start: Number(a.start) || 0,
      duration: Number(a.duration) || 0,
      unitId: typeof a.unitId === "number" ? a.unitId : null,
      from: a.from ? frameCell(a.from) : null,
      to: a.to ? frameCell(a.to) : null,
      cell: a.cell ? frameCell(a.cell) : null,
      wType: typeof a.wType === "string" ? a.wType : "",
      damage: Number(a.damage) || 0,
      shieldStripped: Boolean(a.shieldStripped),
      shipType: typeof a.shipType === "string" ? a.shipType : "",
      targetName: typeof a.targetName === "string" ? a.targetName : ""
    };
  }

  function build(p){
    // p = { state, selUnit, isPlayerTurn } — state-shape params in, plain
    // unit slice out.
    const st = p.state;

    const unitsDTO = Array.isArray(st.units) ? st.units.map(u => ({
      id: u.id,
      type: u.type,
      team: u.team,
      x: u.x,
      y: u.y,
      hp: u.hp,
      maxHp: u.maxHp,
      move: u.move,
      firepower: u.firepower,
      range: u.range,
      scan: u.scan,
      effectiveScan: deps.getEffectiveScan(u),
      spottedByPlayer: deps.isUnitSpottedByTeam(u, 1),
      cost: u.cost,
      flags: new Set(u.flags)
    })) : [];

    const canShieldSelected = Boolean(
      p.isPlayerTurn &&
      p.selUnit &&
      p.selUnit.team === 1 &&
      st.ap > 0 &&
      deps.canShield(p.selUnit, { x: p.selUnit.x, y: p.selUnit.y })
    );

    return {
      units: unitsDTO,
      historicalVectors: Array.isArray(st.historicalVectors) ? st.historicalVectors.map(vectorDTO) : [],
      animations: Array.isArray(st.animations) ? st.animations.map(animationDTO) : [],
      canShieldSelected
    };
  }

  return { build };
});
