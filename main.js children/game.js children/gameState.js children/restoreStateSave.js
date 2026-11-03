"use strict";

// ============================================================
// restoreStateSave.js — job: restore a save payload's persisted keys onto a freshly reset container.
// Owner: gameState.js (pure). Holds no state.
// ============================================================

// The composer validates the payload and resets the container before this
// runs; here only the restored, template-known keys land. A pre-M1 payload
// (version V58-1.0, no campaign key) has its credits and income scaled ×100
// and receives a campaign section. A payload already at DATA.version is
// copied unchanged, so a current save cannot be scaled twice.
// M3 map migration: a campaign section whose map carries no location list is
// pre-map (M2-era or earlier) — the map state is built by the injected
// sibling builder and the saved anchor becomes the fleet's location. A
// payload that already carries the map passes through untouched (the
// round-trip contract is JSON identity).
const restoreStateSave = function (DATA, stateBox, data, buildMapFn){
  const PRE_M1_VERSION = "V58-1.0";
  const allowedKeys = new Set(Object.keys(DATA.initialState));

  function fromPlain(v){
    if (Array.isArray(v)) return v.map(fromPlain);
    if (v && typeof v === "object") {
      if (Array.isArray(v.__map)) return new Map(v.__map.map(([k, val]) => [k, fromPlain(val)]));
      if (Array.isArray(v.__set)) return new Set(v.__set.map(fromPlain));
      const o = {};
      Object.keys(v).forEach(k => { o[k] = fromPlain(v[k]); });
      return o;
    }
    return v;
  }

  function scaleMoney(map){
    if (!map || typeof map !== "object" || Array.isArray(map)) return map;
    const out = {};
    Object.keys(map).forEach(k => {
      out[k] = (typeof map[k] === "number") ? map[k] * 100 : map[k];
    });
    return out;
  }

  function campaignSection(){
    return {
      fleet: [],
      wallet: 0,
      cargo: { goods: 0, fuel: 0, crew: 0, parts: 0 },
      reputation: {},
      clock: { month: 1, year: 2401 },
      map: { locationId: "" }
    };
  }

  const payload = data.state || {};
  const hadCampaign = Object.prototype.hasOwnProperty.call(payload, "campaign");
  const restored = fromPlain(payload);
  Object.keys(restored).forEach(k => { if (allowedKeys.has(k)) stateBox.current[k] = restored[k]; });

  const preM1 = data.version !== DATA.version && (data.version === PRE_M1_VERSION || data.version == null);
  if (preM1) {
    const st = stateBox.current;
    if (st.credits) st.credits = scaleMoney(st.credits);
    if (st.income) st.income = scaleMoney(st.income);
  }
  if (!hadCampaign) stateBox.current.campaign = campaignSection();

  // M3 map migration (see header): rebuild the map for pre-map payloads.
  const st = stateBox.current;
  const map = st.campaign && st.campaign.map;
  if (map && !Array.isArray(map.locations) && typeof buildMapFn === "function") {
    const built = buildMapFn();
    const anchor = map.locationId;
    if (anchor && built && Array.isArray(built.locations) && Array.isArray(built.fleets)) {
      for (let i = 0; i < built.locations.length; i++) {
        const L = built.locations[i];
        if (L.id === anchor) {
          const fleets = built.fleets.map(function (f) {
            return f.faction === "player" ? Object.assign({}, f, { x: L.x, y: L.y }) : f;
          });
          built.fleets = fleets;
          built.locationId = anchor;
          break;
        }
      }
    }
    if (built) st.campaign.map = built;
  }
  return stateBox.current;
};
