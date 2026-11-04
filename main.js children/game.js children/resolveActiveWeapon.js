"use strict";

// ============================================================
// resolveActiveWeapon.js — job: return the weapon row matching a chosen mount name, or null (resolveActiveWeapon).
// Owner: game.js (pure child). Holds no state.
// ============================================================
const resolveActiveWeapon = function (p){
  if (!p.weaponRows || !p.chosenName) return null;
  const ws = p.weaponRows;
  for (let i = 0; i < ws.length; i++){
    if (ws[i].name === p.chosenName) return ws[i];
  }
  return null;
};
