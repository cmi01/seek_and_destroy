"use strict";

// ============================================================
// buildMapHudModel.js — job: build the campaign-map HUD model (map status
// line + the hailing shell geometry when an encounter is open).
// Owner: hud.js. Holds no state.
//
// Interface (roadmap-design §5.3): buildMapHudModel(mapState, hudDeps) →
// MapHudModel. hudDeps is plain injected data: { metrics, wallet, month,
// year, hail } — `hail` is the dialogue model built by the parent's other
// child (injected here as data; this child names nothing outside its own
// file). The map HUD is NOT a modal: the map stays visible behind the
// hailing shell (screen-flash policy — no full-screen overlays).
//
// MapHudModel (plain data):
//   { levelTag, turn, locationName, fuel, ships, detection,
//     encounter, hail: { visible, speaker, lines, options, panel, buttons } }
// The hail option buttons carry ids HAIL_TALK / HAIL_THREATEN / HAIL_LEAVE
// in v107 metrics.ui sizes (same button DTO shape the HUD buttons use).
// ============================================================

const buildMapHudModel = function (mapState, hudDeps){
  const m = mapState || {};
  const d = hudDeps || {};
  const metrics = d.metrics || {};
  const DS = (typeof metrics.displaySize === "number") ? metrics.displaySize : 768;
  const US = (typeof metrics.uiScale === "number") ? metrics.uiScale : 1;
  const ui = metrics.ui || null;
  const px = function (design){ return Math.round(design * US); };

  const locations = Array.isArray(m.locations) ? m.locations : [];
  let where = { name: String(m.locationId || "DEEP SPACE").toUpperCase() };
  for (let i = 0; i < locations.length; i++){
    if (locations[i].id === m.locationId){
      where = { name: String(locations[i].name || locations[i].id).toUpperCase() };
      break;
    }
  }

  const fleets = Array.isArray(m.fleets) ? m.fleets : [];
  let player = null;
  for (let i = 0; i < fleets.length; i++){
    if (fleets[i].faction === "player"){ player = fleets[i]; break; }
  }
  const ships = player && Array.isArray(player.ships) ? player.ships.length : 0;
  const fuel = player && (typeof player.fuel === "number") ? player.fuel : 0;

  const hailModel = d.hail || null;
  let hail = null;
  if (hailModel){
    const mw = Math.min(DS - px(36), (ui && ui.endgamePanelW) || px(430));
    const mh = px(150);
    const mx = Math.round((DS - mw) * 0.5);
    const my = Math.round(DS - mh - px(64));
    const options = Array.isArray(hailModel.options) ? hailModel.options : [];
    const buttons = [];
    const pad = (ui && ui.padMd) || px(18);
    const btnH = (ui && ui.buttonHMd) || px(28);
    const btnW = Math.min((ui && ui.endgameBtnW) || px(156), Math.floor((mw - pad * 2) / Math.max(1, options.length)));
    for (let i = 0; i < options.length; i++){
      buttons.push({
        id: "HAIL_" + String(options[i]).toUpperCase(),
        label: String(options[i]).toUpperCase(),
        x: mx + pad + i * (btnW + px(6)),
        y: my + mh - btnH - px(14),
        w: btnW,
        h: btnH,
        enabled: true,
        active: true
      });
    }
    hail = {
      visible: true,
      speaker: hailModel.speaker || "",
      lines: Array.isArray(hailModel.lines) ? hailModel.lines.slice() : [],
      options: options,
      panel: { x: mx, y: my, w: mw, h: mh },
      buttons: buttons
    };
  }

  // M4: the docked-station opener (bottom-right, standard button DTO). The
  // station's name travels in as plain data (hudDeps.station).
  const stationInfo = d.station || null;
  let station = null;
  if (stationInfo){
    const stW = px(140);
    const stH = (ui && ui.buttonHMd) || px(28);
    station = {
      visible: true,
      name: String(stationInfo.name || "STATION"),
      buttons: [{
        id: "STATION_OPEN",
        label: "STATION",
        x: DS - stW - px(12),
        y: DS - stH - px(12),
        w: stW,
        h: stH,
        enabled: true,
        active: false
      }]
    };
  }

  return {
    levelTag: "MAP // " + where.name,
    turn: (typeof m.turn === "number") ? m.turn : 1,
    locationName: where.name,
    fuel: fuel,
    ships: ships,
    detection: ships,
    station: station,
    encounter: m.pendingEncounter
      ? {
          kind: m.pendingEncounter.kind || "fleet",
          encounterFaction: m.pendingEncounter.encounterFaction || "",
          locationId: m.pendingEncounter.locationId || ""
        }
      : null,
    hail: hail
  };
};
