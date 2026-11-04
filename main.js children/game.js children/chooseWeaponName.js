"use strict";

// ============================================================
// chooseWeaponName.js — job: pick the firing mount's name — the pending choice when it names a mount, else the first mount (chooseWeaponName).
// Owner: game.js (pure child). Holds no state.
// ============================================================
// M5 adoption: the firing weapon resolved from the unit's loadout through
// the seam. One attack per turn (DESIGN §2.1). M5(c) Q8: the player's
// per-shot choice (the weapon-picker buttons) wins when it names a mount on
// this unit; otherwise the first mount fires. Null for an unarmed unit.
const chooseWeaponName = function (p){
  const ws = p.weaponNames || [];
  if (ws.length === 0) return null;
  const pending = p.pendingWeapon || { unitId: null, name: null };
  if (pending.unitId === p.unitId && pending.name){
    for (let i = 0; i < ws.length; i++){
      if (ws[i].name === pending.name) return pending.name;
    }
  }
  return ws[0].name;
};
