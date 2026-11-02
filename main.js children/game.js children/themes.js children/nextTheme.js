"use strict";

// ============================================================
// nextTheme.js — job: return the theme key after a resolved key in the cycle order.
// Owner: themes.js (pure). Holds no state.
// ============================================================

// `key` is already normalized by the composer (a member of `order`).
const nextTheme = function (order, key){
  const i = order.indexOf(key);
  return order[(i + 1) % order.length];
};
