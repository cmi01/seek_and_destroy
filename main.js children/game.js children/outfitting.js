"use strict";

// ============================================================
// outfitting.js — job: compose the loadout-seam handle over its slot-math,
//   validation and reader children.
// Owner: game.js. Holds no state unless it is a core.
//
// M5 seam (roadmap-design §4.5/§5.5): this subtree is the ONLY reader of
// unit weapon stats. Battle units carry `loadout` (WeaponName[]) as their
// weapon truth; every other module asks this handle instead of reading
// weapon fields. The frozen weapon table travels in bound (the composer's
// one argument), so the handle surface matches the §5.5 signatures minus
// that table; the table stays an explicit parameter on the leaves (data in
// as data). Members are spelled off the raw child stems on purpose (the
// reference audit counts raw text).
// ============================================================

const outfitting = function (weapons){
  const W = weapons || {};
  return {
    SlotSize(weapon){ return computeSlotSize(weapon); },
    Validate(loadout, hull){ return validateLoadout(loadout, hull, W, computeSlotSize); },
    DefaultLoadout(hull){ return defaultLoadoutOf(hull, W); },
    LoadoutOf(unit){ return loadoutOf(unit); },
    UnitFirepower(unit){ return unitFirepower(unit, W); },
    UnitRange(unit){ return unitRange(unit, W); },
    UnitWeapons(unit){ return unitWeapons(unit, W); }
  };
};
