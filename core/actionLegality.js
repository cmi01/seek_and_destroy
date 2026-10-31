"use strict";

// ============================================================
// actionLegality.js — job: decide action legality from evidence.
// Owner: core/game.js. Holds no state unless it is a core.
// ============================================================
Game._registerModule("actionLegality", () => {
  // Flags are a Set on live units and an Array in SHIP_SPECS / test fixtures.
  function hasFlag(unit, flag){
    if (!unit || !unit.flags) return false;
    return typeof unit.flags.has === "function" ? unit.flags.has(flag) : unit.flags.includes(flag);
  }

  // Every function decides from plain evidence its parent fetched from the
  // query children — this file never touches the board.
  //   canMove    ev = { inMoveRange, losClear, occ, occSpotted }
  //   canShoot   ev = { inWeaponRange, occ, occSpotted, losClear }
  //   canCapture ev = { inBoardRange, occ, occSpotted }
  //   canShield  ev = { ap }
  function canMove(unitA, B, ev){
    if (!unitA || unitA.hp <= 0 || unitA.flags.has("-moved") || unitA.move <= 0) return false;
    if (!ev.inMoveRange) return false;
    if (unitA.x === B.x && unitA.y === B.y) return false;
    if (!ev.losClear) return false;
    const occ = ev.occ;
    if (occ){
      if (occ.team === unitA.team) return false;
      if (ev.occSpotted) return false;
    }
    return true;
  }

  function canCapture(unitA, B, ev){
    if (!unitA || unitA.hp <= 0) return false;
    if (!unitA.flags.has("#space marines") || unitA.flags.has("-sent boarding party")) return false;
    if (!ev.inBoardRange) return false;
    const occ = ev.occ;
    if (!occ || occ.team === unitA.team) return false;
    if (!ev.occSpotted) return false;
    if (occ.flags.has("!flagship")) return false;
    return true;
  }

  function canShoot(unitA, B, ev){
    if (!unitA || unitA.hp <= 0) return false;
    if (unitA.firepower <= 0 || unitA.flags.has("-attacked") || unitA.range <= 0) return false;
    if (!ev.inWeaponRange) return false;
    const occ = ev.occ;
    if (!occ || occ.team === unitA.team) return false;
    if (!ev.occSpotted) return false;
    if (!ev.losClear) return false;
    return true;
  }

  function canShield(unitA, B, ev){
    if (!unitA || unitA.hp <= 0 || !B) return false;
    if (typeof ev.ap === "number" && ev.ap <= 0) return false;
    if (unitA.x !== B.x || unitA.y !== B.y) return false;
    if (!hasFlag(unitA, "#shield generator")) return false;
    if (hasFlag(unitA, "+shield") || hasFlag(unitA, "-shielded")) return false;
    return true;
  }

  // evidence = { move, shoot, capture, shield } — one plain evidence bundle
  // per candidate action, assembled by the parent for the same cell.
  function getPriorityActionAt(unitA, gx, gy, evidence, opts){
    if (!unitA || unitA.hp <= 0) return null;
    const B = { x: gx, y: gy };
    const ev = evidence || {};
    if (canMove(unitA, B, ev.move || {})) return "MOVE";
    if (opts && opts.preferShoot && canShoot(unitA, B, ev.shoot || {})) return "SHOOT";
    if (opts && opts.preferCapture && canCapture(unitA, B, ev.capture || {})) return "CAPTURE";
    if (canCapture(unitA, B, ev.capture || {})) return "CAPTURE";
    if (canShoot(unitA, B, ev.shoot || {})) return "SHOOT";
    if (canShield(unitA, B, ev.shield || {})) return "SHIELD";
    return null;
  }

  return {
    canMove,
    canCapture,
    canShoot,
    canShield,
    getPriorityActionAt
  };
});
