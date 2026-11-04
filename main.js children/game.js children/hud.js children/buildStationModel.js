"use strict";

// ============================================================
// buildStationModel.js — job: build the station storefront model (wares
// rows with posted quotes, service rows, tab + action buttons).
// Owner: hud.js. Holds no state.
//
// M4 (roadmap-design §4.4/§5.4): the station modal is the general
// storefront that replaces the bridge shop — buy/sell hulls, weapons and
// goods; buy fuel, hire crew, buy parts; repair/refit consuming parts. The
// quotes arrive as plain injected data (the parent's economy seam computed
// them; this child names nothing outside its own file) and the buttons
// carry v107 metrics.ui sizes in the standard HUD button DTO shape.
//
// StationModel (plain data):
//   { title, subtitle, walletText, tab, tabs: [{id,label,active}],
//     rows: [{ id, label, sub, priceText, ownedText, enabled }],
//     buttons: [ButtonDTO], panel: { x, y, w, h }, note }
// Button ids: STATION_TAB:<tab>, STATION_BUY:<goodKey>, STATION_SELL:<goodKey>,
// STATION_REPAIR:<shipIdx>, STATION_REFIT:<shipIdx>, STATION_CLOSE.
// ============================================================

const buildStationModel = function (station, hudDeps){
  const s = station || {};
  const d = hudDeps || {};
  const metrics = d.metrics || {};
  const DS = (typeof metrics.displaySize === "number") ? metrics.displaySize : 768;
  const US = (typeof metrics.uiScale === "number") ? metrics.uiScale : 1;
  const ui = metrics.ui || null;
  const px = function (design){ return Math.round(design * US); };

  const pad = (ui && ui.padMd) || px(18);
  const btnH = (ui && ui.buttonHMd) || px(28);
  const rowH = px(26);
  const mw = Math.min(DS - px(36), (ui && ui.endgamePanelW) || px(560));
  const headerH = px(74);
  const tabsH = px(34);
  const footerH = px(46);
  const rows = (Array.isArray(s.rows) ? s.rows : []);
  const visibleRows = rows.slice(0, 12);
  const mh = headerH + tabsH + visibleRows.length * rowH + footerH;
  const mx = Math.round((DS - mw) * 0.5);
  const my = Math.round((DS - mh) * 0.5);

  const buttons = [];
  const tabs = Array.isArray(s.tabs) ? s.tabs : [];
  const tabW = Math.min(px(120), Math.floor((mw - pad * 2) / Math.max(1, tabs.length)));
  for (let i = 0; i < tabs.length; i++){
    const t = tabs[i];
    buttons.push({
      id: "STATION_TAB:" + t.id,
      label: t.label,
      x: mx + pad + i * (tabW + px(4)),
      y: my + headerH - px(8),
      w: tabW,
      h: px(24),
      enabled: true,
      active: Boolean(t.active)
    });
  }

  const rowModels = [];
  const closeBtnW = px(96);
  for (let i = 0; i < visibleRows.length; i++){
    const r = visibleRows[i];
    const ry = my + headerH + tabsH + i * rowH;
    rowModels.push({
      id: r.id,
      label: String(r.label || ""),
      sub: String(r.sub || ""),
      priceText: String(r.priceText || ""),
      ownedText: String(r.ownedText || ""),
      y: ry,
      h: rowH
    });
    if (r.kind === "ware"){
      const half = Math.min(px(88), Math.floor((mw * 0.32) / 2));
      const rightX = mx + mw - pad - 2 * half - px(8);
      buttons.push({
        id: "STATION_BUY:" + r.id,
        label: r.buyLabel || "BUY",
        x: rightX,
        y: ry + px(2),
        w: half,
        h: rowH - px(6),
        enabled: r.canBuy !== false,
        active: false
      });
      buttons.push({
        id: "STATION_SELL:" + r.id,
        label: r.sellLabel || "SELL",
        x: rightX + half + px(8),
        y: ry + px(2),
        w: half,
        h: rowH - px(6),
        enabled: r.canSell !== false,
        active: false
      });
    } else if (r.kind === "service"){
      const half = Math.min(px(88), Math.floor((mw * 0.32) / 2));
      const rightX = mx + mw - pad - 2 * half - px(8);
      buttons.push({
        id: "STATION_REPAIR:" + r.id,
        label: "REPAIR",
        x: rightX,
        y: ry + px(2),
        w: half,
        h: rowH - px(6),
        enabled: r.canRepair !== false,
        active: false
      });
      buttons.push({
        id: "STATION_REFIT:" + r.id,
        label: "REFIT",
        x: rightX + half + px(8),
        y: ry + px(2),
        w: half,
        h: rowH - px(6),
        enabled: r.canRefit !== false,
        active: false
      });
    } else if (r.kind === "outfit"){
      // M5(d): one action button per outfit row (select a ship, mount a
      // stock weapon, unmount a mounted one) — ids come with the row.
      const bw = Math.min(px(120), Math.floor(mw * 0.3));
      buttons.push({
        id: String(r.actionId || ""),
        label: String(r.actionLabel || ""),
        x: mx + mw - pad - bw,
        y: ry + px(2),
        w: bw,
        h: rowH - px(6),
        enabled: r.canAct !== false,
        active: Boolean(r.active)
      });
    }
  }

  buttons.push({
    id: "STATION_CLOSE",
    label: "CLOSE",
    x: mx + mw - pad - closeBtnW,
    y: my + mh - btnH - px(12),
    w: closeBtnW,
    h: btnH,
    enabled: true,
    active: false
  });

  return {
    title: String(s.title || "STATION"),
    subtitle: String(s.subtitle || ""),
    walletText: String(s.walletText || ""),
    tab: s.tab || null,
    tabs: tabs.map(function (t){ return { id: t.id, label: t.label, active: Boolean(t.active) }; }),
    rows: rowModels,
    buttons: buttons,
    panel: { x: mx, y: my, w: mw, h: mh },
    note: String(s.note || "")
  };
};
