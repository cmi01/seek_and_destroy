"use strict";

// ============================================================
// aiPriorities_DATA.js — job: hold the AI priorities table.
// Owner: ai/ai.js. Holds no state unless it is a core.
// ============================================================

getAIAction._register("prioritiesData", {
  "version": "V35-1.0",
  "schema": "seek-and-destroy.ai-priorities",
  "description": "Declarative AI priority tables, tactical scoring weights, doctrine profiles, target valuation rules, threat forecasting coefficients, movement heuristics, preservation tiers, and reinforcement counter-pick orders consumed exclusively by ai.js.",
  "tuning": {
    "compositeApCost": 2,
    "seqCost": 35,
    "killBonus": 120,
    "overkillPenalty": 180,
    "finisherBonus": 90,
    "moveShootMaxDests": 40,
    "maxTargets": 12,
    "beliefDecay": 0.75,
    "beliefMinConfidence": 0.15,
    "beliefMaxAgeTurns": 4,
    "nebulaBaseP": 0.02,
    "nebulaVectorP": 0.05,
    "nebulaRiskPenalty": 25,
    "notes": {
      "compositeApCost": "AP cost of a composite MOVE->SHOOT or MOVE->CAPTURE plan (2 = parity with player).",
      "seqCost": "Friction subtracted per extra step so a decisive single action beats a marginal multi-step combo.",
      "killBonus": "Additional score awarded to MOVE->SHOOT plans that immediately destroy the target hull.",
      "overkillPenalty": "Score penalty applied when firing at a target whose remaining effective HP is already reserved.",
      "finisherBonus": "Bonus awarded to the follow-up attacker that completes a reserved focus-fire kill.",
      "moveShootMaxDests": "Maximum candidate destination cells evaluated per unit during composite MOVE->SHOOT planning.",
      "maxTargets": "Maximum prioritized hostile contacts evaluated during composite multi-step plan generation.",
      "beliefDecay": "Per-turn multiplicative confidence decay applied to unspotted contact tracks in lastSeenEnemies.",
      "beliefMinConfidence": "Minimum confidence threshold required for a contact memory to remain active.",
      "beliefMaxAgeTurns": "Maximum turns an unspotted contact memory persists before expiring.",
      "nebulaBaseP": "Baseline probability increment per adjacent unspotted nebula cell.",
      "nebulaVectorP": "Additional probability increment accounting for extrapolated hostile vector into nebula cover.",
      "nebulaRiskPenalty": "Movement score penalty multiplier applied to nebula ambush probability at destination."
    }
  },
  "doctrines": {
    "defaultDoctrine": "DEFENSIVE_HOLD",
    "weights": {
      "DEFENSIVE_HOLD": {
        "leash": 2.5,
        "unboundedLeash": false,
        "aggression": 0.35,
        "screen": 1.4,
        "standoff": 1.2,
        "summary": "Tight perimeter around capital ships; prioritizes flagship screening and cautious standoff fire."
      },
      "AGGRESSIVE_SWARM": {
        "leash": null,
        "unboundedLeash": true,
        "aggression": 1.6,
        "screen": 0.5,
        "standoff": 0.6,
        "summary": "Unbounded pursuit across the sector; maximizes closing velocity, flanking, and close-range alpha strikes."
      },
      "ARTILLERY_SCREEN": {
        "leash": null,
        "unboundedLeash": true,
        "aggression": 0.7,
        "screen": 1.3,
        "standoff": 1.8,
        "summary": "Maintains maximum weapon range bands while screening long-range missile batteries with forward pickets."
      },
      "APEX_ARMADA": {
        "leash": null,
        "unboundedLeash": true,
        "aggression": 1.2,
        "screen": 1.5,
        "standoff": 1.0,
        "summary": "Balanced dreadnought advance combining heavy escort screening with decisive spinal railgun pressure."
      }
    },
    "purchaseOrders": {
      "DEFENSIVE_HOLD": [
        "Attack Frigate",
        "Light Cruiser",
        "Probe"
      ],
      "AGGRESSIVE_SWARM": [
        "Fighter",
        "Bomber",
        "Boarding APC",
        "Attack Destroyer"
      ],
      "ARTILLERY_SCREEN": [
        "Missile Destroyer",
        "Missile Cruiser",
        "Missile Battleship"
      ],
      "APEX_ARMADA": [
        "Railgun Cruiser",
        "Heavy Cruiser",
        "Battleship",
        "Battlecruiser"
      ]
    }
  },
  "masterPreChecks": {
    "priorityOrder": [
      "FLAGSHIELD",
      "ALPHA_STRIKE_DETECTION",
      "FLEE_WHEN_OUTGUNNED",
      "UNIT_PLAN_COMPETITION",
      "COMBAT_WARP_REINFORCEMENT"
    ],
    "flagshield": {
      "enabled": true,
      "apCost": 1,
      "forcedScore": 9999,
      "requireUnshielded": true,
      "requireGeneratorReady": true,
      "triggerOnCurrentThreat": true,
      "triggerOnProjectedThreat": true,
      "description": "Forces immediate shield regeneration on the AI flagship whenever current or projected threat is positive."
    },
    "alphaStrikeDetection": {
      "enabled": true,
      "shieldEffectiveHpBonus": 1,
      "description": "Sets aiEmergencyMode when combined unspent firepower of enemies currently able to shoot the flagship meets or exceeds flagship effective HP."
    },
    "fleeWhenOutgunned": {
      "enabled": true,
      "retreatScore": 8000,
      "singleMoveApCost": 1,
      "shootThenMoveApCost": 2,
      "minApForShootBeforeRetreat": 2,
      "requireUnshieldedTargetForPreRetreatShot": true,
      "description": "Orders the flagship to retreat to the highest-scoring safe cell when incoming flagship threats cannot all be eliminated within remaining AP."
    }
  },
  "threatEvaluation": {
    "directFirepowerMultiplier": 14,
    "projectedFirepowerMultiplier": 14,
    "projectedThreatDiscount": 0.4,
    "railgunVsShieldBonus": 60,
    "projectedRailgunBonus": 40,
    "spaceMarinesHighCostBonus": 80,
    "spaceMarinesTargetCostMin": 25,
    "enemyFlagshipThreatOffset": -40,
    "beliefThreatMaxDistance": 6.0,
    "beliefThreatConfidenceMultiplier": 15,
    "nebulaBeliefProximityRadius": 2.0,
    "nebulaBeliefConfidenceWeight": 0.25,
    "nebulaAdjacentSearchRadius": 1,
    "notes": {
      "directFirepowerMultiplier": "Base threat per point of enemy firepower when the enemy can shoot the cell immediately.",
      "projectedThreatDiscount": "Discount factor applied to enemy firepower when the enemy can only reach firing position after moving.",
      "railgunVsShieldBonus": "Extra threat when a #railgun enemy can immediately fire on a shielded friendly unit.",
      "spaceMarinesHighCostBonus": "Extra threat when an enemy #space marines boarding vessel threatens a hull costing at least 25 credits."
    }
  },
  "roleValuation": {
    "flagshipBaseValue": 600,
    "costMultiplier": 4.0,
    "defaultBaseOffset": 15,
    "capitalShipBaseOffset": 60,
    "scannerScanThreshold": 5,
    "scannerBaseOffset": 70,
    "spaceMarinesBaseOffset": 55,
    "railgunBaseOffset": 50,
    "missingHpBonusMultiplier": 0.5,
    "exhaustedAttackerUrgencyMultiplier": 0.8,
    "readyAttackerUrgencyMultiplier": 1.3,
    "boardingCounterProximityMaxDist": 1.5,
    "boardingCounterUrgencyBonus": 300,
    "notes": {
      "flagshipBaseValue": "Static base strategic value assigned to any hostile !flagship command vessel.",
      "missingHpBonusMultiplier": "Scales target value up by up to +50% as target HP drops toward zero, encouraging focus fire on wounded hulls.",
      "boardingCounterUrgencyBonus": "Emergency priority boost applied to hostile #space marines positioned within 1.5 cells of a non-flagship ally."
    }
  },
  "targetPriorities": {
    "highFirepowerThreshold": 7,
    "highFirepowerBonus": 35,
    "capture": {
      "costMultiplier": 4.0,
      "baseBonus": 40,
      "enemyFlagshipDistanceCap": 6.0,
      "enemyFlagshipProximityPenaltyPerCell": 60
    },
    "killConfirmation": {
      "unreservedKillCostMultiplier": 6.0,
      "unreservedKillBaseBonus": 120,
      "reservedFinisherBonus": 90,
      "shieldedNonRailgunEffectiveDamage": 1
    },
    "shieldInteraction": {
      "railgunBypassBonus": 110,
      "lowFirepowerStripperMaxFp": 3,
      "lowFirepowerStripperBonus": 160,
      "comboStripperMinAp": 2,
      "comboWithStripperAvailableBonus": 200,
      "waitForStripperPenalty": 140
    },
    "flagshipDefense": {
      "threatToFlagshipWeight": 0.6,
      "lethalToFlagshipOverrideBonus": 500,
      "flagshipShieldEffectiveHpBonus": 1
    },
    "scannerElimination": {
      "requireZeroRailgunDangerZones": true,
      "baseSpottingBonus": 200,
      "perEffectiveScanBonus": 30,
      "probeTypeName": "Probe",
      "probeExtraBonus": 250
    },
    "railgunKillPriorityBands": {
      "inDangerRadiusBonus": 1000,
      "nearBandOffset": 4.0,
      "nearBandBonus": 600,
      "midBandOffset": 8.0,
      "midBandBonus": 300,
      "farBandBonus": 100
    }
  },
  "shieldPriorities": {
    "flagshipBaseScore": 580,
    "hullCostMultiplier": 3.2,
    "threatenedBonus": 90,
    "unthreatenedBonus": 10,
    "threatRangeBuffer": 1.0
  },
  "preservation": {
    "tiers": {
      "flagship": 4,
      "capitalShip": 3,
      "highCostHull": 2,
      "expendableHull": 1
    },
    "highCostThreshold": 25,
    "retreatHpThresholds": {
      "1": 0.15,
      "2": 0.30,
      "3": 0.45,
      "4": 0.60
    },
    "sacrificeOrdering": {
      "maxSacrificeTier": 1,
      "threatAcceptanceRefundWeight": 0.15
    }
  },
  "movementPriorities": {
    "killBand": {
      "baseBonus": 95,
      "description": "Rewards destinations from which an unspent armed unit has line of sight and range to shoot a spotted enemy."
    },
    "approach": {
      "distanceDeltaMultiplier": 22,
      "enemyFlagshipObjectiveMultiplier": 3,
      "standardObjectiveMultiplier": 1,
      "minBeliefConfidenceWeight": 0.2,
      "description": "Rewards closing distance toward spotted enemies (especially hostile flagships) or active belief tracks."
    },
    "activeEscort": {
      "baseBonus": 60,
      "description": "Rewards friendly warships that move into firing position against enemies threatening the AI flagship."
    },
    "tieredRetreat": {
      "triggerHpRatioMax": 0.75,
      "criticalHpRatioMax": 0.25,
      "criticalRetreatMultiplier": 80,
      "moderateHpRatioMax": 0.50,
      "moderateRetreatMultiplier": 40,
      "lightRetreatMultiplier": 20,
      "defensiveDoctrineScale": 1.2,
      "aggressiveDoctrineScale": 0.6,
      "defensiveAggressionThreshold": 1.0
    },
    "standoffBand": {
      "idealRangeInset": 0.5,
      "minIdealRange": 1.0,
      "bandTolerance": 1.0,
      "baseBonus": 25
    },
    "nebulaSearchAndCover": {
      "unspottedAdjacentNebulaBonus": 20,
      "destinationInNebulaBonus": 12
    },
    "warpLocusGuard": {
      "baseBonus": 15
    },
    "hazardsAndConstraints": {
      "threatPenaltyWeight": 0.5,
      "leashViolationPenalty": 60,
      "flagshipRailgunDangerZonePenalty": 500
    }
  },
  "endurancePriorities": {
    "canStillShootNextTurnBonus": 25,
    "threatBelowCurrentHpBonus": 20
  },
  "planGeneration": {
    "defaultReachableCap": 48,
    "singleMove": {
      "flagshipReachableCap": 96,
      "standardReachableCap": 12,
      "flagshipLeastThreatFallbackCount": 3,
      "moveInRangeNoAttackPenalty": 250,
      "description": "Score penalty for a bare MOVE plan whose destination ends within the mover's weapon range of a spotted enemy the plan will not attack this turn. Discourages advancing into firing range without shooting; composite MOVE->SHOOT plans carry the attack and are never penalized."
    },
    "compositeMoveShoot": {
      "minLookaheadDepth": 2,
      "maxDestinations": 40,
      "maxTargets": 12
    },
    "compositeMoveCapture": {
      "minLookaheadDepth": 2,
      "reachableCap": 16,
      "captureRange": 1.0
    },
    "compositeShootMoveShoot": {
      "apCost": 3,
      "minBudget": 3,
      "minLookaheadDepth": 2,
      "reachableCap": 12,
      "maxTargets": 12,
      "seqCostMultiplier": 2
    },
    "mistakeFilter": {
      "criticalScoreFloor": 5000,
      "fallbackPlanIndex": 1
    },
    "trace": {
      "maxEntries": 5
    }
  },
  "retreatEvaluation": {
    "reachableCap": 96,
    "outsideEnemyScanBonus": 200,
    "insideEnemyScanPenaltyPerCell": 100,
    "railgunZoneDistanceBonusCap": 300,
    "railgunZoneDistanceMultiplier": 20,
    "threatPenaltyWeight": 0.5
  },
  "escortAndFleetCoordination": {
    "escortImmediateShootBonus": 200,
    "escortRailgunPrioritySortWeight": 1000
  },
  "reinforcement": {
    "minCreditsForWarpCheck": 15,
    "minApForWarpCheck": 1,
    "competingPlanScoreThreshold": 350,
    "flagshipThreatenedWarpScore": 400,
    "standardWarpBaseScore": 120,
    "standardWarpCostMultiplier": 2.0,
    "capitalLocusCostMultiplier": 1.0,
    "emergencyLocusRadius": 3,
    "emergencyLocusCostMultiplier": 1.5,
    "fleetGap": {
      "flagshipThreatRangeBuffer": 1.0,
      "scoutMinScan": 5,
      "excludedScoutType": "Flagship Battlecruiser",
      "longRangeMinRange": 6,
      "aaMinFirepower": 4
    },
    "counterPicks": {
      "flagshipThreatened": "Attack Frigate",
      "lacksScout": "Probe",
      "lacksLongRange": "Missile Cruiser",
      "lacksBoarding": "Boarding APC"
    }
  },
  "memoryAndInvariants": {
    "maxHeadingStep": 3,
    "emptyVisibleCellMaxConfidence": 0.5,
    "maxBeliefMapEntries": 64,
    "defaultGridSize": 32,
    "defaultSpawnRadius": 6,
    "losRayStepsPerCell": 16,
    "nebulaEffectiveScan": 1,
    "nebulaProximitySpottingDist": 1.0,
    "rangeEpsilon": 0.000001
  },
  "shipRoleProfiles": {
    "Flagship Battlecruiser": {
      "role": "COMMAND_LOCUS",
      "preservationTier": 4,
      "baseTargetPriority": 600,
      "notes": "Primary Syndicate command locus; triggers immediate shield regeneration when threatened and emergency retreat when outgunned."
    },
    "Battleship": {
      "role": "SPINAL_DREADNOUGHT",
      "preservationTier": 3,
      "baseTargetPriority": 260,
      "notes": "Heavy capital ship armed with tier-2 spinal railgun and boarding marines; key locus for forward fleet reinforcement."
    },
    "Missile Battleship": {
      "role": "STANDOFF_ARTILLERY_CAPITAL",
      "preservationTier": 3,
      "baseTargetPriority": 240,
      "notes": "Long-range R:8 capital missile platform; excels under ARTILLERY_SCREEN doctrine behind forward sensor pickets."
    },
    "Battlecruiser": {
      "role": "FLEET_CARRIER_CRUISER",
      "preservationTier": 3,
      "baseTargetPriority": 200,
      "notes": "Mobile capital warp locus with heavy PDC batteries; anchors mid-board control and reinforcement deployment."
    },
    "Railgun Cruiser": {
      "role": "SHIELD_BREAKER",
      "preservationTier": 2,
      "baseTargetPriority": 150,
      "notes": "High-firepower spinal railgun cruiser; prioritized by AI when targeting shielded enemy capitals and by flagship avoidance."
    },
    "Heavy Cruiser": {
      "role": "ARMORED_LINE_CRUISER",
      "preservationTier": 2,
      "baseTargetPriority": 150,
      "notes": "High-HP railgun cruiser capable of absorbing frontline fire while breaking enemy shield bubbles."
    },
    "Missile Cruiser": {
      "role": "LONG_RANGE_FIRE_SUPPORT",
      "preservationTier": 2,
      "baseTargetPriority": 115,
      "notes": "Preferred reinforcement counter-pick when the AI fleet lacks R>=6 standoff artillery."
    },
    "Light Cruiser": {
      "role": "ESCORT_SCREEN_CRUISER",
      "preservationTier": 1,
      "baseTargetPriority": 95,
      "notes": "Versatile shielded cruiser with FP:3 PDCs ideal for stripping enemy shields before capital salvos."
    },
    "Railgun Destroyer": {
      "role": "GLASS_CANNON_SNIPER",
      "preservationTier": 1,
      "baseTargetPriority": 130,
      "notes": "Fast spinal railgun destroyer; high threat to shielded flagships despite modest hull integrity."
    },
    "Missile Destroyer": {
      "role": "ARTILLERY_PICKET",
      "preservationTier": 1,
      "baseTargetPriority": 95,
      "notes": "Mobile R:8 missile platform used in ARTILLERY_SCREEN purchase orders."
    },
    "Attack Destroyer": {
      "role": "FLANKING_STRIKE_DESTROYER",
      "preservationTier": 1,
      "baseTargetPriority": 75,
      "notes": "Fast unshielded gunship favored by AGGRESSIVE_SWARM for closing distance and finishing damaged hulls."
    },
    "Missile Frigate": {
      "role": "LIGHT_STANDOFF_ESCORT",
      "preservationTier": 1,
      "baseTargetPriority": 75,
      "notes": "Shielded R:8 frigate with R:5 sensors; combines scouting with long-range shield-stripping fire."
    },
    "Attack Frigate": {
      "role": "EMERGENCY_FLAGSHIP_ESCORT",
      "preservationTier": 1,
      "baseTargetPriority": 85,
      "notes": "Primary emergency reinforcement pick when the AI flagship is under direct threat."
    },
    "Boarding APC": {
      "role": "MARINE_ASSAULT_TRANSPORT",
      "preservationTier": 1,
      "baseTargetPriority": 95,
      "notes": "Carries #space marines to capture high-value non-flagship enemy hulls; triggers +300 emergency counter-priority when adjacent."
    },
    "Bomber": {
      "role": "ALPHA_STRIKE_ORDNANCE",
      "preservationTier": 1,
      "baseTargetPriority": 55,
      "notes": "Fragile close-range missile strike craft (FP:7) used in AGGRESSIVE_SWARM wolfpacks."
    },
    "Probe": {
      "role": "RECONNAISSANCE_PICKET",
      "preservationTier": 1,
      "baseTargetPriority": 90,
      "notes": "Unarmed R:8 sensor craft; prioritized for elimination (+250 bonus) when spotting the AI flagship."
    },
    "Fighter": {
      "role": "INTERCEPTOR_SWARM",
      "preservationTier": 1,
      "baseTargetPriority": 35,
      "notes": "High-mobility M:9 interceptor used to chase kiting enemies, sweep nebulae, and strip shields."
    },
    "Shuttle": {
      "role": "EXPENDABLE_DECOY",
      "preservationTier": 1,
      "baseTargetPriority": 15,
      "notes": "Low-cost (5c, S:5) auxiliary scout craft; lowest preservation tier (accepts additional threat during sacrifice ordering)."
    }
  },
  "priorityDocumentation": {
    "tier1Survival": [
      "1. Flagship Shield Regeneration (score 9999): Immediate 1 AP self-shield if the flagship is unshielded, has a ready #shield generator, and faces current or projected hostile threat.",
      "2. Alpha-Strike Emergency Detection: Raises aiEmergencyMode if spotted unspent enemies currently in firing range can deal damage >= flagship effective HP.",
      "3. Outgunned Flagship Retreat (score 8000): If spotted threats to the flagship cannot all be destroyed with remaining AP, the flagship retreats to the safest reachable cell (firing an opportunistic 1 AP shot first when AP >= 2)."
    ],
    "tier2LethalAndCriticalTargets": [
      "4. Lethal Flagship Threat Override (+500): Any enemy currently able to shoot and destroy the AI flagship in one salvo receives top target priority.",
      "5. Railgun Danger Zone Elimination (+100 to +1000): Hostile #railgun vessels within move+range of the AI flagship receive +1000 priority (+600 within +4 cells, +300 within +8 cells).",
      "6. Anti-Boarding Emergency Counter (+300): Hostile #space marines adjacent (d <= 1.5) to any capturable friendly vessel are prioritized before they can board.",
      "7. Unreserved Kill Confirmation (cost*6 + 120) and Focus-Fire Finisher (+90): Prioritizes securing immediate hull destructions while penalizing overkill (-180) on already-doomed targets."
    ],
    "tier3TacticalSynergyAndPositioning": [
      "8. Shield-Strip Sequencing (+160 / +200 / -140): Low-firepower ships (FP <= 3) strip enemy +shield bubbles (+160) so heavy hitters can follow up (+200 when 2+ AP and a stripper ally is ready, -140 if heavy hitter would waste its shot before the stripper fires).",
      "9. Flagship Spotting Elimination (+200 + 30*scan, +250 for Probe): When no railgun danger zones are active, eliminates forward enemy scouts spotting the AI flagship.",
      "10. Doctrine-Weighted Maneuver & Reinforcement: Balances kill-band positioning, objective approach, active escort screening, tiered HP retreat, nebula reconnaissance, and role-aware warp-in reinforcements."
    ]
  }
});
