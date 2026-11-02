"use strict";

// ============================================================
// buildCampaignCards.js — job: build the campaign starmap cards — one per level, with preview units and the next-node mark.
// Owner: hud.js. Holds no state.
// ============================================================

// One card per campaign level (credits/doctrine line + preview units). Pure:
// level list + ship specs + input in, plain card list out. This file is just
// this one function; the composing parent captures the binding when it loads
// the file.
const buildCampaignCards = function (deps, input) {
  const levels = deps.campaignLevels;
  const shipSpecs = deps.shipSpecs;
  const cards = levels.map(lvl => {
    const isDone = input.state.completedLevels.includes(lvl.id);
    const previewUnits = (lvl.previewArchetypes || []).slice(0, 4).map(archName => {
      const spec = shipSpecs[archName];
      if (!spec) return null;
      return { type: archName, team: 2, hp: spec.hp, maxHp: spec.hp, flags: new Set(spec.flags) };
    }).filter(Boolean);
    return {
      id: lvl.id,
      tag: lvl.tag,
      title: lvl.title,
      desc: lvl.desc,
      creditsText: `T1: ${lvl.t1StartingCredits} ⒸB (+${lvl.t1Income}/turn) // DOCTRINE: ${lvl.aiDoctrine}`,
      isDone,
      isNext: false,
      previewUnits
    };
  });
  // Mark the first not-yet-completed sector (in campaign order) as the
  // "next available" node for distinct starmap styling. Purely visual —
  // every node stays selectable, matching the old level-select screen.
  const nextIdx = cards.findIndex(c => !c.isDone);
  if (nextIdx >= 0) cards[nextIdx].isNext = true;
  return cards;
};
