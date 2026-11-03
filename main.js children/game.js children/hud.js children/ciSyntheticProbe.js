"use strict";

// ============================================================
// ciSyntheticProbe.js — job: temporary CI-gate positive-control fixture.
// Owner: hud.js. NOT FOR RELEASE — deleted at the end of the check.
// ============================================================

// Deliberate reference-policy violation for testing the CI gate:
// this comment names hudBanner.js, a file owned elsewhere in the hud
// subtree, giving it a second referrer beyond its owner (R1-inbound-cap).
function ciSyntheticProbe(){ return "synthetic-violation-fixture"; }