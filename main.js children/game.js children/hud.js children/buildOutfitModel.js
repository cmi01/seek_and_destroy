"use strict";

// ============================================================
// buildOutfitModel.js — job: build the station outfit tab's rows — the
//   fleet's ships, their mounted weapons and the spare-weapon stock.
// Owner: hud.js. Holds no state.
//
// M5(d) (DESIGN §3.3): slot-based outfitting at stations — swap weapons
// between hulls and mount several where they fit. Every number arrives as
// plain injected data (the parent's seam computed slot sizes and capacity
// verdicts; this file names nothing outside its own file). One action
// button per row (select a ship / mount a stock weapon / unmount a mount);
// the button ids travel on the rows.
//
// OutfitModel (plain data): { rows: [RowDTO] } where RowDTO =
//   { id, kind: "outfit", label, sub, priceText, ownedText,
//     actionId, actionLabel, canAct, active }
// ============================================================

const buildOutfitModel = function (input){
  const d = input || {};
  const fleet = Array.isArray(d.fleet) ? d.fleet : [];
  const stock = d.stock || {};
  const stats = d.stats || {};
  const selected = (typeof d.selected === "number") ? d.selected : -1;
  const rows = [];

  // One row per fleet ship: pick the ship to outfit.
  for (let i = 0; i < fleet.length; i++){
    const e = fleet[i];
    const hull = e.hull || e.type || "?";
    const load = Array.isArray(e.loadout) ? e.loadout : [];
    const used = d.usedSlots ? d.usedSlots[i] : 0;
    const cap = (d.capacities && typeof d.capacities[i] === "number") ? d.capacities[i] : 0;
    rows.push({
      id: "outfit-ship:" + i,
      kind: "outfit",
      label: String(hull).toUpperCase(),
      sub: load.length ? load.join(" + ") : "(UNARMED)",
      priceText: "SLOTS " + used + "/" + cap,
      ownedText: "",
      actionId: "OUTFIT_SELECT:" + i,
      actionLabel: selected === i ? "EDITING" : "OUTFIT",
      canAct: true,
      active: selected === i
    });
  }

  if (selected >= 0 && selected < fleet.length){
    const e = fleet[selected];
    const hull = e.hull || e.type || "?";
    const load = Array.isArray(e.loadout) ? e.loadout : [];
    const used = d.usedSlots ? d.usedSlots[selected] : 0;
    const cap = (d.capacities && typeof d.capacities[selected] === "number") ? d.capacities[selected] : 0;

    // Mounted weapons: unmount returns them to the stock.
    for (let j = 0; j < load.length; j++){
      const name = load[j];
      const st = stats[name] || {};
      rows.push({
        id: "outfit-slot:" + selected + ":" + name,
        kind: "outfit",
        label: "  " + String(name).toUpperCase(),
        sub: "D:" + (st.dmg || 0) + " R:" + (st.range || 0) + " SLOTS:" + (st.slots || 0),
        priceText: "",
        ownedText: "MOUNTED",
        actionId: "OUTFIT_UNMOUNT:" + selected + ":" + name,
        actionLabel: "UNMOUNT",
        canAct: true,
        active: false
      });
    }

    // Spare stock: mount when one is held and the loadout still fits.
    const names = Object.keys(stock).sort();
    for (let k = 0; k < names.length; k++){
      const name = names[k];
      const n = stock[name] || 0;
      if (n < 1) continue;
      const st = stats[name] || {};
      const legal = d.legalMounts ? d.legalMounts.indexOf(name) !== -1 : true;
      rows.push({
        id: "outfit-stock:" + name,
        kind: "outfit",
        label: "  " + String(name).toUpperCase(),
        sub: "D:" + (st.dmg || 0) + " R:" + (st.range || 0) + " SLOTS:" + (st.slots || 0),
        priceText: "",
        ownedText: "HELD " + n,
        actionId: "OUTFIT_MOUNT:" + selected + ":" + name,
        actionLabel: legal ? "MOUNT" : "NO FIT",
        canAct: legal,
        active: false
      });
    }
    if (names.length === 0){
      rows.push({
        id: "outfit-stock:none",
        kind: "outfit",
        label: "  NO SPARE WEAPONS IN CARGO",
        sub: "BUY WEAPONS AT THE STATION STOREFRONT",
        priceText: "",
        ownedText: "",
        actionId: "",
        actionLabel: "",
        canAct: false,
        active: false
      });
    }
  }

  return { rows: rows };
};
