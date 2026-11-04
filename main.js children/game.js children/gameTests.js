"use strict";

// ============================================================
// gameTests.js — job: run the game-side self-tests by dispatching to
// the per-domain test-suite children through the game-side test bridge.
// Owner: game.js. Holds no state.
// ============================================================
const runGameTests = function (bridge, testName) {
  // RNG pin (T-9 flake, t_39002303): the planner's per-unit plan pick draws a
  // "mistake" roll from the seeded RNG seam — unseeded it is Math.random —
  // and a roll below the difficulty's mistake chance swaps in the 2nd-best
  // plan. Unseeded, T-9's composite-plan assertion flipped at that 12% rate
  // (observed at v139: 35/300 isolated and 3/15 full-suite runs, failing
  // detail "2-AP plan apCost: 1"; 14 of 100 seeds reproduce it).
  // clearBoard() re-seeds to the canonical fixture seed (42, pinned with its
  // observed outcomes in the test-architecture seed fixture) so every board
  // test starts from the same stream position — no cross-test RNG drift —
  // and the runner tail restores the caller's RNG afterwards.
  const callerRng = bridge.state.rng;
  const callerRngSeed = bridge.state.rngSeed;
  const restoreRng = function () {
    bridge.state.rng = callerRng;
    bridge.state.rngSeed = callerRngSeed;
  };

  const runAllSuites = function () {
    const results = [].concat(
      campaignSuite(bridge),
      battleSuite(bridge),
      mapSuite(bridge),
      economySuite(bridge),
      outfittingSuite(bridge),
      factionSuite(bridge),
      missionSuite(bridge)
    );
      console.log("%cSEEK & DESTROY â€” AI + ZOOM SELF-TEST RESULTS", "color:#facc15;font-size:14px;");
      let allPass = true;
      results.forEach(r => {
        const colour = r.pass ? "#34d399" : "#f43f5e";
        console.log("%c" + (r.pass ? "PASS" : "FAIL") + "  " + r.name + "  â€”  " + r.detail, "color:" + colour + ";");
        if (!r.pass) allPass = false;
      });
      console.log(allPass ? "%cALL GAME TESTS PASSED (" + results.length + "/" + results.length + ")" : "%cSOME GAME TESTS FAILED", "color:" + (allPass ? "#34d399" : "#f43f5e") + ";font-weight:bold;");
      return results;
  };

  // Single-test dispatch: the legacy suite key set, routed to the owning
  // suite child. The legacy clearBoard/aiTurnSync helper keys ride with the
  // suite that carries the shared helper copies (exact legacy behaviour: run
  // the helper and return its value).
  const runNamed = function (name) {
    if (
      name === "clearBoard"
      || name === "aiTurnSync"
      || name === "testSummonCostsOneAp"
      || name === "testMirageAnyHitDestroys"
      || name === "testMirageRamDestroysBoth"
      || name === "testFlagshipLostCampaignOver"
      || name === "testBattleCarryOver"
      || name === "testLifetimeMapCoversInitialState"
      || name === "testLivePathCarryOver"
      || name === "testBattleCreditsFrozen"
      || name === "testDeploymentChoiceForcesFlagship"
      || name === "testKiting"
      || name === "testFlagshipGuard"
      || name === "testFocusFire"
      || name === "testDoctrine"
      || name === "testFlagshipShieldAlwaysUp"
      || name === "testRailgunAvoidance"
      || name === "testFleeWhenOutgunned"
      || name === "testRecedingHorizon"
      || name === "testBudgetAwarePlanning"
      || name === "testZoomAnchor"
      || name === "testZoomClamp"
      || name === "testShieldReraiseRule"
    )
      return { owned: true, value: battleSuite(bridge, name) };
    if (
      name === "testCampaignRosterConformance"
      || name === "testCampaignStateRoundTrip"
      || name === "testCampaignV99SaveMigration"
    )
      return { owned: true, value: campaignSuite(bridge, name) };
    if (
      name === "testMapFuelFormula"
      || name === "testMapUnfuelledMoveRejected"
      || name === "testMapFlagshipCrewGate"
      || name === "testMapSlowestShipCapsMove"
      || name === "testMapFrozenDuringBattle"
      || name === "testMapSaveRoundTripAndMigration"
      || name === "testMapJumpTransit"
      || name === "testMapJumpPointRules"
      || name === "testMapJumpUnfuelled"
      || name === "testMapFrameDto"
      || name === "testMapDetectionRadius"
      || name === "testNebulaHidesBattles"
      || name === "testMapEncounterOpensOnEntry"
      || name === "testMapJoinNextTurnQ4"
      || name === "testMapEncounterNextTurnLaunch"
      || name === "testMapHudAndHailModels"
    )
      return { owned: true, value: mapSuite(bridge, name) };
    if (
      name === "testMarketPriceDeterminism"
      || name === "testSpreadRoundTrip"
      || name === "testTradeHullConsistency"
      || name === "testTradeRejections"
      || name === "testStationModel"
      || name === "testRepairRefitParts"
      || name === "testStationHullBuySaveRoundTrip"
      || name === "testCrewCasualtyFormula"
      || name === "testCrewStatusGate"
      || name === "testWagesMonthTick"
      || name === "testMerchantFlowRescue"
      || name === "testMerchantSaleDiscount"
    )
      return { owned: true, value: economySuite(bridge, name) };
    if (
      name === "testOutfitSlotFormula"
      || name === "testOutfitValidationCapacity"
      || name === "testOutfitDefaultsFit"
      || name === "testOutfitReaderParity"
      || name === "testOutfitReaderCopies"
      || name === "testBattleUnitLoadoutTruth"
      || name === "testWeaponClassShieldBreak"
      || name === "testSaveLoadoutMigration"
      || name === "testMultiWeaponFire"
      || name === "testRedNumbersChosenWeapon"
      || name === "testRedNumbersShieldedTarget"
      || name === "testOutfitStationFlow"
      || name === "testGeneratorLegalLoadoutSweep"
      || name === "testOutfitModelRows"
    )
      return { owned: true, value: outfittingSuite(bridge, name) };
    if (
      name === "testFactionFleetRolls"
      || name === "testFactionDoctrineStats"
      || name === "testFactionTableComplete"
      || name === "testReputationBands"
      || name === "testStanceAndSharing"
      || name === "testReputationEvents"
    )
      return { owned: true, value: factionSuite(bridge, name) };
    if (
      name === "testDialogueModel"
      || name === "testDialogueOutcome"
      || name === "testHailPanel"
      || name === "testMissionBoard"
      || name === "testMissionPayout"
      || name === "testMissionChainComplete"
      || name === "testSaveMigration"
      || name === "testNpcMapInteraction"
    )
      return { owned: true, value: missionSuite(bridge, name) };
    return { owned: false };
  };

  if (testName && testName !== "runAll") {
    const r = runNamed(testName);
    if (r.owned) { try { return r.value; } finally { restoreRng(); } }
  }
  try { return runAllSuites(); } finally { restoreRng(); }
};
// Loading convention: this file defines runGameTests at top level; the owner
// captures it after the boot list resolves.
