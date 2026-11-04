"use strict";

// ============================================================
// game.js — job: own all authoritative state, rules and turn flow.
// Owner: core (loaded by main.js). Holds no state unless it is a core.
// ============================================================
const Game = (() => {
const _modules = {
  rulesData: null,
  campaignData: null,
  beginningGameStateData: null,
  themesData: null,
  hud: null,
  ai: null,
  tests: null
};

const _stateBox = { current: null };
// Game-owned HUD view-model + priority-banner memo (state lives in the core,
// §3): hud.js is pure — it computes replacements as plain data and Game
// applies them (see the RESULT SHAPE documented at the top of hud.js).
let _hudView = null;
let _hudCache = { priorityKey: "", priorityLabel: null, hoveredSpotted: false };
let _battleSnapshot = null;
// D2 fix: dead hulls are removed from State.units the moment they die (the
// reaper below), so the fold can NOT count `hp <= 0` rows — that count was
// always 0 and the kill/destroy hooks never fired. This running counter is
// the count source: each reaped hull is tallied per side as it leaves the
// board (mirages are warp signatures, not hulls, and do not count).
let _battleDeaths = { 1: 0, 2: 0 };
let _pendingDeploy = null;
// M5(c) per-shot weapon choice (Q8): the player picks which mounted weapon
// fires on a unit's one attack per turn. Game-owned transient UI state (like
// _hudView): keyed by unit id so switching selection never loses a choice.
let _pendingWeapon = { unitId: null, name: null };
// M6(c): how many times the player has asked the open hail to talk — the
// dialogue line cursor (Game-owned transient, like _pendingWeapon).
let _hailTalkCount = 0;

let RULES_DATA = null;
let CAMPAIGN_DATA = null;
let BEGINNING_GAME_STATE_DATA = null;
let THEME_DATA = null;

let InitializeGameState = null;
let InitializeCampaign = null;
let CampaignLib = null;
let CampaignMapLib = null;
let EconomyLib = null;
let GetGameState = null;
let TryPatchGameState = null;
let GetStateLifetimes = null;
let SerializeGameState = null;
let DeserializeGameState = null;

// The Rules handle: the composed rules surface over the pure rule children
// (config values, board/LOS/vision queries, evidence-composed decisions).
// The AI snapshot facade (PURE_RULES) and the SD debug handle read it.
let Rules = null;
// The pure rule children (single job each, registered below at load time).
let RulesConfig = null;
let BoardQueries = null;
let LineOfSight = null;
let VisionQueries = null;
let ActionLegality = null;
let CombatMath = null;
let Outfitting = null;
let Factions = null;
let Reputation = null;
let Missions = null;
let ReservePlacement = null;
let EndgameStatus = null;
// The pure game.js children (single job each, registered below at load time).
let CameraMath = null;
let SelectionQueries = null;
let VisibilityCache = null;
// The sector-generation composer's handle (bound at load; Game keeps the
// stateful orchestrator around it).
let SectorGeneratorLib = null;
// The render-frame build children (v89): one pure child per frame domain;
// buildFrame composes their slices into the render-frame DTO.
let FrameBoard = null;
let FrameUnits = null;
let FrameOverlay = null;
let FrameCursor = null;
let FrameStatus = null;
// Frozen plain-data facade of the pure rule queries, handed to the AI on the
// snapshot DTO instead of the Rules module identity (built once in load()).
let PURE_RULES = null;
let Themes = null;
let HudLib = null;   // the pure hud function library (hud.js)
let getAIAction = null;

// ---- Constants: views onto the single source of truth (data/*_DATA.js) ----
// Populated inside Game.load() once data/*_DATA.js have been loaded.
let GRID_SIZE = 32;
let SPAWN_RADIUS = 2;
let MAX_AP = 4;
let ENEMY_ACTION_INTERVAL_MS = 380;
let DIFFICULTY = "NORMAL";
let DIFFICULTY_TABLE = null;
let SHIP_SPECS = null;
let CAMPAIGN_LEVELS = null;

// ---- State ----------------------------------------------------------------
// A thin view over the ONE authoritative object owned by gameState.js (no
// second copy, no boot-time sync). Reads return live values; a top-level
// write `State.x = v` is validated by TryPatchGameState. Rejected writes are
// reported and ignored (never a silent split-brain, never a strict-mode
// TypeError). Nested entities (units, terrain rows) are mutated in place by
// Actions by design.
function _ensureAudioSettingsObject(st){
  if (!st) return null;
  if (!st.audioSettings || typeof st.audioSettings !== "object"){
    st.audioSettings = {
      master: 0.75,
      buses: { UI: 0.40, TELEMETRY: 0.65, SYSTEMS: 0.80, COMBAT: 0.95 },
      muted: false,
      reduced: false
    };
  }
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("sd.audio.settings.v2") : null;
    if (raw){
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object"){
        if (typeof parsed.master === "number") st.audioSettings.master = parsed.master;
        if (parsed.buses && typeof parsed.buses === "object") Object.assign(st.audioSettings.buses, parsed.buses);
        if (typeof parsed.muted === "boolean") st.audioSettings.muted = parsed.muted;
        if (typeof parsed.reduced === "boolean") st.audioSettings.reduced = parsed.reduced;
      }
    }
  } catch (_err) { /* ignore storage errors */ }
  return st.audioSettings;
}

const State = new Proxy({}, {
  get(_, prop){
    const st = GetGameState();
    if (prop === "audioSettings"){
      return _ensureAudioSettingsObject(st);
    }
    return st[prop];
  },
  set(_, prop, value){
    if (TryPatchGameState({ [prop]: value }) === false){
      console.error("[S&D state] Rejected write to State." + String(prop) + ":", value);
    }
    return true;
  },
  has(_, prop){
    return prop in GetGameState();
  },
  ownKeys(){
    return Reflect.ownKeys(GetGameState());
  },
  getOwnPropertyDescriptor(_, prop){
    const d = Object.getOwnPropertyDescriptor(GetGameState(), prop);
    if (d) d.configurable = true;
    return d;
  }
});

// ---- Seeded random number generator -------------------------
function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function RND(){ return State.rng ? State.rng() : Math.random(); }
// Probe fix (§12.8.4 root cause): the NPC map turn called this label-seeded
// rng but it was never defined — every map turn commit without an open
// encounter threw mid-way (the turn counter advanced, then the NPC turn and
// the closing HUD refresh never ran, so canvas clicks looked dead while the
// raw turn seam still reported the commit). Deterministic per label + run
// seed (rng-in/rng-out per the mechanics contract — never Math.random, which
// would make NPC turns irreproducible and break save/parity expectations):
// the same turn/faction rerolls identically for a given run seed.
function rngFor(label){
  const base = (State.rngSeed !== undefined && State.rngSeed !== null)
    ? (State.rngSeed | 0)
    : 0;
  let h = (base ^ 0x9E3779B9) >>> 0;
  const s = String(label);
  for (let i = 0; i < s.length; i++){
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return mulberry32(h);
}

// ---- Host & Interface services ------------------------------------------
// The central shell injects the platform host and the 3 unidirectional Interface Server
// endpoints (input consumer, graphics producer, audio producer).
let _host = null;
let _inputConsumer = null;
let _graphicsProducer = null;
let _audioProducer = null;

function bindHost(host){
  _host = host;
}

function bindInterfaces(ifaces){
  if (!ifaces) return;
  if (ifaces.host) _host = ifaces.host;
  if (ifaces.input) _inputConsumer = ifaces.input;
  if (ifaces.graphics) _graphicsProducer = ifaces.graphics;
  if (ifaces.audio) _audioProducer = ifaces.audio;
}

// ---- Game audio -----------------------------------------------------------
// Strictly 1-way: GameAudio pushes AudioCommandDTOs into AudioInterface
// (_audioProducer.pushCommand). Zero direct references to SoundEngine.
const GameAudio = (() => {
  let _audioReady = false;
  let _radioActiveUntil = 0;

  function _viewportDTO(){
    return (typeof MathGrid !== "undefined" && MathGrid.getRenderedViewport)
      ? MathGrid.getRenderedViewport()
      : { viewX: State.viewX || 0, viewY: State.viewY || 0, viewSpan: State.viewSpan || 32 };
  }

  function _push(cmd){
    if (!_audioProducer || typeof _audioProducer.pushCommand !== "function") return false;
    _audioProducer.pushCommand(Object.assign({
      viewport: _viewportDTO(),
      gameOver: Boolean(State.gameOver)
    }, cmd));
    return true;
  }

  function _syncStoredSettings(){
    _ensureAudioSettingsObject(GetGameState());
  }

  return {
    bind(){
      _syncStoredSettings();
    },
    play(kind, payload){
      if (typeof kind !== "string") return false;
      const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if (kind !== "ui.hover") {
        _radioActiveUntil = Math.max(_radioActiveUntil, now + 260);
      }
      return _push({ type: "PLAY", kind, payload: payload || {} });
    },
    // Run `fn` after `ms` unless the match ends first; tracked in
    // State.audioTimers so clearAll() / level restarts cancel it.
    schedule(ms, fn){
      const id = setTimeout(() => {
        const i = State.audioTimers.indexOf(id);
        if (i >= 0) State.audioTimers.splice(i, 1);
        if (!State.gameOver) {
          try { fn(); } catch (err) { console.warn("[S&D audio] scheduled sound failed:", err); }
        }
      }, ms);
      State.audioTimers.push(id);
      return id;
    },
    clearAll(){
      State.audioTimers.forEach(clearTimeout);
      State.audioTimers = [];
      return _push({ type: "CLEAR_ALL" });
    },
    stopLoops(){
      return _push({ type: "STOP_LOOPS" });
    },
    isReady(){
      return _audioReady;
    },
    unlock(){
      _audioReady = true;
      if (State.audioSettings) State.audioSettings.muted = false;
      Hud.setAudioReady(true);
      Hud.syncLayout();
      return _push({ type: "UNLOCK" });
    },
    toggleMute(){
      const nextMuted = !(State.audioSettings && State.audioSettings.muted);
      if (State.audioSettings) State.audioSettings.muted = nextMuted;
      _push({ type: "SET_MUTE", muted: nextMuted });
      return nextMuted;
    },
    setTheme(key){
      _push({ type: "SET_THEME", theme: key });
      return key;
    },
    getTheme(){
      return State.theme || "default";
    },
    getRadioActiveUntil(){
      return _radioActiveUntil;
    }
  };
})();

const MathGrid = {
  inBounds(gx,gy){ return typeof Rules!=="undefined"?Rules.inBounds(State,gx,gy):(gx>=0&&gx<GRID_SIZE&&gy>=0&&gy<GRID_SIZE); },
  gridToCenter(gx,gy){ return CameraMath.gridToCenter(gx, gy, _host.getCellPx()); },
  getRenderedViewport(now){
    const DS = _host ? _host.getDisplaySize() : 768;
    const tNow = (typeof now === "number")
      ? now
      : ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());
    return CameraMath.getRenderedViewport(State.viewX, State.viewY, State.viewSpan, State.zoomAnim, tNow, DS);
  },
  pixelToGrid(px,py){
    return CameraMath.pixelToGrid(px, py, this.getRenderedViewport());
  },
  clampViewport(){
    // Pure computation (cameraMath.js); Game applies the returned
    // values to state through the same patch path as before.
    const next = CameraMath.clampViewport(State.viewX, State.viewY, State.viewSpan);
    if (typeof Rules !== "undefined" && Rules.patchState){
      Rules.patchState({ viewSpan: next.viewSpan, viewX: next.viewX, viewY: next.viewY });
    } else {
      State.viewSpan = next.viewSpan;
      State.viewX = next.viewX;
      State.viewY = next.viewY;
    }
  },
  dist(a,b){ return typeof Rules!=="undefined"?Rules.dist(a,b):Math.hypot(a.x-b.x, a.y-b.y); },
  inRange(a,b,r){ return typeof Rules!=="undefined"?Rules.inRange(a,b,r):Math.hypot(a.x-b.x, a.y-b.y) <= r+1e-6; },
  getUnitAt(gx,gy){ return typeof Rules!=="undefined"?Rules.getUnitAt(State,gx,gy):(State.units.find(u=>u.hp>0&&u.x===gx&&u.y===gy)||null); },
  hasLineOfSight(x0,y0,x1,y1,mode){
    return typeof Rules!=="undefined"?Rules.hasLineOfSight(State,x0,y0,x1,y1,mode):false;
  },

  // Camera zoom: pure viewport math in cameraMath.js (moved here from
  // Rules in V57 — it is viewport math, not a game rule). Game resolves the
  // display size and applies the returned view values to state.
  resolveZoom(viewX, viewY, viewSpan, mousePx, deltaY, displaySize) {
    return CameraMath.resolveZoom(viewX, viewY, viewSpan, mousePx, deltaY,
      displaySize || (_host ? _host.getDisplaySize() : 768));
  }
};

const Visibility = {
  invalidate(){
    State.visDirty = true;
  },
  ensureCache(){
    if (!State.visCache || State.visDirty){
      // Pure computation (visibilityCache.js): the vis grid as plain
      // data. Game owns the cache storage and the explored bookkeeping.
      const vis = VisibilityCache.computeVisCache(State, 1);
      if (!Array.isArray(State.exploredCells) || State.exploredCells.length !== GRID_SIZE){
        State.exploredCells = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
      }
      for (let gx = 0; gx < GRID_SIZE; gx++){
        for (let gy = 0; gy < GRID_SIZE; gy++){
          if (vis[gx][gy] && State.exploredCells[gx]) State.exploredCells[gx][gy] = true;
        }
      }
      State.visCache = vis;
      State.visDirty = false;
    }
    return State.visCache;
  },
  getEffectiveScan(unit){
    return typeof Rules!=="undefined"?Rules.effectiveScan(State,unit):0;
  },
  isCellVisibleToTeam(gx,gy,team){
    return typeof Rules!=="undefined"?Rules.isCellVisibleToTeam(State,gx,gy,team):false;
  },
  isUnitSpottedByTeam(targetUnit,observerTeam){
    return typeof Rules!=="undefined"?Rules.isUnitSpottedByTeam(State,targetUnit,observerTeam):false;
  },
  getSpottedEnemyAt(gx,gy,observerTeam){
    return typeof Rules!=="undefined"?Rules.getSpottedEnemyAt(State,gx,gy,observerTeam):null;
  }
};

// ======================== SELECTION ========================
// The player's selection is tracked by unit id (State.selectedUnitId).
// State.selectedCell is kept as a derived mirror of that unit's position for
// the renderers; nothing should write it directly.
const Selection = {
  select(unit){
    if (!unit) return this.clear();
    State.selectedUnitId = unit.id;
    State.selectedCell = SelectionQueries.cellFor(unit);
    return unit;
  },
  clear(){
    if (State.selectedUnitId !== null) State.selectedUnitId = null;
    if (State.selectedCell !== null) State.selectedCell = null;
    return null;
  },
  getUnit(){
    return SelectionQueries.getUnit(State.units, State.selectedUnitId);
  },
  // Re-derive selectedCell after units move, die or change hands.
  sync(){
    const u = this.getUnit();
    if (!u) return this.clear();
    if (u.team !== 1) return this.clear();
    const next = SelectionQueries.cellFor(u);
    const c = State.selectedCell;
    if (!c || c.x !== next.x || c.y !== next.y) State.selectedCell = next;
    return u;
  }
};

// ======================== RULE EVIDENCE (composition) ========================
// The pure rule children never call each other: Game fetches board, LOS and
// vision evidence here and hands plain evidence to the decision children
// (combatMath.js). Each evidence object mirrors
// the checks the pre-split rule queries evaluated inline, so every decision
// is the same conjunction of the same facts.
function _hasFlag(unit, flag){
  if (!unit || !unit.flags) return false;
  return typeof unit.flags.has === "function" ? unit.flags.has(flag) : unit.flags.includes(flag);
}
function _moveEvidence(ctx, unitA, B){
  if (!unitA || !B) return {};
  const occ = BoardQueries.getUnitAt(ctx, B.x, B.y);
  return {
    inMoveRange: BoardQueries.inBounds(ctx, B.x, B.y) && BoardQueries.inRange(unitA, B, unitA.move),
    losClear: LineOfSight.hasLineOfSight(ctx, unitA.x, unitA.y, B.x, B.y, "MOVE"),
    occ,
    occSpotted: occ ? VisionQueries.isUnitSpottedByTeam(ctx, occ, unitA.team) : false
  };
}
// M5 adoption: the firing weapon resolved from the unit's loadout through
// the seam. One attack per turn (DESIGN §2.1). M5(c) Q8: the player's
// per-shot choice (the weapon-picker buttons) wins when it names a mount on
// this unit; otherwise the first mount fires. Null for an unarmed unit.
function _chosenName(unitA){
  if (!unitA) return null;
  const ws = Outfitting ? Outfitting.UnitWeapons(unitA) : [];
  if (ws.length === 0) return null;
  if (_pendingWeapon.unitId === unitA.id && _pendingWeapon.name){
    for (let i = 0; i < ws.length; i++){
      if (ws[i].name === _pendingWeapon.name) return _pendingWeapon.name;
    }
  }
  return ws[0].name;
}
function _activeWeapon(unitA){
  if (!unitA || !Outfitting) return null;
  const name = _chosenName(unitA);
  if (!name) return null;
  const ws = Outfitting.UnitWeapons(unitA);
  for (let i = 0; i < ws.length; i++){
    if (ws[i].name === name) return ws[i];
  }
  return null;
}
// The chosen weapon's own damage/range — the red numbers and the SHOOT
// affordance radius show THIS weapon only (Q8), never a sum/max.
function _activeDamage(unitA){
  const w = _activeWeapon(unitA);
  return w ? w.dmg : 0;
}
function _activeRange(unitA){
  const w = _activeWeapon(unitA);
  return w ? w.range : 0;
}
// Render/audio style key for a weapon row: the animation and audio channels
// keep their historical pdc/missile/railgun spelling.
function _weaponFxType(weapon){
  if (!weapon) return "pdc";
  return weapon.class === "cannon" ? "pdc" : weapon.class;
}
function _shootEvidence(ctx, unitA, B){
  if (!unitA || !B) return {};
  const occ = BoardQueries.getUnitAt(ctx, B.x, B.y);
  const active = _activeWeapon(unitA);
  return {
    inWeaponRange: BoardQueries.inRange(unitA, B, _activeRange(unitA)),
    armed: Boolean(active),
    occ,
    occSpotted: occ ? VisionQueries.isUnitSpottedByTeam(ctx, occ, unitA.team) : false,
    losClear: LineOfSight.hasLineOfSight(ctx, unitA.x, unitA.y, B.x, B.y, "WEAPON")
  };
}
function _captureEvidence(ctx, unitA, B){
  if (!unitA || !B) return {};
  const occ = BoardQueries.getUnitAt(ctx, B.x, B.y);
  return {
    inBoardRange: BoardQueries.inRange(unitA, B, 1.0),  // boarding range 1.0
    occ,
    occSpotted: occ ? VisionQueries.isUnitSpottedByTeam(ctx, occ, unitA.team) : false
  };
}
function _shieldEvidence(ctx){
  return { ap: ctx ? ctx.ap : undefined };
}
function _priorityEvidence(ctx, unitA, gx, gy){
  if (!unitA) return {};
  const B = { x: gx, y: gy };
  const occ = BoardQueries.getUnitAt(ctx, gx, gy);
  const occSpotted = occ ? VisionQueries.isUnitSpottedByTeam(ctx, occ, unitA.team) : false;
  return {
    move: {
      inMoveRange: BoardQueries.inBounds(ctx, gx, gy) && BoardQueries.inRange(unitA, B, unitA.move),
      losClear: LineOfSight.hasLineOfSight(ctx, unitA.x, unitA.y, gx, gy, "MOVE"),
      occ,
      occSpotted
    },
    shoot: {
      inWeaponRange: BoardQueries.inRange(unitA, B, _activeRange(unitA)),
      losClear: LineOfSight.hasLineOfSight(ctx, unitA.x, unitA.y, gx, gy, "WEAPON"),
      occ,
      occSpotted
    },
    capture: {
      inBoardRange: BoardQueries.inRange(unitA, B, 1.0),  // boarding range 1.0
      occ,
      occSpotted
    },
    shield: _shieldEvidence(ctx)
  };
}
function _shootableEvidence(ctx, u, dest, target){
  const wp = _activeWeapon(u);
  const ready = Boolean(u && target && target.hp > 0 && wp);
  return {
    inRange: ready && BoardQueries.inRange(dest, target, _activeRange(u)),
    spotted: ready && VisionQueries.isUnitSpottedByTeam(ctx, target, u.team),
    losClear: ready && LineOfSight.hasLineOfSight(ctx, dest.x, dest.y, target.x, target.y, "WEAPON")
  };
}

// ======================== ACTIONS ========================
// Domain actions & turn state machine: rule queries, combat/move/capture/
// shield/warp execution, AP accounting, endgame detection and turn hand-off.
// Presentation lives in hud.js (Hud); sector setup in sectorGenerator.js;
// the AI turn runner in aiController.js.
const Actions = {
  bindInputs(){
    // Inputs process is bound directly by the central shell to InputInterface (V66).
  },

  addAnimation(anim){ State.animations.push({...anim,start:performance.now()}); },

  // The composer: fetch rule evidence from the query children, then ask the
  // decision children for the verdict (siblings never call each other).
  getPriorityActionAt(unitA,gx,gy,opts){
    return ActionLegality.getPriorityActionAt(unitA, gx, gy, _priorityEvidence(State, unitA, gx, gy), opts);
  },

  canMove(unitA,B){
    return ActionLegality.canMove(unitA, B, _moveEvidence(State, unitA, B));
  },

  canCapture(unitA,B){
    return ActionLegality.canCapture(unitA, B, _captureEvidence(State, unitA, B));
  },

  canShoot(unitA,B){
    return ActionLegality.canShoot(unitA, B, _shootEvidence(State, unitA, B));
  },

  canShield(unitA,B){
    return ActionLegality.canShield(unitA, B, _shieldEvidence(State));
  },

  getValidWarpCells(capitalUnit,radius){
    return ReservePlacement.getValidWarpCells(State, capitalUnit, radius);
  },

  executeMove(unitA,B,isAI=false,apCost=1){
    const origin={x:unitA.x,y:unitA.y};
    const dest={x:B.x,y:B.y};
    const visStartOrEnd=Visibility.isCellVisibleToTeam(origin.x,origin.y,1)||Visibility.isCellVisibleToTeam(dest.x,dest.y,1);
    const prevSpotted=new Set(State.units.filter(u=>u.hp>0&&u.team===2&&Visibility.isUnitSpottedByTeam(u,1)).map(u=>u.id));
    const occupant=MathGrid.getUnitAt(dest.x,dest.y);

    if(isAI&&visStartOrEnd) State.historicalVectors.push({kind:"move",from:origin,to:dest});
    this.addAnimation({kind:"glide",duration:150,unitId:unitA.id,from:origin,to:dest});

    if(occupant&&occupant.team!==unitA.team){
      GameAudio.play("unit.move.collision", {from:origin, to:dest, team:unitA.team, unitType:unitA.type, targetType:occupant.type, isVisible:visStartOrEnd});

      const outcome=CombatMath.computeCollisionOutcome(unitA,occupant);
      const {moverHadShield,occHadShield,moverRem,occRem}=outcome;

      if(moverHadShield){ unitA.flags.delete("+shield"); this.addAnimation({kind:"shielddrop",duration:160,cell:dest}); }
      if(occHadShield){ occupant.flags.delete("+shield"); this.addAnimation({kind:"shielddrop",duration:160,cell:dest}); }

      if(occRem<=0){
        occupant.hp=0;
        this.addAnimation({kind:"destroy",duration:380,cell:dest,shipType:occupant.type});
        GameAudio.play("unit.destroy", {from:dest, to:dest, team:occupant.team, unitType:occupant.type, category:SHIP_SPECS[occupant.type].category, isVisible:visStartOrEnd, immediate:true});
      } else { occupant.hp=occRem; }

      if(moverRem<=0){
        unitA.hp=0;
        this.addAnimation({kind:"destroy",duration:380,cell:dest,shipType:unitA.type});
        GameAudio.play("unit.destroy", {from:dest, to:dest, team:unitA.team, unitType:unitA.type, category:SHIP_SPECS[unitA.type].category, isVisible:visStartOrEnd, immediate:true});
      } else {
        unitA.hp=moverRem; unitA.x=dest.x; unitA.y=dest.y; unitA.flags.add("-moved");
      }

      State.turnReportQueue.push(`BLIND-SECTOR COLLISION AT [${dest.x},${dest.y}]: ${unitA.type} RAMMED ${occupant.type}!`);
      _reapDeadUnits();
      if(unitA.team===1) Selection.sync();
    } else {
      GameAudio.play("unit.move", {from:origin, to:dest, team:unitA.team, unitType:unitA.type, isVisible:visStartOrEnd});
      unitA.x=dest.x; unitA.y=dest.y; unitA.flags.add("-moved");
      if(unitA.team===1) Selection.sync();
    }

    Visibility.invalidate();
    Visibility.ensureCache();

    State.units.forEach(u=>{
      if(u.hp>0&&u.team===2&&!prevSpotted.has(u.id)&&Visibility.isUnitSpottedByTeam(u,1)){
        this.addAnimation({kind:"spotted",duration:240,cell:{x:u.x,y:u.y}});
        GameAudio.play("unit.spotted", {from:{x:u.x,y:u.y}, team:u.team, unitType:u.type, isVisible:true, delaySec:0.14});
      }
    });

    this.consumeAPAndCheckTurn(isAI,apCost);
  },

  executeCapture(unitA,target,isAI=false,apCost=1){
    const origin={x:unitA.x,y:unitA.y};
    const dest={x:target.x,y:target.y};
    const visStartOrEnd=Visibility.isCellVisibleToTeam(origin.x,origin.y,1)||Visibility.isCellVisibleToTeam(dest.x,dest.y,1);

    if(isAI){
      if(visStartOrEnd) State.historicalVectors.push({kind:"capture",from:origin,to:dest});
      State.turnReportQueue.push(`MARINE ALERT: Syndicate boarded and captured ${target.type} at [${dest.x},${dest.y}]!`);
    }

    GameAudio.play("unit.capture", {from:origin, to:dest, team:unitA.team, unitType:unitA.type, targetType:target.type, isVisible:visStartOrEnd});

    unitA.flags.add("-sent boarding party");
    target.team=unitA.team;
    target.flags.add("-moved"); target.flags.add("-sent boarding party");
    target.flags.add("-attacked");
    Visibility.invalidate();
    Visibility.ensureCache();
    Selection.sync();

    this.addAnimation({kind:"capture",duration:350,from:origin,to:dest,targetName:target.type});
    this.consumeAPAndCheckTurn(isAI,apCost);
  },

  executeShoot(unitA,target,isAI=false,apCost=1,weaponName){
    const origin={x:unitA.x,y:unitA.y};
    const dest={x:target.x,y:target.y};
    const visStartOrEnd=Visibility.isCellVisibleToTeam(origin.x,origin.y,1)||Visibility.isCellVisibleToTeam(dest.x,dest.y,1);
    // M5 adoption: the shot's stats come from the firing weapon row (the
    // unit's loadout through the seam), never off unit fields. M5(c) Q8:
    // an explicit weaponName picks the firing mount for this shot and
    // becomes the unit's pending choice (numbers stay in step with it).
    let weapon=_activeWeapon(unitA);
    if (weaponName && Outfitting){
      const ws=Outfitting.UnitWeapons(unitA);
      for(let i=0;i<ws.length;i++){
        if (ws[i].name===weaponName){ weapon=ws[i]; _pendingWeapon={unitId:unitA.id,name:weaponName}; break; }
      }
    }
    const wType=_weaponFxType(weapon);

    if(isAI&&visStartOrEnd) State.historicalVectors.push({kind:"shoot",from:origin,to:dest,team:unitA.team});
    GameAudio.play("weapon.fire", {from:origin, to:dest, team:unitA.team, unitType:unitA.type, targetType:target.type, wType, isVisible:visStartOrEnd});

    unitA.flags.add("-attacked");

    if(unitA.flags.has("+shield")){
      unitA.flags.delete("+shield");
      this.addAnimation({kind:"shielddrop",duration:160,cell:origin});
      GameAudio.play("weapon.shieldStrip", {from:origin, to:origin, team:unitA.team, isVisible:visStartOrEnd, attackerStrip:true});
    }

    const shootOutcome=CombatMath.computeShootOutcome(unitA,target,weapon);
    const {damageDealt,shieldStripped}=shootOutcome;

    if(shieldStripped){
      target.flags.delete("+shield");
      target.hp-=damageDealt;
      this.addAnimation({kind:"shielddrop",duration:160,cell:dest});
      GameAudio.play("weapon.shieldStrip", {from:dest, to:dest, team:target.team, isVisible:visStartOrEnd});
    } else {
      target.hp-=damageDealt;
    }

    this.addAnimation({kind:"weapon",duration:320,from:origin,to:dest,wType,damage:damageDealt,shieldStripped});

    GameAudio.play("weapon.impact", {
      from:dest, to:dest, team:target.team, targetType:target.type,
      material: shieldStripped ? "shield" : "hull",
      hpRatio: target.maxHp>0 ? Math.max(0,target.hp)/target.maxHp : 0,
      isVisible: visStartOrEnd
    });

    if(isAI&&visStartOrEnd){
      State.turnReportQueue.push(`COMBAT TELEMETRY: Hostile ${unitA.type} engaged ${target.type} (-${damageDealt} HP).`);
    }

    if(target.hp<=0){
      target.hp=0;
      _reapDeadUnits();
      this.addAnimation({kind:"destroy",duration:380,cell:dest,shipType:target.type});
      GameAudio.play("unit.destroy", {from:dest, to:dest, team:target.team, unitType:target.type, category:SHIP_SPECS[target.type].category, isVisible:visStartOrEnd});
      Visibility.invalidate();
      Visibility.ensureCache();
      Selection.sync();
    }

    this.consumeAPAndCheckTurn(isAI,apCost);
  },

  executeShield(unitA,isAI=false,apCost=1){
    const cell={x:unitA.x,y:unitA.y};
    const vis=Visibility.isCellVisibleToTeam(cell.x,cell.y,1);
    GameAudio.play("unit.shieldUp", {from:cell, to:cell, team:unitA.team, unitType:unitA.type, isVisible:vis});

    unitA.flags.add("+shield");
    this.addAnimation({kind:"shieldup",duration:250,cell});
    this.consumeAPAndCheckTurn(isAI,apCost);
  },

  executeWarpIn(capitalUnit,shipType,isAI=false,apCost=1,opts={}){
    const radius=(opts.radius===undefined)?3:opts.radius;
    const spec=SHIP_SPECS[shipType];
    const team=capitalUnit ? capitalUnit.team : 1;
    let locus=capitalUnit;
    if (!locus || !locus.flags || !locus.flags.has("!flagship")){
      const us=State.units||[];
      locus=null;
      for (let i=0;i<us.length;i++){
        const u=us[i];
        if (u.hp>0 && u.team===team && u.flags.has("!flagship")){ locus=u; break; }
      }
    }
    const validCells=locus ? this.getValidWarpCells(locus,radius) : [];
    const reserve=Array.isArray(State.battleReserve) ? State.battleReserve : [];
    let ri=-1;
    for (let i=0;i<reserve.length;i++){
      if ((reserve[i].hull||reserve[i].type)===shipType){ ri=i; break; }
    }
    if(!spec||ri<0||validCells.length===0){
      if(!isAI) GameAudio.play("ui.invalid", {});
      return false;
    }

    const pick=validCells[Math.floor(RND()*validCells.length)];
    const nextReserve=[];
    for (let i=0;i<reserve.length;i++){ if (i!==ri) nextReserve.push(reserve[i]); }
    State.battleReserve=nextReserve;
    const spawned=SectorGenerator.createUnit(shipType,team,pick.x,pick.y,true);
    spawned.kind="mirage";
    // M4 manning: the summoned hull enters with its roster entry's crew (the
    // incapacitation gate reads it), not a fresh full crew. M5: likewise its
    // roster loadout (custom mounts ride the entry, DESIGN §3.3).
    if (typeof reserve[ri].crew === "number") {
      spawned.crew = reserve[ri].crew;
      if (typeof reserve[ri].maxCrew === "number") spawned.maxCrew = reserve[ri].maxCrew;
    }
    if (Array.isArray(reserve[ri].loadout)) {
      spawned.loadout = reserve[ri].loadout.slice();
    }
    Visibility.invalidate();
    Visibility.ensureCache();
    const vis=Visibility.isCellVisibleToTeam(pick.x,pick.y,1);

    if(isAI&&vis) State.turnReportQueue.push("WARP SIGNATURE: Syndicate warped in "+shipType+" at ["+pick.x+","+pick.y+"].");

    GameAudio.play("unit.warpIn", {from:pick, to:pick, team, unitType:shipType, isVisible:vis});

    this.addAnimation({kind:"warp",duration:300,cell:pick,shipType:spawned.type});
    this.consumeAPAndCheckTurn(isAI,apCost);
    return true;
  },

  checkEndgame(){
    if(State.gameOver) return true;
    const status=EndgameStatus.checkEndgameStatus(State.units);

    if(status.t1Defeated || status.t2Defeated){
      if (CampaignLib && State.campaign){
        const packed=CampaignLib.CollectResult(State.units, State.battleReserve, _battleSnapshot, status);
        const folded=CampaignLib.ApplyBattleResult(State.campaign, packed, SHIP_SPECS, CombatMath.crewLostFromDamage);
        if (folded && folded.state){
          let s = _mirrorMapFleet(folded.state);
          // D2 fix: the counts come from the death counter — dead hulls leave
          // State.units at death, so the old `hp <= 0` scan always read 0 and
          // these hooks never fired. M6(b): any hull lost on either side
          // moves the pair by the frozen kill rate (Q10: kills ±10).
          const hostileDead = _battleDeaths[2];
          const ownDead = _battleDeaths[1];
          _battleDeaths = { 1: 0, 2: 0 };
          if (State.faction && Reputation){
            if (hostileDead + ownDead > 0){
              s = Object.assign({}, s, {
                reputation: Reputation.ApplyEvent(s.reputation, "kill", "player", State.faction)
              });
            }
            // M6(d): hostile hulls destroyed count toward accepted "destroy"
            // contracts (the posted briefs read "destroy N hostile hulls" —
            // own losses do not credit the contract).
            if (hostileDead > 0){
              s = Missions.Advance(s, "destroy", hostileDead);
            }
          }
          // M3: the result folds back onto the map — the map screen returns,
          // the freeze lifts, and the map fleet mirrors the post-battle
          // roster (the shared mirror helper above).
          if (s.map){
            s = Object.assign({}, s, {
              map: Object.assign({}, s.map, {
                screen: "map",
                battleActive: false,
                pendingEncounter: null
              })
            });
          }
          TryPatchGameState({ campaign: s });
        }
      }
    }

    if(status.t1Defeated){
      State.gameOver=true;
      State.aiTimers.forEach(t=>clearTimeout(t));
      State.aiTimers=[];
      GameAudio.stopLoops();
      GameAudio.play("game.defeat", {});
      // Allow killing-blow weapon beam & Flagship explosion VFX to play before modal covers board (ISS-004, ISS-005).
      const modalTimer=setTimeout(()=>{
        if(State.gameOver) Hud.showEndgameModal(false);
      },450);
      State.aiTimers.push(modalTimer);
      return true;
    }
    if(status.t2Defeated){
      State.gameOver=true;
      State.aiTimers.forEach(t=>clearTimeout(t));
      State.aiTimers=[];
      GameAudio.stopLoops();
      State.completedLevels.add(State.levelId);
      GameAudio.play("game.victory", {});
      const modalTimer=setTimeout(()=>{
        if(State.gameOver) Hud.showEndgameModal(true);
      },450);
      State.aiTimers.push(modalTimer);
      return true;
    }
    return false;
  },

  consumeAPAndCheckTurn(isAI=false,apCost=1){
    State.ap=Math.max(0,State.ap-apCost);
    Hud.updateAll();
    if(this.checkEndgame()) return;
    if(!isAI&&State.ap===0&&State.activeTeam===1){
      if(apCost>=MAX_AP&&State.animations.length===0){
        this.transitionToAITurn();
      } else {
        // Lock player actions immediately and allow 4th-AP VFX to finish before AI turn setup (ISS-041).
        State.activeTeam=2;
        Hud.updateAll();
        const handoffTimer=setTimeout(()=>{
          if(!State.gameOver) this.transitionToAITurn();
        },420);
        State.aiTimers.push(handoffTimer);
      }
    }
  },

  transitionToAITurn(){
    State.activeTeam=2;
    State.ap=MAX_AP;
    State.historicalVectors=[];
    if (typeof materializeMirages === "function"){
      const out=materializeMirages({ units: State.units, team: 2 });
      State.units=out.state.units;
    }
    State.units.forEach(u=>{
      if(u.team===2){
        u.flags.delete("-moved"); u.flags.delete("-sent boarding party");
        u.flags.delete("-attacked");
      }
    });
    Hud.updateAll();
    GameAudio.play("turn.playerEnd", { delaySec: 0.12 });
    const startTimer=setTimeout(()=>{ AI.executeTurn(); },500);
    State.aiTimers.push(startTimer);
  },

  transitionToPlayerTurn(){
    if(this.checkEndgame()) return;
    State.turnNumber+=1;
    State.activeTeam=1;
    State.ap=MAX_AP;
    if (typeof materializeMirages === "function"){
      const out=materializeMirages({ units: State.units, team: 1 });
      State.units=out.state.units;
    }
    State.units.forEach(u=>{
      if(u.team===1){
        u.flags.delete("-moved"); u.flags.delete("-sent boarding party");
        u.flags.delete("-attacked");
      }
    });
    GameAudio.play("turn.aiEnd", { delaySec: 0.18 });
    if(State.turnReportQueue.length===0) State.turnReportQueue.push("SYNDICATE TURN COMPLETE: 4/4 actions executed in sector.");
    Hud.showIntelOverlay(`TURN ${String(State.turnNumber).padStart(2,"0")} // OPERATIONAL REPORT`,State.turnReportQueue);
    State.turnReportQueue=[];
    Hud.updateAll();
  }
};

// ======================== HUD RUNNER (game-owned) ========================
// hud.js is a pure child: every operation receives the game-owned HUD
// view (_hudView), a plain-data input, and RETURNS a plain result (the RESULT
// SHAPE documented at the top of hud.js). The runner below is Game's own
// orchestrator: it builds the plain input, invokes the pure operation, and
// applies the returned data to Game state — State.canvasButtons /
// buttonHovered / buttonPressed / theme, Selection, sound commands routed
// through GameAudio, and render requests through
// the host. The hud child never sees a module handle or live state.
function _unitDTO(u){
  if (!u) return null;
  return {
    id: u.id,
    type: u.type,
    team: u.team,
    x: u.x,
    y: u.y,
    hp: u.hp,
    maxHp: u.maxHp,
    move: u.move,
    // M5 adoption: weapon stats are seam-derived from the unit's loadout.
    loadout: Outfitting.LoadoutOf(u),
    firepower: Outfitting.UnitFirepower(u),
    range: Outfitting.UnitRange(u),
    scan: u.scan,
    cost: u.cost,
    flags: new Set(u.flags)
  };
}

// D2 fix: the single place a dead hull leaves State.units. Each removed hull
// is tallied on its side first, because the battle fold runs AFTER removal
// and can no longer see `hp <= 0` rows. Mirages are warp signatures, not
// hulls — a destroyed mirage is not a kill.
function _reapDeadUnits(){
  for (let i = 0; i < State.units.length; i++){
    const u = State.units[i];
    if (u.hp <= 0 && u.kind !== "mirage") _battleDeaths[u.team === 2 ? 2 : 1]++;
  }
  State.units = State.units.filter(u => u.hp > 0);
}

// Plain-data input for one hud operation (see hud.js INPUT contract).
function _hudInput(){
  const m = (_host && _host.metrics) ? _host.metrics : null;
  const DS = m ? m.displaySize : 768;
  const viewSpan = State.viewSpan;
  return {
    now: (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(),
    state: {
      levelId: State.levelId,
      turnNumber: State.turnNumber,
      activeTeam: State.activeTeam,
      gameOver: Boolean(State.gameOver),
      ap: State.ap,
      credits: { 1: State.credits ? State.credits[1] : 0, 2: State.credits ? State.credits[2] : 0 },
      theme: State.theme || "default",
      viewX: State.viewX,
      viewY: State.viewY,
      viewSpan,
      mousePx: State.mousePx ? { x: State.mousePx.x, y: State.mousePx.y } : { x: 0, y: 0 },
      hoveredCell: State.hoveredCell ? { x: State.hoveredCell.x, y: State.hoveredCell.y } : null,
      selectedCell: State.selectedCell ? { x: State.selectedCell.x, y: State.selectedCell.y } : null,
      inspectMode: Boolean(State.inspectMode),
      audioMuted: Boolean(State.audioSettings && State.audioSettings.muted),
      completedLevels: State.completedLevels ? Array.from(State.completedLevels) : [],
      battleReserve: Array.isArray(State.battleReserve) ? State.battleReserve : [],
      wallet: (State.campaign && typeof State.campaign.wallet === "number") ? State.campaign.wallet : 0,
      deployment: _pendingDeploy,
      station: _stationBundle()
    },
    metrics: {
      displaySize: DS,
      uiScale: (m && m.uiScale) ? m.uiScale : 1,
      minimapSize: (m && m.minimapSize) ? m.minimapSize : 120,
      cellPx: (m && m.cellPx) ? m.cellPx : (DS / viewSpan),
      ui: (m && m.ui) ? m.ui : null
    },
    units: Array.isArray(State.units) ? State.units.filter(u => u.hp > 0).map(_unitDTO) : [],
    selectedUnit: _unitDTO(Selection.getUnit()),
    cache: {
      priorityKey: _hudCache.priorityKey,
      priorityLabel: _hudCache.priorityLabel,
      hoveredSpotted: _hudCache.hoveredSpotted
    }
  };
}

// Apply one hud result to Game state. This is the ONLY place the state
// writes the hud used to perform live now (State.theme/canvasButtons/
// buttonHovered/buttonPressed, Selection, sounds, renders, warp anomaly).
function _applyHudResult(res){
  if (!res) return;
  if (res.theme !== undefined){
    State.theme = res.theme;
    if (typeof document !== "undefined" && document.body){
      document.body.setAttribute("data-theme", res.theme);
    }
    GameAudio.setTheme(res.theme);
  }
  if (res.selection){
    if (res.selection.sync){
      Selection.sync();
    } else {
      const id = res.selection.unitId;
      const unit = (id === null || id === undefined)
        ? null
        : (State.units.find(u => u.id === id && u.hp > 0) || null);
      Selection.select(unit);
    }
  }
  if (res.view) _hudView = res.view;
  if (res.buttons) State.canvasButtons = res.buttons;
  if (res.flags && res.flags.clearInteraction){
    if (State.buttonHovered !== null) State.buttonHovered = null;
    if (State.buttonPressed !== null) State.buttonPressed = null;
  }
  if (res.cache) _hudCache = res.cache;
  if (res.sounds){
    for (let i = 0; i < res.sounds.length; i++){
      GameAudio.play(res.sounds[i].kind, res.sounds[i].payload);
    }
  }
  if (res.flags && res.flags.renderRequests){
    for (let i = 0; i < res.flags.renderRequests.length; i++){
      if (_host && typeof _host.requestRender === "function"){
        _host.requestRender(res.flags.renderRequests[i]);
      }
    }
  }
}

// ======================== M3 CAMPAIGN-MAP ORCHESTRATION ========================
// The map domain's pure children answer questions (costs, events,
// visibility); the effects (state patches, HUD, battle launch) live here.
function _mapSection(){
  const c = GetGameState().campaign;
  return (c && c.map) || null;
}

// The debug handle's map read (same data as _mapSection; named so the
// handle's methods never reach through window.SD to call each other).
function _debugMapState(){ return _mapSection(); }

// Patch the map section through the campaign save seam (new objects out).
function _patchMap(mut){
  const c = GetGameState().campaign;
  if (!c || !c.map) return null;
  const next = Object.assign({}, c.map, mut);
  TryPatchGameState({ campaign: Object.assign({}, c, { map: next }) });
  return next;
}

// Arrival check (M3): entering a fleet/location opens it — the encounter
// is recorded on the map (persisted) and the hailing shell opens. The
// battle itself enters on the NEXT turn (_mapTurnCommit / the next move).
function _mapArrival(mapState, entering){
  const setup = CampaignMapLib.BattleEventAt(mapState, mapState.locationId || "", entering);
  if (setup){
    _hailTalkCount = 0;
    _patchMap({ pendingEncounter: setup });
    Hud.showHailPanel(setup);
    GameAudio.play("ui.modal.open");
  }
  return setup;
}

function _mapTravel(dest){
  const map = _mapSection();
  if (!map) return null;
  if (map.pendingEncounter){
    // An opened encounter owns the next turn (M3: encounters enter battle
    // on the next turn) — the move is refused and the battle launches.
    return _launchEncounterBattle(map.pendingEncounter);
  }
  const res = CampaignMapLib.MoveFleet(map, "player", dest);
  if (res.mapState){
    _patchMap({ fleets: res.mapState.fleets, turn: res.mapState.turn, locationId: res.mapState.locationId });
    const moved = res.events.some(function (e){ return e && e.kind === "fleetMoved"; });
    if (moved){
      _patchMap({ pendingMerchant: null });
      const next = _mapSection();
      const pf = (next.fleets || []).find(function (f){ return f.faction === "player"; });
      // Arrival is the fleet's ACTUAL position (travel may cap at the
      // slowest ship), not the requested destination.
      _mapArrival(next, pf ? { x: pf.x, y: pf.y } : null);
      _mapClockTick();
    } else {
      _mapMerchantOffer(res.events);
    }
  }
  Hud.updateAll();
  return res.events;
}

function _mapJump(target){
  const map = _mapSection();
  if (!map) return null;
  if (map.pendingEncounter){
    return _launchEncounterBattle(map.pendingEncounter);
  }
  const res = CampaignMapLib.HyperspaceJump(map, "player", target);
  if (res.mapState){
    _patchMap({ fleets: res.mapState.fleets, turn: res.mapState.turn, locationId: res.mapState.locationId });
    const jumped = res.events.some(function (e){ return e && e.kind === "fleetJumped"; });
    if (jumped){
      _patchMap({ pendingMerchant: null });
      const next = _mapSection();
      const pf = next.fleets.find(function (f){ return f.faction === "player"; });
      _mapArrival(next, pf ? { x: pf.x, y: pf.y } : null);
      _mapClockTick();
    } else {
      _mapMerchantOffer(res.events);
    }
  }
  Hud.updateAll();
  return res.events;
}

// M4 merchant flow: a rejected move (no fuel / flagship crew low) spawns
// the merchant-fleet encounter (M3); the offer is recorded on the map and
// its storefront opens — discounted sale, inflated provisioning (the real
// service behind the M3 placeholder).
function _mapMerchantOffer(events){
  const list = Array.isArray(events) ? events : [];
  for (let i = 0; i < list.length; i++){
    const e = list[i];
    if (e && e.kind === "merchantFleetEvent"){
      _patchMap({ pendingMerchant: { reason: e.reason || null, offer: e.offer || null } });
      Hud.updateMapHud();
      Hud.toggleStationModal(true);
      return e;
    }
  }
  return null;
}

// Map turn commit: with an encounter open, the next turn launches the
// battle through the M2 seam (startSector -> deployment -> generate).
// M6(e) world life: the NPC turn on the map — every faction's fleets decide
// orders through the map AI and act through the shared map rules; the
// visible outcomes land in the turn reports.
function _npcMapTurn(){
  const map = _mapSection();
  if (!map || map.screen === "battle") return;
  const ids = Factions ? Factions.Ids() : [];
  let current = map;
  for (let i = 0; i < ids.length; i++){
    const fid = ids[i];
    const orders = CampaignMapLib.MapAi(current, fid, rngFor("map-ai-" + (current.turn || 0) + "-" + fid));
    for (let j = 0; j < orders.length; j++){
      const res = CampaignMapLib.ApplyMapOrder(current, orders[j], rngFor("map-ai-act-" + (current.turn || 0) + "-" + fid + "-" + j));
      current = (res && res.mapState) ? res.mapState : current;
      const evs = (res && res.events) || [];
      for (let k = 0; k < evs.length; k++){
        const ev = evs[k];
        if (ev && typeof ev.text === "string" && ev.kind !== "merchantFleetEvent"){
          State.turnReportQueue.push(ev.text);
        }
      }
    }
  }
  if (current !== map) _patchMap({ fleets: current.fleets });
}

function _mapTurnCommit(){
  const map = _mapSection();
  if (!map) return;
  if (map.pendingEncounter){
    _launchEncounterBattle(map.pendingEncounter);
    return;
  }
  _patchMap({ turn: (typeof map.turn === "number") ? map.turn + 1 : 1 });
  // M6(d): map turns count toward accepted patrol contracts.
  const c0 = GetGameState().campaign;
  const advanced = Missions ? Missions.Advance(c0, "turn", 1) : c0;
  if (advanced !== c0) TryPatchGameState({ campaign: advanced });
  _mapClockTick();
  // M6(e) world life: the NPC turn — every faction's fleets decide and act
  // through the same map rules; the outcomes land in the turn reports.
  _npcMapTurn();
  Hud.updateAll();
}

// M4: the campaign month clock ticks with every committed map turn; on a
// month rollover the pure wage transform runs (the wage tick, Q6) and an
// unpaid bill surfaces as a turn report. The transform returns the same
// state when no month rolled, so this is a no-op turn to turn.
function _mapClockTick(){
  const c = GetGameState().campaign;
  if (!c) return null;
  const res = EconomyLib.PayWages(c);
  if (!res || !res.state) return null;
  if (res.state !== c){
    TryPatchGameState({ campaign: res.state });
    if (res.unpaid > 0){
      State.turnReportQueue.push("PAYROLL: wages unpaid (" + res.unpaid + " ⒸB) — crew deserted the most expensive hulls.");
    }
  }
  return res;
}

function _launchEncounterBattle(setup){
  Hud.hideHailPanel();
  _patchMap({ pendingEncounter: null });
  GameAudio.play("ui.select");
  Game.startSector(setup.levelId, { encounter: setup });
}

// Canvas click on the map screen: a click on/inside a gravity well jumps
// there from a well, otherwise it moves the fleet toward the point (the
// slowest ship caps travel inside the pure mover).
function _mapClick(px, py, ds){
  const map = _mapSection();
  if (!map) return;
  const span = 64;
  const mx = px * span / ds;
  const my = py * span / ds;
  let target = null;
  const locs = Array.isArray(map.locations) ? map.locations : [];
  for (let i = 0; i < locs.length; i++){
    const L = locs[i];
    const dx = mx - L.x;
    const dy = my - L.y;
    const w = (typeof L.well === "number") ? L.well : 6;
    if (dx * dx + dy * dy <= w * w){ target = L; break; }
  }
  const pf = (map.fleets || []).find(function (f){ return f.faction === "player"; });
  const inWell = pf ? locs.find(function (L){
    const dx = pf.x - L.x;
    const dy = pf.y - L.y;
    const w = (typeof L.well === "number") ? L.well : 6;
    return dx * dx + dy * dy <= w * w;
  }) : null;
  if (target && inWell && target.id !== inWell.id){
    _mapJump(target.id);
  } else {
    _mapTravel(target ? { x: target.x, y: target.y } : { x: mx, y: my });
  }
}

// ======================== M4 STATION STOREFRONT ORCHESTRATION ========================
// The station modal's data bundle: posted quotes from the economy seam,
// fleet/cargo stock and per-ship service costs — plain data for the HUD
// child (it lays rows out; the prices were computed here). The effects
// (trades, repair/refit, state patches) are applied here too.
let _stationCtx = { tab: "commodities", mode: "station", outfitShip: -1 };
// M5(d): the capacity verdict the roster transform needs, injected (the
// transform child never names the seam or the roster table).
const _outfitDeps = {
  canFit(loadout, hullName){ return Outfitting.Validate(loadout, SHIP_SPECS[hullName] || null); }
};

// Docked = the player fleet sits inside a station's gravity well on the map
// screen with no encounter pending (the storefront only exists at stations).
function _stationDock(){
  const c = GetGameState().campaign;
  const map = (c && c.map) || null;
  if (!map || map.screen !== "map" || map.pendingEncounter) return null;
  const locs = Array.isArray(map.locations) ? map.locations : [];
  for (let i = 0; i < locs.length; i++){
    if (locs[i].id === map.locationId && locs[i].kind === "station") return locs[i];
  }
  return null;
}

// The map fleet mirrors the post-trade roster (same shape the battle fold
// uses): hull records carry crew/maxCrew/speed/flagship and the movement
// rules read them directly.
function _mirrorMapFleet(s){
  if (!s || !s.map || !Array.isArray(s.map.fleets)) return s;
  const ships = (Array.isArray(s.fleet) ? s.fleet : []).map(function (e){
    const spec = SHIP_SPECS[e.hull] || {};
    return {
      hull: e.hull,
      crew: (typeof e.crew === "number") ? e.crew : 0,
      maxCrew: (typeof e.maxCrew === "number") ? e.maxCrew : ((typeof spec.crew === "number") ? spec.crew : 0),
      speed: (typeof spec.move === "number") ? spec.move : 1,
      flagship: Boolean(e.flagship) || (Array.isArray(spec.flags) && spec.flags.indexOf("!flagship") !== -1)
    };
  });
  return Object.assign({}, s, {
    map: Object.assign({}, s.map, {
      fleets: s.map.fleets.map(function (f){
        return f.faction === "player" ? Object.assign({}, f, { ships: ships }) : f;
      })
    })
  });
}

function _stationBundle(){
  const c = GetGameState().campaign;
  const dock = _stationDock();
  const merchant = (c && c.map && c.map.pendingMerchant) ? c.map.pendingMerchant : null;
  const mode = merchant ? "merchant" : "station";
  const market = (c && c.market) || null;
  const wares = (market && market.wares) || {};
  const lots = (market && market.lots) || {};
  const cargo = (c && c.cargo) || {};
  const fleet = (c && Array.isArray(c.fleet)) ? c.fleet : [];
  const turn = (c && c.map && typeof c.map.turn === "number") ? c.map.turn : 1;
  const locId = dock ? dock.id : ((c && c.map && c.map.locationId) || "");
  const wallet = (c && typeof c.wallet === "number") ? c.wallet : 0;

  // The active tab is mode-scoped; fall back to each mode's first tab.
  let tab = _stationCtx.tab;
  if (mode === "merchant"){
    if (tab !== "provisions" && tab !== "sell") tab = "provisions";
  } else {
    if (["commodities", "hulls", "weapons", "services", "outfit", "missions"].indexOf(tab) === -1) tab = "commodities";
  }

  const tabs = (mode === "merchant")
    ? [
        { id: "provisions", label: "PROVISIONS", active: tab === "provisions" },
        { id: "sell", label: "SELL", active: tab === "sell" }
      ]
    : [
        { id: "commodities", label: "GOODS", active: tab === "commodities" },
        { id: "hulls", label: "HULLS", active: tab === "hulls" },
        { id: "weapons", label: "WEAPONS", active: tab === "weapons" },
        { id: "services", label: "SERVICE", active: tab === "services" },
        { id: "outfit", label: "OUTFIT", active: tab === "outfit" },
        { id: "missions", label: "MISSIONS", active: tab === "missions" }
      ];

  const rows = [];
  if (merchant){
    // Merchant storefront: the player BUYS crew/fuel at the inflated price
    // and SELLS anything at the discount (M3 offer, wired for real in M4).
    const sellKeys = Object.keys(wares).filter(function (k){
      return tab === "sell" ? true : false;
    });
    const keys = (tab === "provisions") ? ["crew", "fuel"] : sellKeys;
    for (let i = 0; i < keys.length; i++){
      const key = keys[i];
      const w = wares[key];
      if (!w) continue;
      const unit = _merchantUnit(c, key, locId, turn, merchant.offer);
      const lot = (w.kind === "commodity") ? (lots[key] || 1) : 1;
      let held = 0;
      if (w.kind === "commodity") held = cargo[key] || 0;
      else if (w.kind === "weapon") held = (cargo.weapons && cargo.weapons[w.name]) || 0;
      else { for (let j = 0; j < fleet.length; j++){ if (fleet[j].hull === w.name) held++; } }
      rows.push({
        id: key,
        kind: "ware",
        label: String(w.name || key).toUpperCase(),
        sub: (w.kind === "commodity") ? ("LOT " + lot) : "",
        priceText: "BUY " + unit.buy + " / SELL " + unit.sell,
        ownedText: "HELD " + held,
        buyLabel: w.kind === "commodity" ? ("BUY " + lot) : "BUY",
        sellLabel: w.kind === "commodity" ? ("SELL " + lot) : "SELL",
        canBuy: tab === "provisions" && wallet >= unit.buy * lot,
        canSell: tab === "sell" && held >= lot
      });
    }
  } else if (dock && tab === "outfit"){
    // M5(d): the outfit tab — the fleet's ships, their mounts and the spare
    // stock. Slot sizes and capacity verdicts come from the seam here; the
    // hud child lays the plain rows out.
    const sel = (typeof _stationCtx.outfitShip === "number") ? _stationCtx.outfitShip : -1;
    const usedSlots = [], capacities = [];
    for (let i = 0; i < fleet.length; i++){
      const e = fleet[i];
      const spec = SHIP_SPECS[e.hull || e.type] || {};
      capacities.push(typeof spec.capacity === "number" ? spec.capacity : 0);
      usedSlots.push(Outfitting.Validate(Array.isArray(e.loadout) ? e.loadout : [], spec).usedSlots);
    }
    const legalMounts = [];
    if (sel >= 0 && sel < fleet.length){
      const e = fleet[sel];
      const spec = SHIP_SPECS[e.hull || e.type] || {};
      const have = Array.isArray(e.loadout) ? e.loadout.slice() : [];
      const stockKeys = Object.keys(cargo.weapons || {});
      for (let k = 0; k < stockKeys.length; k++){
        if (Outfitting.Validate(have.concat([stockKeys[k]]), spec).ok) legalMounts.push(stockKeys[k]);
      }
    }
    const statRows = {};
    const wt = RULES_DATA.weapons || {};
    Object.keys(wt).forEach(function (n){ statRows[n] = { dmg: wt[n].dmg, range: wt[n].range, slots: wt[n].slots }; });
    const outfitModel = HudLib.outfitModel({
      fleet: fleet,
      stock: (cargo.weapons || {}),
      stats: statRows,
      selected: sel,
      usedSlots: usedSlots,
      capacities: capacities,
      legalMounts: legalMounts
    });
    const outfitRows = (outfitModel && Array.isArray(outfitModel.rows)) ? outfitModel.rows : [];
    for (let i = 0; i < outfitRows.length; i++) rows.push(outfitRows[i]);
  } else if (dock && tab === "missions"){
    // M6(d): the mission board — the station's fixed contracts (Q9) with
    // status, progress toward target, and the accept/complete action.
    const board = (c && c.contracts) || {};
    const activeIds = Array.isArray(board.active) ? board.active : [];
    const doneIds = Array.isArray(board.done) ? board.done : [];
    const prog = board.progress || {};
    const all = Missions.Table();
    for (let i = 0; i < all.length; i++){
      const m = all[i];
      if (!m || m.locationId !== locId) continue;
      const isActive = activeIds.indexOf(m.id) !== -1;
      const isDone = doneIds.indexOf(m.id) !== -1;
      const made = prog[m.id] || {};
      const target = m.target || {};
      const tKeys = Object.keys(target);
      let met = true;
      const progParts = [];
      for (let j = 0; j < tKeys.length; j++){
        const k = tKeys[j];
        const have = Number(made[k]) || 0;
        if (have < (Number(target[k]) || 0)) met = false;
        progParts.push(k.toUpperCase() + " " + have + "/" + target[k]);
      }
      rows.push({
        id: m.id,
        kind: "mission",
        label: m.title,
        sub: m.brief,
        priceText: "PAYOUT " + m.payout + " ⒸB",
        ownedText: isDone ? "COMPLETE" : (isActive ? ("ACTIVE // " + progParts.join(" ")) : String(m.faction || "").toUpperCase()),
        actionId: isDone ? "" : (isActive ? ("MISSION_COMPLETE:" + m.id) : ("MISSION_ACCEPT:" + m.id)),
        actionLabel: isDone ? "DONE" : (isActive ? "COMPLETE" : "ACCEPT"),
        canAct: !isDone && (!isActive || met),
        active: isActive
      });
    }
  } else if (dock && tab === "services"){
    for (let i = 0; i < fleet.length; i++){
      const e = fleet[i];
      const hullRow = wares["hull:" + (e.hull || e.type)] || {};
      const maxHp = (typeof e.maxHp === "number") ? e.maxHp : (hullRow.hp || 0);
      const hp = (typeof e.hp === "number") ? e.hp : maxHp;
      const missing = Math.max(0, maxHp - hp);
      const perHp = (market && typeof market.repairPartsPerHp === "number") ? market.repairPartsPerHp : 1;
      const repairCost = Math.round(missing * perHp);
      const want = Array.isArray(hullRow.defaultLoadout) ? hullRow.defaultLoadout : [];
      const have = Array.isArray(e.loadout) ? e.loadout : [];
      const n = Math.max(want.length, have.length);
      let swaps = 0;
      for (let j = 0; j < n; j++){ if ((want[j] || null) !== (have[j] || null)) swaps++; }
      const perSwap = (market && typeof market.refitPartsPerSwap === "number") ? market.refitPartsPerSwap : 1;
      const refitCost = swaps * perSwap;
      rows.push({
        id: String(i),
        kind: "service",
        label: String(e.hull || e.type || "?"),
        sub: "HP " + hp + "/" + maxHp + " CREW " + (e.crew || 0) + "/" + (e.maxCrew || 0),
        priceText: "REPAIR " + repairCost + "P / REFIT " + refitCost + "P",
        ownedText: "",
        canRepair: missing > 0 && (cargo.parts || 0) >= repairCost,
        canRefit: swaps > 0 && (cargo.parts || 0) >= refitCost
      });
    }
  } else if (dock){
    const kindForTab = { commodities: "commodity", hulls: "hull", weapons: "weapon" }[tab] || "commodity";
    const keys = Object.keys(wares).filter(function (k){ return wares[k].kind === kindForTab; });
    for (let i = 0; i < keys.length; i++){
      const key = keys[i];
      const w = wares[key];
      const unit = EconomyLib.Quote(c, key, locId, turn);
      const lot = (w.kind === "commodity") ? (lots[key] || 1) : 1;
      let held = 0;
      if (w.kind === "commodity") held = cargo[key] || 0;
      else if (w.kind === "weapon") held = (cargo.weapons && cargo.weapons[w.name]) || 0;
      else { for (let j = 0; j < fleet.length; j++){ if (fleet[j].hull === w.name) held++; } }
      rows.push({
        id: key,
        kind: "ware",
        label: String(w.name || key).toUpperCase(),
        sub: (w.kind === "commodity") ? ("LOT " + lot) : "",
        priceText: "BUY " + unit.buy + " / SELL " + unit.sell,
        ownedText: "HELD " + held,
        buyLabel: w.kind === "commodity" ? ("BUY " + lot) : "BUY",
        sellLabel: w.kind === "commodity" ? ("SELL " + lot) : "SELL",
        canBuy: wallet >= unit.buy * lot,
        canSell: held >= lot
      });
    }
  }

  return {
    open: Boolean(dock) || Boolean(merchant),
    mode: mode,
    tab: tab,
    tabs: tabs,
    rows: rows,
    title: merchant ? "MERCHANT FLEET" : (dock ? String(dock.name || "STATION") : "STATION"),
    subtitle: merchant
      ? ("PROVISIONS INFLATED — SALE AT A DISCOUNT" + (merchant.reason ? " (" + String(merchant.reason).toUpperCase() + ")" : ""))
      : (dock ? "STATION SERVICES — POSTED PRICES" : "NO STATION IN RANGE"),
    walletText: "WALLET " + wallet + " ⒸB   PARTS " + (cargo.parts || 0) + "   FUEL " + (cargo.fuel || 0),
    note: merchant
      ? "The caravan provisions crew and fuel at a premium and buys anything at a discount. Rescue your fleet, then move on."
      : "Posted prices: the trade executes at the quoted price; trading moves local prices for future quotes."
  };
}

// M6(b): the faction that speaks for a map location (the row's `owner`),
// else null — the trade/mission reputation counterparty.
function _locationOwner(locId){
  const locs = (CAMPAIGN_DATA && CAMPAIGN_DATA.campaign && CAMPAIGN_DATA.campaign.map && CAMPAIGN_DATA.campaign.map.locations) || [];
  for (let i = 0; i < locs.length; i++){
    if (locs[i].id === locId) return locs[i].owner || null;
  }
  return null;
}

// M4 merchant quoting: the M3 offer's multipliers over the same seeded mid
// price the station quotes — buy (player purchases) inflated, sell (player
// sells) discounted. Plain data, computed where the trade executes so the
// posted price is the price paid.
function _merchantUnit(c, good, locId, turn, offer){
  const mid = EconomyLib.PriceAt(c && c.market, good, locId, turn);
  const buyMult = (offer && typeof offer.buyMultiplier === "number") ? offer.buyMultiplier : 1.3;
  const sellMult = (offer && typeof offer.sellMultiplier === "number") ? offer.sellMultiplier : 0.7;
  return { buy: Math.round(mid * buyMult), sell: Math.round(mid * sellMult) };
}

function _stationTrade(good, sign){
  const c = GetGameState().campaign;
  const dock = _stationDock();
  const merchant = (c && c.map && c.map.pendingMerchant) ? c.map.pendingMerchant : null;
  if (!c || (!dock && !merchant)) { GameAudio.play("ui.invalid"); return; }
  const market = c.market || {};
  const lots = market.lots || {};
  const wares = market.wares || {};
  const w = wares[good];
  if (!w) { GameAudio.play("ui.invalid"); return; }
  // The merchant only PROVISIONS crew and fuel (inflated) and BUYS anything
  // (discounted) — the M3 offer's service shape.
  if (merchant && sign > 0 && good !== "crew" && good !== "fuel") { GameAudio.play("ui.invalid"); return; }
  const lot = (w.kind === "commodity") ? (lots[good] || 1) : 1;
  const turn = (c.map && typeof c.map.turn === "number") ? c.map.turn : 1;
  const locId = dock ? dock.id : ((c.map && c.map.locationId) || "");
  const unit = merchant
    ? _merchantUnit(c, good, locId, turn, merchant.offer)
    : EconomyLib.Quote(c, good, locId, turn);
  const res = EconomyLib.ApplyTrade(c, good, sign * lot, locId, unit);
  if (!res || !res.state) { GameAudio.play("ui.invalid"); return; }
  // M6(b) trade event hook: a completed trade moves the player↔owner pair
  // by the frozen trade rate (Q10: trade ±2) when the counterparty is
  // known — the location row's owner, or the merchant offer's faction (a
  // hail trade names its fleet's faction; an unnamed caravan moves nothing).
  let nextState = res.state;
  const party = merchant ? ((merchant.offer && merchant.offer.faction) || null) : _locationOwner(locId);
  if (party && Reputation){
    nextState = Object.assign({}, nextState, {
      reputation: Reputation.ApplyEvent(nextState.reputation, "trade", "player", party)
    });
  }
  TryPatchGameState({ campaign: _mirrorMapFleet(nextState) });
  GameAudio.play("ui.select");
  Hud.updateMapHud();
  Hud.toggleStationModal(true);
}

function _stationService(kind, idx, opts){
  const c = GetGameState().campaign;
  if (!c) { GameAudio.play("ui.invalid"); return; }
  const res = CampaignLib.ApplyStationService(c, Object.assign({ kind: kind, ship: idx }, opts || {}), _outfitDeps);
  if (!res || !res.state) { GameAudio.play("ui.invalid"); return; }
  TryPatchGameState({ campaign: _mirrorMapFleet(res.state) });
  GameAudio.play("ui.select");
  Hud.toggleStationModal(true);
}

const Hud = {
  // Pure reads over the game-owned view.
  isModalOpen(){ return HudLib.isModalOpen(_hudView); },
  getActiveModal(){ return HudLib.getActiveModal(_hudView); },
  isIntelVisible(){ return HudLib.isIntelVisible(_hudView); },
  getPanelRects(){ return HudLib.panelRects(_hudView); },
  getSnapshot(){ return HudLib.snapshot(_hudView); },
  getTheme(){ return State.theme || "default"; },

  // Game writes its own view fields directly (state lives in the core).
  setAudioReady(ready){ _hudView.audioReady = Boolean(ready); },

  // Data-returning operations: plain data in, plain data out, Game applies.
  syncLayout(){ _applyHudResult(HudLib.syncLayout(_hudView, _hudInput())); },
  updateLeftWing(){ _applyHudResult(HudLib.updateLeftWing(_hudView, _hudInput())); },
  updateRightWing(){ _applyHudResult(HudLib.updateRightWing(_hudView, _hudInput())); },
  updatePriorityBanner(recomputeAction = true){
    _applyHudResult(HudLib.updatePriorityBanner(_hudView, _hudInput(), recomputeAction));
  },
  showIntelOverlay(title, lines){ _applyHudResult(HudLib.showIntelOverlay(_hudView, _hudInput(), title, lines)); },
  hideIntelOverlay(){ _applyHudResult(HudLib.hideIntelOverlay(_hudView, _hudInput())); },
  toggleBridgeModal(forceState = null){ _applyHudResult(HudLib.toggleBridgeModal(_hudView, _hudInput(), forceState)); },
  renderBridgeShop(silent = false){ _applyHudResult(HudLib.renderBridgeShop(_hudView, _hudInput(), silent)); },
  toggleCampaignModal(forceState = null){ _applyHudResult(HudLib.toggleCampaignModal(_hudView, _hudInput(), forceState)); },
  renderCampaignCards(silent = false){ _applyHudResult(HudLib.renderCampaignCards(_hudView, _hudInput(), silent)); },
  toggleDeployModal(forceState = null){ _applyHudResult(HudLib.toggleDeployModal(_hudView, _hudInput(), forceState)); },
  toggleStationModal(forceState = null){ _applyHudResult(HudLib.toggleStationModal(_hudView, _hudInput(), forceState)); },
  showEndgameModal(isVictory){ _applyHudResult(HudLib.showEndgameModal(_hudView, _hudInput(), isVictory)); },
  hideEndgameModal(){ _applyHudResult(HudLib.hideEndgameModal(_hudView, _hudInput())); },
  toggleMenu(forceState = null){ _applyHudResult(HudLib.toggleMenu(_hudView, _hudInput(), forceState)); },
  isMenuOpen(){ return HudLib.isMenuOpen(_hudView); },
  toggleHelpModal(forceState = null){ _applyHudResult(HudLib.toggleHelpModal(_hudView, _hudInput(), forceState)); },
  updateAll(){
    _applyHudResult(HudLib.updateAll(_hudView, _hudInput()));
    Hud.updateMapHud();
  },
  // M3: the map screen's HUD (map status line + hailing shell) is rebuilt
  // from the live map section on every update; no-ops outside the map.
  updateMapHud(){
    const c = GetGameState().campaign;
    const mapSection = (c && c.map) || null;
    if (!mapSection) return;
    const clock = (c && c.clock) || {};
    const dock = _stationDock();
    const merchant = (c && c.map && c.map.pendingMerchant) ? c.map.pendingMerchant : null;
    _applyHudResult(HudLib.updateMapHud(_hudView, _hudInput(), mapSection, {
      wallet: (typeof c.wallet === "number") ? c.wallet : 0,
      month: clock.month || 1,
      year: clock.year || 2401,
      station: (dock || merchant)
        ? { name: merchant ? "MERCHANT FLEET" : String(dock.name || "STATION"), merchant: Boolean(merchant) }
        : null
    }));
  },
  showHailPanel(encounter){
    // M6(c): the panel carries the faction dialogue model (voice line +
    // Q11 options) built through the faction seam.
    const dlg = (Factions && encounter)
      ? Factions.DialogueModel(GetGameState().campaign, encounter, _hailTalkCount)
      : null;
    _applyHudResult(HudLib.showHailPanel(_hudView, _hudInput(), encounter, dlg));
  },
  hideHailPanel(){ _applyHudResult(HudLib.hideHailPanel(_hudView, _hudInput())); },
  // Pure model reads (test bridge): hail dialogue + map HUD models.
  hailModel(encounter){ return HudLib.hailModel(_hudView, _hudInput(), encounter); },
  hailPanel(encounter, dialogue){ return HudLib.hailPanel(_hudView, _hudInput(), encounter, dialogue); },
  mapHudModel(mapState, extra = null){ return HudLib.mapHudModel(_hudView, _hudInput(), mapState, extra); },
  setTheme(theme){
    // Game owns the active theme: it resolves the key and passes it down as
    // plain data; the child returns the requested theme in its result and
    // _applyHudResult applies State.theme / body attribute / audio SET_THEME.
    const key = Themes.normalize(theme);
    const input = _hudInput();
    input.state.theme = key;
    _applyHudResult(HudLib.applyTheme(_hudView, input, key));
    return key;
  }
};

// ======================== INPUT PROCESSOR (V66) ========================
// Consumes 1-way InputEventDTOs from InputInterface and resolves all UI
// hit-testing, HUD panel occlusion, minimap dragging, camera pan/zoom,
// cursor state, and tactical board orders inside Game.
const InputProcessor = (() => {
  let _isMinimapDragging = false;
  let _isMouseInsideCanvas = false;
  let _cursor = "crosshair";

  function _pointInRect(px, py, r){
    return Boolean(r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
  }

  function _hitTestCanvasButton(px, py){
    const btns = Array.isArray(State.canvasButtons) ? State.canvasButtons : [];
    for (let i = 0; i < btns.length; i++){
      const b = btns[i];
      if (_pointInRect(px, py, b)) return b;
    }
    return null;
  }

  function _hitTestHudPanel(px, py){
    const panels = Hud.getPanelRects();
    if (!panels) return null;
    if (Hud.isIntelVisible() && _pointInRect(px, py, panels.intelOverlay)) return "intelOverlay";
    if (_pointInRect(px, py, panels.menu)) return "menu";
    if (_pointInRect(px, py, panels.minimap)) return "minimap";
    if (_pointInRect(px, py, panels.topBar)) return "topBar";
    if (_pointInRect(px, py, panels.selectedCard)) return "selectedCard";
    if (_pointInRect(px, py, panels.hoveredCard)) return "hoveredCard";
    return null;
  }

  function _getHoverContext(cell){
    const u = MathGrid.getUnitAt(cell.x, cell.y);
    if (u && u.team === 2 && Visibility.isUnitSpottedByTeam(u, 1)) return "hostile";
    if (u && u.team === 1) return "occupied";
    const selUnit = Selection.getUnit();
    if (selUnit && selUnit.team === 1 && State.activeTeam === 1 && Actions.getPriorityActionAt(selUnit, cell.x, cell.y)){
      return "actionable";
    }
    return "empty";
  }

  function _panCameraFromMinimap(px, py){
    const panels = Hud.getPanelRects();
    const mm = panels ? panels.minimap : null;
    if (!mm) return false;
    const u = Math.max(0, Math.min(1, (px - (mm.x + 1)) / Math.max(1, mm.w - 2)));
    const v = Math.max(0, Math.min(1, (py - (mm.y + 1)) / Math.max(1, mm.h - 2)));
    const gx = u * GRID_SIZE;
    const gy = v * GRID_SIZE;
    if (State.zoomAnim) State.zoomAnim.active = false;
    State.viewX = Math.round(gx - State.viewSpan * 0.5);
    State.viewY = Math.round(gy - State.viewSpan * 0.5);
    MathGrid.clampViewport();
    return true;
  }

  function _updateCursor(hitBtn, hitPanel){
    if (_isMinimapDragging){
      _cursor = "grabbing";
      return;
    }
    if (hitBtn){
      _cursor = hitBtn.enabled !== false ? "pointer" : "not-allowed";
      return;
    }
    if (Hud.isModalOpen()){
      _cursor = "default";
      return;
    }
    if (hitPanel === "minimap" || hitPanel === "intelOverlay"){
      _cursor = "pointer";
      return;
    }
    if (hitPanel){
      _cursor = "default";
      return;
    }
    if (State.hoveredCell){
      const u = MathGrid.getUnitAt(State.hoveredCell.x, State.hoveredCell.y);
      const spotted = Boolean(u && Visibility.isUnitSpottedByTeam(u, 1));
      const selUnit = Selection.getUnit();
      const hasAct = Boolean(selUnit && selUnit.team === 1 && State.activeTeam === 1 && Actions.getPriorityActionAt(selUnit, State.hoveredCell.x, State.hoveredCell.y));
      _cursor = (hasAct || spotted) ? "pointer" : "crosshair";
      return;
    }
    _cursor = "crosshair";
  }

  function refreshHoverFromCamera(){
    if (Hud.isModalOpen() || !_isMouseInsideCanvas){
      if (State.hoveredCell !== null){
        State.hoveredCell = null;
        Hud.updateRightWing();
      }
      Hud.updatePriorityBanner(true);
      _updateCursor(null, null);
      return;
    }
    const px = State.mousePx ? State.mousePx.x : -1;
    const py = State.mousePx ? State.mousePx.y : -1;
    if (px < 0 || py < 0) return;

    const hitBtn = _hitTestCanvasButton(px, py);
    const nextBtnId = hitBtn ? hitBtn.id : null;
    if (State.buttonHovered !== nextBtnId){
      State.buttonHovered = nextBtnId;
    }
    const hitPanel = hitBtn ? null : _hitTestHudPanel(px, py);
    if (hitBtn || hitPanel){
      if (State.hoveredCell !== null){
        State.hoveredCell = null;
        Hud.updateRightWing();
      }
      Hud.updatePriorityBanner(true);
      _updateCursor(hitBtn, hitPanel);
      return;
    }

    const cell = MathGrid.pixelToGrid(px, py);
    const changed = !State.hoveredCell || State.hoveredCell.x !== cell.x || State.hoveredCell.y !== cell.y;
    if (changed){
      State.hoveredCell = cell;
      Hud.updateRightWing();
    }
    Hud.updatePriorityBanner(true);
    _updateCursor(null, null);
  }

  function _handleCanvasButtonClick(btn){
    if (!btn) return;
    if (btn.enabled === false){
      GameAudio.play("ui.invalid");
      return;
    }
    if (btn.id === "REINFORCEMENTS"){
      Hud.toggleMenu(false);
      Hud.toggleBridgeModal();
    } else if (btn.id === "MENU"){
      Hud.toggleMenu();
    } else if (btn.id === "MENU_MAP"){
      Hud.toggleMenu(false);
      Hud.toggleCampaignModal(true);
    } else if (btn.id === "MENU_THEME"){
      Hud.toggleMenu(false);
      Hud.setTheme(Themes.next(State.theme));
      GameAudio.play("ui.select");
    } else if (btn.id === "MENU_AUDIO"){
      Hud.toggleMenu(false);
      if (!GameAudio.isReady()){
        GameAudio.unlock();
      } else {
        GameAudio.toggleMute();
        GameAudio.play("ui.select");
      }
      Hud.syncLayout();
    } else if (btn.id === "MENU_SHIELD"){
      Hud.toggleMenu(false);
      const selUnit = Selection.getUnit();
      if (selUnit && selUnit.team === 1 && Actions.canShield(selUnit, { x: selUnit.x, y: selUnit.y })){
        Actions.executeShield(selUnit, false);
      } else {
        GameAudio.play("ui.invalid");
      }
    } else if (btn.id === "MENU_HELP"){
      Hud.toggleMenu(false);
      Hud.toggleHelpModal(true);
    } else if (btn.id === "END_TURN"){
      const mapSection = _mapSection();
      if (mapSection && mapSection.screen === "map"){
        // Map screen: END TURN commits the map turn (an opened encounter
        // launches its battle instead — M3: next turn).
        _mapTurnCommit();
      } else if (State.activeTeam === 1 && !State.gameOver){
        Actions.consumeAPAndCheckTurn(false, Math.max(1, State.ap));
      }
    } else if (btn.id === "HAIL_TALK" || btn.id === "HAIL_THREATEN" || btn.id === "HAIL_TRADE"){
      // M6(c): the Q11 dialogue choices run through the faction outcome
      // seam — talk advances the voice, threaten takes the fight path,
      // trade opens the fleet storefront.
      const map = _mapSection();
      const enc = (map && map.pendingEncounter) || null;
      const choice = btn.id.slice("HAIL_".length).toLowerCase();
      const res = Factions.ApplyDialogueOutcome(GetGameState().campaign, enc, choice, RND);
      if (res && res.state && res.state !== GetGameState().campaign){
        TryPatchGameState({ campaign: res.state });
      }
      if (choice === "talk"){
        _hailTalkCount++;
        const dlg = Factions.DialogueModel(GetGameState().campaign, enc, _hailTalkCount);
        _applyHudResult(HudLib.showHailPanel(_hudView, _hudInput(), enc, dlg));
      } else if (choice === "threaten"){
        if (enc) { _launchEncounterBattle(enc); }
        else { GameAudio.play("ui.select"); }
      } else if (choice === "trade"){
        const offer = Object.assign({}, CampaignMapLib.MerchantOffer(map, "player", "hail"), {
          faction: (enc && enc.encounterFaction) ? enc.encounterFaction : null
        });
        _patchMap({ pendingMerchant: { reason: "hail", offer: offer } });
        Hud.toggleStationModal(true);
        GameAudio.play("ui.modal.open");
      }
    } else if (btn.id === "HAIL_LEAVE"){
      // M6(c): the interaction ends — dismiss the shell and re-place the
      // moving fleet on one of the nearest open squares (DESIGN §4.4); the
      // pending battle clears (the map continues).
      const leaveMap = _mapSection();
      const leaveEnc = (leaveMap && leaveMap.pendingEncounter) || null;
      const res = Factions.ApplyDialogueOutcome(GetGameState().campaign, leaveEnc, "leave", RND);
      if (res && res.state && res.state !== GetGameState().campaign){
        TryPatchGameState({ campaign: res.state });
      }
      Hud.hideHailPanel();
      _patchMap({ pendingEncounter: null });
      GameAudio.play("ui.modal.close");
    } else if (typeof btn.id === "string" && btn.id.indexOf("MISSION_ACCEPT:") === 0){
      // M6(d): accept a posted contract (Q9) — it starts counting progress.
      const mid = btn.id.slice("MISSION_ACCEPT:".length);
      const cNow = GetGameState().campaign;
      const accepted = Missions.Accept(cNow, mid);
      if (accepted !== cNow){
        TryPatchGameState({ campaign: accepted });
        State.turnReportQueue.push("CONTRACT ACCEPTED // " + mid.toUpperCase() + " — see the mission board for progress.");
        GameAudio.play("ui.select");
      } else {
        GameAudio.play("ui.invalid");
      }
      Hud.updateMapHud();
      Hud.toggleStationModal(true);
    } else if (typeof btn.id === "string" && btn.id.indexOf("MISSION_COMPLETE:") === 0){
      // M6(d): settle a contract — payout into the wallet and the mission
      // reputation event toward the offering faction (Q10: ±15); the final
      // contract of the chain sets the campaign-complete state (Q9).
      const mid = btn.id.slice("MISSION_COMPLETE:".length);
      const cNow = GetGameState().campaign;
      const settled = Missions.Complete(cNow, mid);
      if (settled.completed){
        let next = settled.state;
        const row = Missions.Table().filter(function (mm){ return mm.id === mid; })[0] || null;
        const party = row ? row.faction : null;
        if (party && Reputation){
          next = Object.assign({}, next, {
            reputation: Reputation.ApplyEvent(next.reputation, "mission", "player", party)
          });
        }
        TryPatchGameState({ campaign: next });
        State.turnReportQueue.push("CONTRACT COMPLETE // " + (row ? row.title : mid) + " — PAID " + settled.payout + " ⒸB.");
        if (settled.final){
          State.turnReportQueue.push("CAMPAIGN COMPLETE // the final contract is closed. The sector is yours.");
        }
        GameAudio.play("ui.select");
      } else {
        GameAudio.play("ui.invalid");
      }
      Hud.updateMapHud();
      Hud.toggleStationModal(true);
    } else if (btn.id === "STATION_OPEN"){
      Hud.toggleStationModal(true);
    } else if (btn.id === "STATION_CLOSE"){
      Hud.toggleStationModal(false);
    } else if (typeof btn.id === "string" && btn.id.indexOf("STATION_TAB:") === 0){
      _stationCtx.tab = btn.id.slice("STATION_TAB:".length);
      Hud.toggleStationModal(true);
      GameAudio.play("ui.select");
    } else if (typeof btn.id === "string" && btn.id.indexOf("WEAPON_PICK:") === 0){
      // M5(c) Q8: the per-shot weapon pick (the red numbers follow it).
      const selUnit = Selection.getUnit();
      const wName = btn.id.slice("WEAPON_PICK:".length);
      if (selUnit && selUnit.team === 1){
        _pendingWeapon = { unitId: selUnit.id, name: wName };
        Hud.updateAll();
        GameAudio.play("ui.select");
      } else {
        GameAudio.play("ui.invalid");
      }
    } else if (typeof btn.id === "string" && btn.id.indexOf("STATION_BUY:") === 0){
      _stationTrade(btn.id.slice("STATION_BUY:".length), 1);
    } else if (typeof btn.id === "string" && btn.id.indexOf("STATION_SELL:") === 0){
      _stationTrade(btn.id.slice("STATION_SELL:".length), -1);
    } else if (typeof btn.id === "string" && btn.id.indexOf("STATION_REPAIR:") === 0){
      _stationService("repair", Number(btn.id.slice("STATION_REPAIR:".length)));
    } else if (typeof btn.id === "string" && btn.id.indexOf("STATION_REFIT:") === 0){
      _stationService("refit", Number(btn.id.slice("STATION_REFIT:".length)));
    } else if (typeof btn.id === "string" && btn.id.indexOf("OUTFIT_SELECT:") === 0){
      // M5(d): pick the ship to outfit (the tab re-renders with its mounts).
      _stationCtx.outfitShip = Number(btn.id.slice("OUTFIT_SELECT:".length));
      Hud.toggleStationModal(true);
      GameAudio.play("ui.select");
    } else if (typeof btn.id === "string" && btn.id.indexOf("OUTFIT_MOUNT:") === 0){
      const rest = btn.id.slice("OUTFIT_MOUNT:".length);
      const sep = rest.indexOf(":");
      _stationService("outfit", Number(rest.slice(0, sep)), { add: rest.slice(sep + 1) });
    } else if (typeof btn.id === "string" && btn.id.indexOf("OUTFIT_UNMOUNT:") === 0){
      const rest = btn.id.slice("OUTFIT_UNMOUNT:".length);
      const sep = rest.indexOf(":");
      _stationService("outfit", Number(rest.slice(0, sep)), { remove: rest.slice(sep + 1) });
    } else if (btn.id === "CLOSE_MODAL"){
      if (_pendingDeploy){
        const lvlId = _pendingDeploy.levelId;
        const choice = (_pendingDeploy.selected || []).slice();
        const enc = _pendingDeploy.encounter || null;
        _pendingDeploy = null;
        Hud.toggleDeployModal(false);
        SectorGenerator.generate(lvlId, { choice: choice, encounter: enc });
      } else {
        Hud.toggleBridgeModal(false);
        Hud.toggleCampaignModal(false);
        Hud.toggleHelpModal(false);
        Hud.toggleStationModal(false);
      }
    } else if (typeof btn.id === "string" && btn.id.indexOf("RESERVE_SUMMON:") === 0){
      const shipName = btn.id.slice("RESERVE_SUMMON:".length);
      const us = State.units || [];
      let flag = null;
      for (let i = 0; i < us.length; i++){
        if (us[i].hp > 0 && us[i].team === 1 && us[i].flags.has("!flagship")){ flag = us[i]; break; }
      }
      // M4 (DESIGN §4.5): an under-crewed reserve hull cannot deploy to the
      // battle — summoning is a deployment.
      let crewOk = true;
      const reserve = Array.isArray(State.battleReserve) ? State.battleReserve : [];
      for (let i = 0; i < reserve.length; i++){
        const e = reserve[i];
        if ((e.hull || e.type) === shipName){
          crewOk = ActionLegality.CrewStatus(e) !== "incapacitated";
          break;
        }
      }
      if (flag && crewOk){
        Hud.toggleBridgeModal(false);
        Actions.executeWarpIn(flag, shipName, false);
      } else {
        GameAudio.play("ui.invalid");
      }
    } else if (typeof btn.id === "string" && btn.id.indexOf("DEPLOY_TOGGLE:") === 0){
      const idx = Number(btn.id.slice("DEPLOY_TOGGLE:".length));
      if (_pendingDeploy && Number.isFinite(idx)){
        const fleet = _pendingDeploy.fleet || [];
        const entry = fleet[idx];
        const locked = entry && (entry.flagship === true || String(entry.hull || "").indexOf("Flagship") !== -1);
        if (!locked){
          const cur = _pendingDeploy.selected || [];
          const pos = cur.indexOf(idx);
          if (pos !== -1){
            cur.splice(pos, 1);
          } else if (cur.length < _pendingDeploy.capacity){
            cur.push(idx);
          }
          _pendingDeploy.selected = cur;
          Hud.toggleDeployModal(true);
        }
      }
    } else if (btn.id === "DEPLOY_CONFIRM"){
      if (_pendingDeploy){
        const lvlId = _pendingDeploy.levelId;
        const choice = (_pendingDeploy.selected || []).slice();
        const enc = _pendingDeploy.encounter || null;
        _pendingDeploy = null;
        Hud.toggleDeployModal(false);
        SectorGenerator.generate(lvlId, { choice: choice, encounter: enc });
      }
    } else if (typeof btn.id === "string" && btn.id.indexOf("LEVEL_SELECT:") === 0){
      // M3: RETIRED — the level ladder is no longer the encounter source.
      // Battles launch from map encounters (the encounter resolver ->
      // pendingEncounter -> the next turn starts the battle through the M2
      // seam). The level table stays as battle flavor data the map rows
      // point at.
      GameAudio.play("ui.invalid");
    } else if (btn.id === "ENDGAME_RETRY"){
      Hud.hideEndgameModal();
      GameAudio.play("ui.select");
      SectorGenerator.generate(State.levelId, { choice: undefined });
    } else if (btn.id === "ENDGAME_MAP"){
      Hud.toggleCampaignModal(true);
    }
  }

  function _toCanvasPx(evt){
    const ds = (_host && _host.metrics && _host.metrics.displaySize) ? _host.metrics.displaySize : 768;
    return {
      px: evt.u * ds,
      py: evt.v * ds,
      ds
    };
  }

  function _handleEvent(evt){
    if (!evt) return;
    if (evt.type === "POINTER_MOVE"){
      _isMouseInsideCanvas = true;
      const { px, py } = _toCanvasPx(evt);
      if (State.mousePx && typeof State.mousePx === "object"){
        State.mousePx.x = px;
        State.mousePx.y = py;
      } else {
        State.mousePx = { x: px, y: py };
      }

      if (_isMinimapDragging){
        _panCameraFromMinimap(px, py);
        _updateCursor(null, "minimap");
        return;
      }

      const hitBtn = _hitTestCanvasButton(px, py);
      const nextBtnId = hitBtn ? hitBtn.id : null;
      if (State.buttonHovered !== nextBtnId){
        State.buttonHovered = nextBtnId;
      }

      if (hitBtn){
        if (State.hoveredCell !== null){
          State.hoveredCell = null;
          Hud.updateRightWing();
        }
        Hud.updatePriorityBanner(true);
        _updateCursor(hitBtn, null);
        return;
      }

      if (Hud.isModalOpen()){
        if (State.hoveredCell !== null){
          State.hoveredCell = null;
          Hud.updateRightWing();
        }
        Hud.updatePriorityBanner(true);
        _updateCursor(null, null);
        return;
      }

      const hitPanel = _hitTestHudPanel(px, py);
      if (hitPanel){
        if (State.hoveredCell !== null){
          State.hoveredCell = null;
          Hud.updateRightWing();
        }
        Hud.updatePriorityBanner(true);
        _updateCursor(null, hitPanel);
        return;
      }

      const cell = MathGrid.pixelToGrid(px, py);
      const changed = !State.hoveredCell || State.hoveredCell.x !== cell.x || State.hoveredCell.y !== cell.y;
      if (changed){
        State.hoveredCell = cell;
        const hovCtx = _getHoverContext(cell);
        if (hovCtx !== "empty"){
          GameAudio.play("unit.hover", { from: cell, context: hovCtx });
        }
        Hud.updateRightWing();
        Hud.updatePriorityBanner(true);
        _updateCursor(null, null);
      } else {
        Hud.updatePriorityBanner(false);
      }
      return;
    }

    if (evt.type === "POINTER_LEAVE"){
      _isMouseInsideCanvas = false;
      State.hoveredCell = null;
      State.buttonHovered = null;
      Hud.updateRightWing();
      Hud.updatePriorityBanner(true);
      _updateCursor(null, null);
      return;
    }

    if (evt.type === "WHEEL"){
      if (Hud.isModalOpen() || evt.deltaY === 0) return;
      const ds = (_host && _host.metrics && _host.metrics.displaySize) ? _host.metrics.displaySize : 768;
      const result = MathGrid.resolveZoom(
        State.viewX, State.viewY, State.viewSpan,
        State.mousePx, evt.deltaY, ds
      );
      if (!result.changed) return;

      const now = performance.now();
      const anim = State.zoomAnim;
      if (anim.active){
        const t = Math.min(1, Math.max(0, (now - anim.start) / anim.duration));
        const ease = 1 - Math.pow(1 - t, 3);
        anim.fromSpan = anim.fromSpan + (anim.toSpan - anim.fromSpan) * ease;
        anim.fromX = anim.fromX + (anim.toX - anim.fromX) * ease;
        anim.fromY = anim.fromY + (anim.toY - anim.fromY) * ease;
      } else {
        anim.fromSpan = State.viewSpan;
        anim.fromX = State.viewX;
        anim.fromY = State.viewY;
      }
      anim.toSpan = result.viewSpan;
      anim.toX = result.viewX;
      anim.toY = result.viewY;
      anim.start = now;
      anim.duration = 180;
      anim.active = true;

      State.viewSpan = result.viewSpan;
      State.viewX = result.viewX;
      State.viewY = result.viewY;
      MathGrid.clampViewport();
      GameAudio.play("ui.zoom");
      refreshHoverFromCamera();
      return;
    }

    if (evt.type === "POINTER_DOWN"){
      const { px, py, ds } = _toCanvasPx(evt);
      const hitBtn = _hitTestCanvasButton(px, py);
      if (hitBtn){
        State.buttonHovered = hitBtn.id;
        State.buttonPressed = hitBtn.id;
        _updateCursor(hitBtn, null);
        return;
      }
      if (Hud.isMenuOpen()){
        // Clicking outside the dropdown closes it without reaching the board.
        Hud.toggleMenu(false);
        refreshHoverFromCamera();
        return;
      }
      if (Hud.isModalOpen()) return;

      const hitPanel = _hitTestHudPanel(px, py);
      if (hitPanel === "minimap"){
        _isMinimapDragging = true;
        _panCameraFromMinimap(px, py);
        GameAudio.play("ui.select");
        _updateCursor(null, "minimap");
        return;
      }
      if (hitPanel === "intelOverlay"){
        Hud.hideIntelOverlay();
        GameAudio.play("ui.select");
        refreshHoverFromCamera();
        return;
      }
      if (hitPanel) return;

      if (Hud.isIntelVisible()){
        Hud.hideIntelOverlay();
      }

      // M3: on the campaign-map screen a canvas click moves the fleet
      // (jump between gravity wells, travel otherwise) — the board's
      // selection/combat hit-testing below is battle-screen only.
      const mapScreen = _mapSection();
      if (mapScreen && mapScreen.screen === "map"){
        _mapClick(px, py, ds);
        refreshHoverFromCamera();
        return;
      }

      if (State.gameOver || State.activeTeam !== 1){
        GameAudio.play("ui.invalid");
        return;
      }

      const B = MathGrid.pixelToGrid(px, py);
      const selUnit = Selection.getUnit();
      const clickedUnit = MathGrid.getUnitAt(B.x, B.y);
      const cellPx = ds / Math.max(1, State.viewSpan || 16);
      const localX = (px / cellPx + State.viewX) - B.x;
      const localY = (py / cellPx + State.viewY) - B.y;

      if (clickedUnit && clickedUnit.team === 1){
        if (selUnit && selUnit.id === clickedUnit.id){
          const clickedShieldBadge = (localX >= 0.56 && localY <= 0.44);
          if (clickedShieldBadge && Actions.canShield(selUnit, B)){
            Actions.executeShield(selUnit, false);
            return;
          }
          Selection.select(null);
          GameAudio.play("ui.select");
          Hud.updateAll();
          return;
        }
        Selection.select(clickedUnit);
        GameAudio.play("unit.select", { from: B });
        Hud.updateAll();
        return;
      }

      if (selUnit && selUnit.team === 1){
        const canCap = Actions.canCapture(selUnit, B);
        const canFire = Actions.canShoot(selUnit, B);
        if (canCap && canFire && clickedUnit){
          const wantsBoard = Boolean(evt.shiftKey || (localX <= 0.45 && localY <= 0.45));
          if (wantsBoard){
            Actions.executeCapture(selUnit, clickedUnit, false);
          } else {
            Actions.executeShoot(selUnit, clickedUnit, false);
          }
          return;
        }
        const act = Actions.getPriorityActionAt(selUnit, B.x, B.y);
        if (act === "MOVE"){ Actions.executeMove(selUnit, B, false); return; }
        if (act === "CAPTURE"){ Actions.executeCapture(selUnit, clickedUnit, false); return; }
        if (act === "SHOOT"){ Actions.executeShoot(selUnit, clickedUnit, false); return; }
        if (!clickedUnit){
          Selection.select(null);
          GameAudio.play("ui.select");
          Hud.updateAll();
          return;
        }
      }

      if (!clickedUnit && selUnit){
        Selection.select(null);
        GameAudio.play("ui.select");
        Hud.updateAll();
        return;
      }

      GameAudio.play("ui.invalid");
      return;
    }

    if (evt.type === "CONTEXT_MENU"){
      if (Hud.isModalOpen()) return;
      if (Selection.getUnit()){
        Selection.select(null);
        GameAudio.play("ui.select");
        Hud.updateAll();
        refreshHoverFromCamera();
      }
      return;
    }

    if (evt.type === "POINTER_UP"){
      const { px, py } = _toCanvasPx(evt);
      if (_isMinimapDragging){
        _isMinimapDragging = false;
        refreshHoverFromCamera();
      }
      if (State.buttonPressed !== null){
        const pressedId = State.buttonPressed;
        State.buttonPressed = null;
        const releaseBtn = _hitTestCanvasButton(px, py);
        if (releaseBtn && releaseBtn.id === pressedId){
          _handleCanvasButtonClick(releaseBtn);
        }
        refreshHoverFromCamera();
      }
      return;
    }

    if (evt.type === "KEY_DOWN"){
      if (evt.code === "KeyW" || evt.code === "KeyA" || evt.code === "KeyS" || evt.code === "KeyD"){
        if (Hud.isModalOpen()) return;
        if (!State.keysDown.has(evt.code)){
          State.keysDown.add(evt.code);
          State.lastPanTime = 0;
        }
        return;
      }
      if (evt.repeat) return;

      if (evt.code === "Space"){
        const modal = Hud.getActiveModal();
        if (modal !== null && modal !== "bridge") return;
        Hud.toggleMenu(false);
        Hud.toggleBridgeModal();
        refreshHoverFromCamera();
      } else if (evt.key === "i" || evt.key === "I"){
        if (!State.inspectMode){
          State.inspectMode = true;
          GameAudio.play("ui.inspect");
          Hud.updateRightWing();
        }
      } else if (evt.code === "Escape"){
        if (Hud.isMenuOpen()){
          Hud.toggleMenu(false);
        } else if (Hud.isModalOpen()){
          Hud.toggleBridgeModal(false);
          Hud.toggleCampaignModal(false);
          Hud.toggleHelpModal(false);
        } else if (Selection.getUnit()){
          Selection.select(null);
          GameAudio.play("ui.select");
          Hud.updateAll();
        }
        refreshHoverFromCamera();
      }
      return;
    }

    if (evt.type === "KEY_UP"){
      if (evt.code === "KeyW" || evt.code === "KeyA" || evt.code === "KeyS" || evt.code === "KeyD"){
        State.keysDown.delete(evt.code);
        return;
      }
      if (evt.key === "i" || evt.key === "I"){
        if (State.inspectMode){
          State.inspectMode = false;
          Hud.updateRightWing();
        }
      }
      return;
    }

    if (evt.type === "BLUR"){
      _isMinimapDragging = false;
      State.keysDown.clear();
      if (State.buttonPressed !== null) State.buttonPressed = null;
      if (State.inspectMode){
        State.inspectMode = false;
        Hud.updateRightWing();
      }
      return;
    }

    if (evt.type === "RESIZE"){
      if (_host && typeof _host.handleResize === "function"){
        _host.handleResize();
      }
      refreshHoverFromCamera();
    }
  }

  function drainAndProcess(){
    if (!_inputConsumer || typeof _inputConsumer.drainEvents !== "function") return;
    const events = _inputConsumer.drainEvents();
    for (let i = 0; i < events.length; i++){
      _handleEvent(events[i]);
    }
  }

  function stepPan(now){
    if (State.keysDown.size > 0 && !Hud.isModalOpen()){
      if (now - State.lastPanTime > 80){
        let dx = 0, dy = 0;
        if (State.keysDown.has("KeyW")) dy -= 1;
        if (State.keysDown.has("KeyS")) dy += 1;
        if (State.keysDown.has("KeyA")) dx -= 1;
        if (State.keysDown.has("KeyD")) dx += 1;
        if (dx !== 0 || dy !== 0){
          const prevX = State.viewX;
          const prevY = State.viewY;
          State.viewX += dx;
          State.viewY += dy;
          MathGrid.clampViewport();
          const actualDx = State.viewX - prevX;
          const actualDy = State.viewY - prevY;
          if (State.zoomAnim && State.zoomAnim.active && (actualDx !== 0 || actualDy !== 0)){
            State.zoomAnim.fromX += actualDx;
            State.zoomAnim.toX += actualDx;
            State.zoomAnim.fromY += actualDy;
            State.zoomAnim.toY += actualDy;
          }
          State.lastPanTime = now;
          if (actualDx !== 0 || actualDy !== 0){
            refreshHoverFromCamera();
          }
        }
      }
    }
  }

  function getCursor(){
    return _cursor;
  }

  return {
    drainAndProcess,
    stepPan,
    refreshHoverFromCamera,
    getCursor
  };
})();

// ======================== AI TURN RUNNER ========================
// Folded into game.js (V65) so ai.js (getAIAction) is a direct
// pure-function child of game.js.
const AI = {
  _snapshot(withRolls = false, syncOnly = false){
    const aiUnitsCount = State.units.filter(u => u.hp > 0 && u.team === 2).length;
    const rolls = withRolls ? Array.from({length: aiUnitsCount}, () => RND()) : [];
    const clonedUnits = Array.isArray(State.units)
      ? State.units.map(u => ({ ...u, flags: new Set(u.flags) }))
      : [];
    const clonedTerrain = Array.isArray(State.terrain)
      ? State.terrain.map(col => Array.isArray(col) ? col.slice() : [])
      : [];
    const snap = {
      gridSize: GRID_SIZE,
      spawnRadius: SPAWN_RADIUS,
      difficulty: DIFFICULTY,
      difficultyTable: DIFFICULTY_TABLE,
      shipSpecs: SHIP_SPECS,
      aiDoctrine: State.aiDoctrine,
      // M6(a): the battle's faction identity and its scorer multipliers,
      // delivered as plain data (the scorer folds them over the profile).
      aiFaction: State.faction || null,
      aiFactionWeights: (State.faction && Factions) ? Factions.ScorerWeights(State.faction) : null,
      turnNumber: State.turnNumber,
      activeTeam: State.activeTeam,
      ap: State.ap,
      credits: State.credits ? { ...State.credits } : { 1: 0, 2: 0 },
      terrain: clonedTerrain,
      units: clonedUnits,
      // O(1) Rules.getUnitAt during planning (the board does not change while
      // the AI evaluates a beat; a new snapshot is built every beat).
      unitIndex: Rules.buildUnitIndex(clonedUnits),
      lastSeenEnemies: new Map(State.lastSeenEnemies),
      reservations: (State.aiPlan && State.aiPlan.reservations) ? new Map(State.aiPlan.reservations) : new Map(),
      aiEmergencyMode: State.aiEmergencyMode,
      aiScoreTrace: deepCopy(State.aiScoreTrace),
      gameOver: State.gameOver,
      rolls,
      roll: withRolls ? RND() : 1,
      syncOnly,
      rules: PURE_RULES
    };
    // One-way boundary: the DTO is deep-frozen, so the AI tree can only read
    // it — it returns a result object instead of decorating the snapshot.
    return deepFreeze(snap);
  },
  getAIAction(snap){
    return getAIAction(snap);
  },
  syncMemory(){
    if (typeof getAIAction !== "function") return;
    const snap = this._snapshot(false, true);
    const res = getAIAction(snap);
    State.lastSeenEnemies = res.lastSeenEnemies;
  },
  chooseBestPlan(){
    if (typeof getAIAction !== "function") return null;
    const snap = this._snapshot(true, false);
    const res = getAIAction(snap);
    State.lastSeenEnemies = res.lastSeenEnemies;
    State.aiEmergencyMode = res.aiEmergencyMode;
    State.aiScoreTrace = res.aiScoreTrace;
    const action = res.action;
    const coord = res.coord;
    if (!action || action === "NONE") return null;
    const dec = res.decision || {};
    const pl = res.selectedPlan || {};
    return {
      action,
      coord,
      unitId: dec.unitId !== undefined ? dec.unitId : pl.unitId,
      apCost: dec.apCost !== undefined ? dec.apCost : (pl.apCost !== undefined ? pl.apCost : 1),
      steps: dec.steps || pl.steps || [],
      score: dec.score !== undefined ? dec.score : pl.score
    };
  },
  beat(){
    if (State.gameOver || State.activeTeam !== 2) return false;
    if (State.ap <= 0) return false;
    if (typeof getAIAction !== "function") return false;
    const snap = this._snapshot(true, false);
    const res = getAIAction(snap);
    State.lastSeenEnemies = res.lastSeenEnemies;
    State.aiEmergencyMode = res.aiEmergencyMode;
    State.aiScoreTrace = res.aiScoreTrace;
    if (!State.aiPlan) State.aiPlan = {reservations: new Map(), currentPlan: null, stepIndex: 0};
    State.aiPlan.reservations = res.reservations;
    State.aiPlan.currentPlan = res.selectedPlan || null;
    State.aiPlan.stepIndex = 0;

    const action = res.action;
    const coord = res.coord;
    const dec = res.decision || null;
    const actingUnit = (dec && dec.unitId !== undefined)
      ? State.units.find(u => u.id === dec.unitId && u.hp > 0 && u.team === 2) || null
      : null;
    const gx = Array.isArray(coord) ? coord[0] : -1;
    const gy = Array.isArray(coord) ? coord[1] : -1;

    if (typeof action === "string" && action.startsWith("WARP:")){
      const shipType = action.slice(5);
      const capitalUnit = actingUnit || MathGrid.getUnitAt(gx, gy);
      if (capitalUnit){
        Actions.executeWarpIn(capitalUnit, shipType, true, 1, (dec && dec.warpOpts) || res.warpOpts || {});
      } else {
        GameAudio.play("enemy.unknownAction", {team:2, isVisible:false});
        Actions.consumeAPAndCheckTurn(true, 1);
      }
    } else if (action === "MOVE"){
      if (actingUnit){
        Actions.executeMove(actingUnit, {x: gx, y: gy}, true, 1);
      } else {
        GameAudio.play("enemy.unknownAction", {team:2, isVisible:false});
        Actions.consumeAPAndCheckTurn(true, 1);
      }
    } else if (action === "SHOOT"){
      const target = MathGrid.getUnitAt(gx, gy);
      if (actingUnit && target){
        Actions.executeShoot(actingUnit, target, true, 1);
      } else {
        GameAudio.play("enemy.unknownAction", {team:2, isVisible:false});
        Actions.consumeAPAndCheckTurn(true, 1);
      }
    } else if (action === "CAPTURE"){
      const target = MathGrid.getUnitAt(gx, gy);
      if (actingUnit && target){
        Actions.executeCapture(actingUnit, target, true, 1);
      } else {
        GameAudio.play("enemy.unknownAction", {team:2, isVisible:false});
        Actions.consumeAPAndCheckTurn(true, 1);
      }
    } else if (action === "SHIELD"){
      const unit = actingUnit || MathGrid.getUnitAt(gx, gy);
      if (unit){
        Actions.executeShield(unit, true, 1);
      } else {
        GameAudio.play("enemy.unknownAction", {team:2, isVisible:false});
        Actions.consumeAPAndCheckTurn(true, 1);
      }
    } else {
      GameAudio.play("enemy.unknownAction", {team:2, isVisible:false});
      Actions.consumeAPAndCheckTurn(true, 1);
    }
    return true;
  },
  executeTurn(){
    if (State.gameOver || State.activeTeam !== 2) return;
    State.aiPlan = {reservations: new Map(), currentPlan: null, stepIndex: 0};
    let beats = 0;
    const maxBeats = 12;

    const runBeat = () => {
      if (State.gameOver || State.activeTeam !== 2) return;
      if (State.ap <= 0 || beats >= maxBeats){
        const endTimer = setTimeout(() => { Actions.transitionToPlayerTurn(); }, 460);
        State.aiTimers.push(endTimer);
        return;
      }
      beats++;
      this.beat();
      const t = setTimeout(runBeat, ENEMY_ACTION_INTERVAL_MS);
      State.aiTimers.push(t);
    };

    runBeat();
  }
};

// ======================== SECTOR GENERATOR ORCHESTRATOR ========================
// Thin stateful orchestrator inside Game that invokes the pure functions in
// sectorGenerator.js and applies the returned plain data to State,
// Selection, MathGrid, Visibility, AI, Hud, and GameAudio.
const SectorGenerator = {
  createUnit(type, team, x, y, applySpawnExhaustion = false){
    const u = SectorGeneratorLib.createUnitData(
      SHIP_SPECS,
      State.nextUnitId++,
      type,
      team,
      x,
      y,
      applySpawnExhaustion
    );
    State.units.push(u);
    Visibility.invalidate();
    return u;
  },

  generate(levelId, opts){
    opts = opts || {};
    State.aiTimers.forEach(t => clearTimeout(t));
    GameAudio.clearAll();
    Rules.initState({ preserve: ["profile", "campaign"] });
    if (InitializeCampaign && !GetGameState().campaign) InitializeCampaign();

    const section = GetGameState().campaign;
    const spec = CAMPAIGN_LEVELS.find(l => l.id === levelId) || CAMPAIGN_LEVELS[0];
    // M6(a) faction identity: the encounter's faction (foreign map fleets
    // carry one) wins, the level row is the ladder fallback. Doctrine: a
    // foreign fleet's battle fights with its faction's profile; a
    // location/ladder battle keeps the level row's tuned doctrine.
    const enc = (opts && opts.encounter) || null;
    const encFaction = (enc && typeof enc.encounterFaction === "string") ? enc.encounterFaction : null;
    const levelFaction = (spec && typeof spec.faction === "string") ? spec.faction : null;
    const factionId = (Factions && Factions.Row(encFaction)) ? encFaction
      : ((Factions && Factions.Row(levelFaction)) ? levelFaction : null);
    State.faction = factionId;
    if (factionId && enc && (enc.kind === "fleet" || enc.kind === "join")){
      const profile = Factions.DoctrineProfile(factionId);
      if (profile) State.aiDoctrine = profile;
    } else if (spec && spec.aiDoctrine){
      State.aiDoctrine = spec.aiDoctrine;
    }
    const cap = (typeof opts.capacity === "number") ? opts.capacity : ((CAMPAIGN_DATA && CAMPAIGN_DATA.campaign && CAMPAIGN_DATA.campaign.start &&
      CAMPAIGN_DATA.campaign.start.battle && CAMPAIGN_DATA.campaign.start.battle.cornerCapacity) || 4);
    let encSeed = (typeof opts.seed === "number") ? opts.seed : ((spec && spec.id) ? spec.id * 997 : 1);
    let encState = encSeed | 0;
    const encRnd = function (){
      encState = (Math.imul(encState, 1664525) + 1013904223) | 0;
      return (encState >>> 0) / 4294967296;
    };
    const encounter = CampaignLib.BuildEncounter(spec, SHIP_SPECS, {
      capacity: cap,
      seed: encSeed,
      choice: opts.choice,
      rnd: encRnd,
      opponentFaction: factionId || undefined
    });
    const setup = CampaignLib.BeginBattle(section, encounter, ReservePlacement.splitOverflow);
    _battleSnapshot = {
      deployed: (setup.deployments[0] && setup.deployments[0].units) ? setup.deployments[0].units.slice() : [],
      overflow: setup.overflow.slice(),
      opponent: (setup.deployments[1] && setup.deployments[1].units) ? setup.deployments[1].units.slice() : []
    };
    _battleDeaths = { 1: 0, 2: 0 };
    const playerHulls = _battleSnapshot.deployed.map(e => e.hull || e.type);
    const enemyHulls = _battleSnapshot.opponent.map(e => e.hull || e.type);

    const result = SectorGeneratorLib.generateSectorData({
      levelId,
      campaignLevels: CAMPAIGN_LEVELS,
      shipSpecs: SHIP_SPECS,
      gridSize: GRID_SIZE,
      maxAp: MAX_AP,
      rnd: RND,
      playerSpawnList: playerHulls,
      enemySpawnList: enemyHulls,
      // M5(d): the capacity verdict + weapon-name pool for the seeded
      // multi-weapon variants (illegal loadouts cannot be emitted).
      canFit: _outfitDeps.canFit,
      weaponNames: Object.keys(RULES_DATA.weapons || {})
    });

    Rules.patchState(result.patch);
    Rules.patchState({ battleReserve: setup.overflow.slice() });

    // M4 manning: the deployed roster entries' crew rides onto the spawned
    // player units (matched by hull in deploy order) so the incapacitation
    // gate sees the real manning all battle long; the fold reads the same
    // numbers back.
    const deployedEntries = _battleSnapshot.deployed;
    const mannedIdx = [];
    for (let di = 0; di < deployedEntries.length; di++){
      const hull = deployedEntries[di].hull || deployedEntries[di].type;
      const us = State.units;
      for (let uj = 0; uj < us.length; uj++){
        if (us[uj].team === 1 && us[uj].type === hull && mannedIdx.indexOf(uj) === -1){
          mannedIdx.push(uj);
          if (typeof deployedEntries[di].crew === "number") us[uj].crew = deployedEntries[di].crew;
          if (typeof deployedEntries[di].maxCrew === "number") us[uj].maxCrew = deployedEntries[di].maxCrew;
          // M5: the roster entry's loadout rides onto the spawned unit the
          // same way (custom mounts, DESIGN §3.3).
          if (Array.isArray(deployedEntries[di].loadout)) us[uj].loadout = deployedEntries[di].loadout.slice();
          break;
        }
      }
    }

    if (result.selectedUnitId !== null){
      const sel = State.units.find(u => u.id === result.selectedUnitId) || null;
      Selection.select(sel);
    } else {
      Selection.clear();
    }

    if (result.viewport){
      State.viewSpan = result.viewport.viewSpan;
      State.viewX = result.viewport.viewX;
      State.viewY = result.viewport.viewY;
    }

    State.zoomAnim.active = false;
    MathGrid.clampViewport();
    Visibility.invalidate();
    Visibility.ensureCache();

    // The mission briefing (initialIntel) lives in the HELP menu — no text
    // overlay on the board.
    State.turnReportQueue = [];
    Hud.updateAll();

    // M3: a launched battle owns the canvas screen; the map freezes (Q4).
    const curCampaign = GetGameState().campaign;
    if (curCampaign && curCampaign.map){
      TryPatchGameState({ campaign: Object.assign({}, curCampaign, {
        map: Object.assign({}, curCampaign.map, { screen: "battle", battleActive: true })
      }) });
    }

    GameAudio.play("level.start", { levelId: result.spec.id });
  }
};

// ======================== SUBSYSTEM INITIALIZATION ========================
// Called once by Game.init() AFTER Game.load() and Game.bindInterfaces() have run.
function initializeSubsystems(){
  Rules.initState();
  if (InitializeCampaign && !GetGameState().campaign) InitializeCampaign();
  GameAudio.bind();
  if (_graphicsProducer && typeof _graphicsProducer.publishStaticConfig === "function"){
    _graphicsProducer.publishStaticConfig({
      gridSize: GRID_SIZE,
      spawnRadius: SPAWN_RADIUS,
      maxAp: MAX_AP,
      shipSpecs: SHIP_SPECS,
      campaignLevels: CAMPAIGN_LEVELS,
      themesData: THEME_DATA
    });
  }
  const cur = Rules.getState(State) || State;
  if (cur.units && cur.units.length > 0) {
    AI.syncMemory();
    Hud.updateAll();
  }
}

// ======================== TOP-LEVEL GAME FACADE ========================
// The single entry point the central shell uses to load, initialize, step,
// publish frames, test, and inspect the game domain without the shell
// referencing any internal domain files or globals.
// Inline loader: this file loads ONLY its own direct children.
function _loadScripts(list){
  return Promise.allSettled(list.map(src => new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false; // force in-order execution
    el.onload = () => resolve(src);
    el.onerror = () => reject(new Error("Failed to load script: " + src));
    document.head.appendChild(el);
  }))).then(results => {
    const failures = results.filter(r => r.status === "rejected").map(r => r.reason.message);
    if (failures.length > 0) throw new Error(failures.join("\n"));
  });
}

// On-demand child: gameTests.js. Registration is reopened only while it loads.
let _testsPromise = null;
function _loadTests(){
  if (_modules.tests) return Promise.resolve();
  if (!_testsPromise) {
    // Parent-captures-child-at-load: gameTests.js defines runGameTests at
    // script scope; the loader captures it here (no registrar handshake).
    _testsPromise = _loadScripts(["main.js children/game.js children/gameTests.js"]).then(() => {
      if (typeof runGameTests !== "function") throw new Error("main.js children/game.js children/gameTests.js loaded but did not define runGameTests.");
      _modules.tests = runGameTests;
    }).catch(err => {
      _testsPromise = null;
      throw err;
    });
  }
  return _testsPromise;
}

// Data modules are deep-frozen at receipt: every consumer shares sealed data.
function deepFreeze(o){
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}

// Plain-data deep copy (arrays and plain objects) for DTO handoffs.
function deepCopy(o){
  if (Array.isArray(o)) return o.map(deepCopy);
  if (o && typeof o === "object") {
    const out = {};
    const ks = Object.keys(o);
    for (let i = 0; i < ks.length; i++) out[ks[i]] = deepCopy(o[ks[i]]);
    return out;
  }
  return o;
}

// ---- Frame DTO copies (v78) -------------------------------------------------
// Render frames are plain data: nothing in a frame may alias live State.
// The big grids are copy-on-write — State replaces terrain/asteroidSeeds/
// visCache wholesale (TryPatchGameState, Visibility.ensureCache) and never
// mutates them in place, so their frozen deep copies are rebuilt only when the
// source identity changes. A stable copy identity between frames also keeps
// graphics-side caches keyed on it (the terrain cache reference in the
// background renderer) valid.
// exploredCells IS mutated in place (Visibility.ensureCache) and is re-copied
// on every publish.
const _frameCopyCache = new WeakMap();
function frameCopy(src){
  if (!src || typeof src !== "object") return src;
  const hit = _frameCopyCache.get(src);
  if (hit) return hit;
  const copy = deepFreeze(deepCopy(src));
  _frameCopyCache.set(src, copy);
  return copy;
}
function freshCopy(src){
  return (src && typeof src === "object") ? deepFreeze(deepCopy(src)) : src;
}


let _gameLoadPromise = null;

// M6(a): per-team hull identity for the frame — plain data; the renderer
// paints the faction stripe band and the minimap ramp from it. Team 1 keeps
// the active theme's hull ramp; team 2 wears the battle faction's theme
// (the battle stays team 1/2-keyed). Missing entries fall through to the
// theme palette inside the renderer.
function _hullThemesNow(factionOverride){
  const fid = (factionOverride !== undefined) ? factionOverride : State.faction;
  const base = (THEME_DATA && THEME_DATA.palettes && THEME_DATA.palettes[State.theme || "default"]) || null;
  const baseHull = (base && base.hull) || {};
  const out = {
    1: baseHull[1] ? Object.assign({}, baseHull[1]) : null,
    2: baseHull[2] ? Object.assign({}, baseHull[2]) : null
  };
  const fkey = (fid && Factions) ? Factions.ThemeOf(fid) : null;
  const ft = (fkey && THEME_DATA && THEME_DATA.factionThemes && THEME_DATA.factionThemes[fkey]) || null;
  if (ft){
    out[2] = Object.assign({}, out[2] || {}, ft.hull || {},
      (typeof ft.stripe === "string") ? { stripe: ft.stripe } : {});
  }
  return out;
}

// A fresh plain copy of the live layout metrics per publish. The channel's
// clone memo keys on object identity and the shared metrics singleton mutates
// on every resize — handing it straight to the channel would freeze the
// renderer at the boot-time snapshot (visible as a stale-scale canvas after a
// live window resize). Fresh identity per frame defeats that memo.
function _metricsSnapshot(){
  const m = (_host && _host.metrics) ? _host.metrics : null;
  if (!m) return null;
  return {
    displaySize: m.displaySize,
    viewportWidth: m.viewportWidth,
    viewportHeight: m.viewportHeight,
    isWidescreen: m.isWidescreen,
    renderScale: m.renderScale,
    devicePx: m.devicePx,
    cellPx: m.cellPx,
    fontScale: m.fontScale,
    textScale: m.textScale,
    uiScale: m.uiScale,
    minimapSize: m.minimapSize,
    minimapCanvasSize: m.minimapCanvasSize,
    minimapDevicePx: m.minimapDevicePx,
    ui: m.ui
  };
}

const api = {

  async load(){
    if (_gameLoadPromise) return _gameLoadPromise;
    _gameLoadPromise = (async () => {
      // Closed boot list: this file loads ONLY its direct children; the
      // leaf grandchildren are loaded by the central shell before this
      // loader runs, so the composers below capture them at call time.
      await _loadScripts([
        "main.js children/game.js children/rules_DATA.js",
        "main.js children/game.js children/campaign_DATA.js",
        "main.js children/game.js children/beginningGameState_DATA.js",
        "main.js children/game.js children/themes_DATA.js",
        "main.js children/game.js children/gameState.js",
        "main.js children/game.js children/campaignState.js",
        "main.js children/game.js children/campaignMap.js",
        "main.js children/game.js children/economy.js",
        "main.js children/game.js children/factions.js",
        "main.js children/game.js children/reputation.js",
        "main.js children/game.js children/missions.js",
        "main.js children/game.js children/themes.js",
        "main.js children/game.js children/rulesConfig.js",
        "main.js children/game.js children/boardQueries.js",
        "main.js children/game.js children/lineOfSight.js",
        "main.js children/game.js children/visionQueries.js",
        "main.js children/game.js children/actionLegality.js",
        "main.js children/game.js children/combatMath.js",
        "main.js children/game.js children/outfitting.js",
        "main.js children/game.js children/reservePlacement.js",
        "main.js children/game.js children/endgameStatus.js",
        "main.js children/game.js children/materializeMirages.js",
        "main.js children/game.js children/cameraMath.js",
        "main.js children/game.js children/selectionQueries.js",
        "main.js children/game.js children/visibilityCache.js",
        "main.js children/game.js children/frameBoard.js",
        "main.js children/game.js children/frameUnits.js",
        "main.js children/game.js children/frameOverlay.js",
        "main.js children/game.js children/frameCursor.js",
        "main.js children/game.js children/frameStatus.js",
        "main.js children/game.js children/hud.js",
        "main.js children/game.js children/sectorGenerator.js",
        "main.js children/game.js children/ai.js",
      ]);

      // The flattened children expose one plain pure function each at script
      // scope (no registrar handshake): the loader captures them here, at
      // load, alongside the registrar checks below. A missing capture fails
      // exactly like an unregistered module did.
      const kids = {
        lineOfSight:      typeof hasLineOfSight === "function" ? hasLineOfSight : null,
        reservePlacement: typeof reservePlacement === "function" ? reservePlacement : null,
        endgameStatus:    typeof checkEndgameStatus === "function" ? checkEndgameStatus : null,
        materializeMirages: typeof materializeMirages === "function" ? materializeMirages : null,
        visibilityCache:  typeof computeVisCache === "function" ? computeVisCache : null,
        frameBoard:       typeof buildBoardSlice === "function" ? buildBoardSlice : null,
        frameUnits:       typeof buildUnitSlice === "function" ? buildUnitSlice : null,
        frameOverlay:     typeof buildOverlaySlice === "function" ? buildOverlaySlice : null,
        frameCursor:      typeof buildCursorSlice === "function" ? buildCursorSlice : null,
        frameStatus:      typeof buildStatusSlice === "function" ? buildStatusSlice : null,
        // The composers: one plain function each, over their own children.
        themes:           typeof themes === "function" ? themes : null,
        rulesConfig:      typeof rulesConfig === "function" ? rulesConfig : null,
        combatMath:       typeof combatMath === "function" ? combatMath : null,
        outfitting:       typeof outfitting === "function" ? outfitting : null,
        cameraMath:       typeof cameraMath === "function" ? cameraMath : null,
        selectionQueries: typeof selectionQueries === "function" ? selectionQueries : null,
        sectorGenerator:  typeof sectorGenerator === "function" ? sectorGenerator : null,
        gameState:        typeof gameState === "function" ? gameState : null,
        campaignState:    typeof campaignState === "function" ? campaignState : null,
        campaignMap:      typeof campaignMap === "function" ? campaignMap : null,
        economy:          typeof economy === "function" ? economy : null,
        factions:         typeof factions === "function" ? factions : null,
        reputation:       typeof reputation === "function" ? reputation : null,
        missions:         typeof missions === "function" ? missions : null,
        boardQueries:     typeof boardQueries === "function" ? boardQueries : null,
        visionQueries:    typeof visionQueries === "function" ? visionQueries : null,
        actionLegality:   typeof actionLegality === "function" ? actionLegality : null
      };
      // DATA payloads + the two remaining registrar children (hud, ai):
      // parent-captures-child-at-load, no registrar handshake.
      _modules.rulesData =   typeof rulesDataPayload !== "undefined" ? rulesDataPayload : null;
      _modules.campaignData = typeof campaignDataPayload !== "undefined" ? campaignDataPayload : null;
      _modules.beginningGameStateData = typeof beginningGameStateDataPayload !== "undefined" ? beginningGameStateDataPayload : null;
      _modules.themesData =  typeof themesDataPayload !== "undefined" ? themesDataPayload : null;
      _modules.hud = typeof createHud === "function"
        ? { createHud, createInitialView: createHud.createInitialView }
        : null;
      _modules.ai = typeof decideAIAction === "function" ? decideAIAction : null;

      const missing = [
        ["main.js children/game.js children/rules_DATA.js",              _modules.rulesData],
        ["main.js children/game.js children/campaign_DATA.js",           _modules.campaignData],
        ["main.js children/game.js children/beginningGameState_DATA.js", _modules.beginningGameStateData],
        ["main.js children/game.js children/themes_DATA.js",             _modules.themesData],
        ["main.js children/game.js children/gameState.js",               kids.gameState],
        ["main.js children/game.js children/campaignState.js",           kids.campaignState],
        ["main.js children/game.js children/campaignMap.js",             kids.campaignMap],
        ["main.js children/game.js children/economy.js",                  kids.economy],
        ["main.js children/game.js children/factions.js",                 kids.factions],
        ["main.js children/game.js children/reputation.js",               kids.reputation],
        ["main.js children/game.js children/missions.js",                 kids.missions],
        ["main.js children/game.js children/themes.js",                  kids.themes],
        ["main.js children/game.js children/rulesConfig.js",             kids.rulesConfig],
        ["main.js children/game.js children/boardQueries.js",            kids.boardQueries],
        ["main.js children/game.js children/lineOfSight.js",             kids.lineOfSight],
        ["main.js children/game.js children/visionQueries.js",           kids.visionQueries],
        ["main.js children/game.js children/actionLegality.js",          kids.actionLegality],
        ["main.js children/game.js children/combatMath.js",              kids.combatMath],
        ["main.js children/game.js children/outfitting.js",              kids.outfitting],
        ["main.js children/game.js children/reservePlacement.js",        kids.reservePlacement],
        ["main.js children/game.js children/endgameStatus.js",           kids.endgameStatus],
        ["main.js children/game.js children/materializeMirages.js",      kids.materializeMirages],
        ["main.js children/game.js children/cameraMath.js",              kids.cameraMath],
        ["main.js children/game.js children/selectionQueries.js",        kids.selectionQueries],
        ["main.js children/game.js children/visibilityCache.js",         kids.visibilityCache],
        ["main.js children/game.js children/frameBoard.js",              kids.frameBoard],
        ["main.js children/game.js children/frameUnits.js",              kids.frameUnits],
        ["main.js children/game.js children/frameOverlay.js",            kids.frameOverlay],
        ["main.js children/game.js children/frameCursor.js",             kids.frameCursor],
        ["main.js children/game.js children/frameStatus.js",             kids.frameStatus],
        ["main.js children/game.js children/hud.js",                     _modules.hud && typeof _modules.hud.createHud === "function"],
        ["main.js children/game.js children/sectorGenerator.js",         kids.sectorGenerator],
        ["main.js children/game.js children/ai.js",                        typeof _modules.ai === "function" && typeof _modules.ai.load === "function"]
      ].filter(c => !c[1]).map(c => c[0]);
      if (missing.length > 0) {
        throw new Error("These scripts loaded but did not register their module (see earlier errors):\n  " + missing.join("\n  "));
      }

      RULES_DATA = deepFreeze(_modules.rulesData);
      CAMPAIGN_DATA = deepFreeze(_modules.campaignData);
      BEGINNING_GAME_STATE_DATA = deepFreeze(_modules.beginningGameStateData);
      THEME_DATA = deepFreeze(_modules.themesData);

      GRID_SIZE = RULES_DATA.gridSize;
      SPAWN_RADIUS = RULES_DATA.spawnRadius;
      MAX_AP = RULES_DATA.maxAp;
      ENEMY_ACTION_INTERVAL_MS = RULES_DATA.enemyActionIntervalMs;
      DIFFICULTY = RULES_DATA.defaultDifficulty;
      DIFFICULTY_TABLE = RULES_DATA.difficultyProfiles;
      SHIP_SPECS = RULES_DATA.shipSpecs;
      CAMPAIGN_LEVELS = CAMPAIGN_DATA.levels;

      const stateLib = kids.gameState(BEGINNING_GAME_STATE_DATA);
      InitializeGameState = opts => stateLib.InitializeGameState(_stateBox, opts);
      GetGameState = () => stateLib.GetGameState(_stateBox);
      TryPatchGameState = delta => stateLib.TryPatchGameState(_stateBox, delta);
      GetStateLifetimes = () => stateLib.GetStateLifetimes();
      SerializeGameState = () => stateLib.SerializeGameState(_stateBox);
      // The map-state builder bound over the frozen map table + roster — one
      // closure, injected wherever a sibling transform needs map state built
      // (campaign init and the pre-map save migration).
      const buildMapSection = () => CampaignMapLib.BuildMapState(CAMPAIGN_DATA.campaign, SHIP_SPECS, null);
      // M4: the seeded market builder bound over the frozen trade table +
      // roster — one closure, injected where a sibling transform needs the
      // market built (campaign init and the pre-M4 save migration).
      const buildMarketSection = () => EconomyLib.BuildMarketState(CAMPAIGN_DATA.campaign.trade, SHIP_SPECS);
      // M5: the loadout-migration reader bound over the seam + roster (a
      // hull name in, its default mount list out).
      const hullLoadout = hull => Outfitting.DefaultLoadout(SHIP_SPECS[hull] || null);
      DeserializeGameState = data => stateLib.DeserializeGameState(_stateBox, data, buildMapSection, buildMarketSection, hullLoadout,
        () => Reputation.Init(CAMPAIGN_DATA.campaign.factions, id => Factions.AlignmentOf(id)));

      // M1 campaign state: pure children over the campaign section only.
      // initializeCampaign() rebuilds State.campaign from the frozen
      // campaign_DATA starting package; persistence flows through the
      // gameState campaign lifetime. M3: the map section comes from the
      // campaign-map subtree's builder (injected — siblings never name each
      // other).
      const campaignLib = kids.campaignState();
      CampaignLib = campaignLib;
      CampaignMapLib = kids.campaignMap();
      EconomyLib = kids.economy();
      InitializeCampaign = () => {
        const fresh = campaignLib.InitializeCampaignState(CAMPAIGN_DATA.campaign, SHIP_SPECS, buildMapSection, buildMarketSection,
          () => Reputation.Init(CAMPAIGN_DATA.campaign.factions, id => Factions.AlignmentOf(id)));
        if (!TryPatchGameState({ campaign: fresh })) {
          console.error("[S&D campaign] initializeCampaign: patch rejected.");
          return null;
        }
        return GetGameState().campaign;
      };

      // Pure-function theme library: Game owns the active theme (State.theme)
      // and passes the key explicitly to every call.
      Themes = kids.themes(THEME_DATA);

      // Bind the pure rule children (single job each) and assemble the Rules
      // handle over them: config values from rulesConfig, queries delegated
      // to the query children, and the composite decisions composed here from
      // plain evidence. The surface is exactly the pre-split rules module's —
      // the AI snapshot facade and the SD debug handle read it unchanged.
      RulesConfig = kids.rulesConfig(RULES_DATA);
      BoardQueries = kids.boardQueries(RULES_DATA);
      // The flattened children are plain captured functions: the parent binds
      // the rules data and the per-frame params, so each handle keeps exactly
      // the surface its callers already use.
      LineOfSight = {
        hasLineOfSight(ctx, x0, y0, x1, y1, mode){ return kids.lineOfSight(RULES_DATA, ctx, x0, y0, x1, y1, mode); }
      };
      VisionQueries = kids.visionQueries(RULES_DATA);
      ActionLegality = kids.actionLegality();
      CombatMath = kids.combatMath(RULES_DATA);
      // M5 loadout seam (roadmap-design §4.5): the only weapon-stat readers,
      // bound over the frozen weapon table.
      Outfitting = kids.outfitting(RULES_DATA.weapons);
      // M6(b) reputation seam: bands, stances, adjustments and the sensor
      // sharing policy over the frozen event-rate table.
      Reputation = kids.reputation(CAMPAIGN_DATA.campaign.reputation);
      // M6(d) missions seam: the authored fixed-contract chain (Q9) over
      // its post / settle / progress children.
      Missions = kids.missions(CAMPAIGN_DATA.campaign.missions);
      // M6(a) faction seam: identity rows + doctrine-weighted fleet
      // composition over the frozen faction table and the roster. The
      // pair-band reader and the open-square finder arrive as injected
      // closures (siblings never name each other).
      Factions = kids.factions(SHIP_SPECS, {
        bandOf: (rep, faction) => Reputation.Band(Reputation.PairScore(rep, "player", faction)),
        nearestOpen: (map, from, rng) => CampaignMapLib.NearestOpenSquare(map, from, rng)
      });
      ReservePlacement = kids.reservePlacement(RULES_DATA);
      EndgameStatus = {
        checkEndgameStatus: kids.endgameStatus
      };
      // The pure game.js children (single job each): camera math, selection
      // queries and the visibility-cache computation. State stays here.
      CameraMath = kids.cameraMath(RULES_DATA);
      SelectionQueries = kids.selectionQueries();
      SectorGeneratorLib = kids.sectorGenerator();
      VisibilityCache = {
        computeVisCache(ctx, team){ return kids.visibilityCache(RULES_DATA, ctx, team); }
      };
      // The render-frame build children (v89): one pure child per frame
      // domain. The parent's plain-copy helpers and pure rule/action queries
      // travel in as the builder's deps; the children receive state-shape
      // params and return plain slice data.
      const frameBoardDeps = { frameCopy, freshCopy };
      const frameUnitDeps = {
        getEffectiveScan: u => Visibility.getEffectiveScan(u),
        isUnitSpottedByTeam: (u, team) => Visibility.isUnitSpottedByTeam(u, team),
        canShield: (unitA, B) => Actions.canShield(unitA, B),
        // M5 adoption: frame unit stats are seam-derived from the loadout.
        fpOf: u => Outfitting.UnitFirepower(u),
        rngOf: u => Outfitting.UnitRange(u),
        mountsOf: u => Outfitting.UnitWeapons(u),
        // M5(c) Q8: the per-shot choice (null = first mount).
        chosenOf: u => _chosenName(u)
      };
      const frameOverlayDeps = {
        buildUnitIndex: units => Rules.buildUnitIndex(units),
        canMove: (ctx, unitA, B) => Rules.canMove(ctx, unitA, B),
        hasLineOfSight: (ctx, x0, y0, x1, y1, mode) => Rules.hasLineOfSight(ctx, x0, y0, x1, y1, mode),
        hasFlag: (unit, flag) => Rules.hasFlag(unit, flag),
        computeShootOutcome: (unitA, target) => Rules.computeShootOutcome(unitA, target),
        inRange: (a, b, r) => MathGrid.inRange(a, b, r),
        dist: (a, b) => MathGrid.dist(a, b),
        getSpottedEnemyAt: (gx, gy, team) => Visibility.getSpottedEnemyAt(gx, gy, team),
        canCapture: (unitA, B) => Actions.canCapture(unitA, B),
        canShield: (unitA, B) => Actions.canShield(unitA, B),
        // M5(c) Q8: the red numbers show the CHOSEN weapon's exact damage and
        // reach only — never a sum/max over the loadout.
        fpOf: u => _activeDamage(u),
        rngOf: u => _activeRange(u)
      };
      FrameBoard = { build: p => kids.frameBoard(p, frameBoardDeps) };
      FrameUnits = { build: p => kids.frameUnits(p, frameUnitDeps) };
      FrameOverlay = { build: p => kids.frameOverlay(p, frameOverlayDeps) };
      FrameCursor = { build: kids.frameCursor };
      FrameStatus = { build: kids.frameStatus };
      Rules = {
        getState(ctx){ return (ctx && ctx.units !== undefined) ? ctx : GetGameState(); },
        initState(opts){ return InitializeGameState(opts); },
        patchState(delta){ return TryPatchGameState(delta); },
        get flagDescriptions(){ return RulesConfig.flagDescriptions; },
        get gridSize(){ return RulesConfig.gridSize; },
        get spawnRadius(){ return RulesConfig.spawnRadius; },
        get maxAp(){ return RulesConfig.maxAp; },
        get enemyActionIntervalMs(){ return RulesConfig.enemyActionIntervalMs; },
        get zoomLadder(){ return RulesConfig.zoomLadder; },
        get wheelNotchPx(){ return RulesConfig.wheelNotchPx; },
        get maxZoomStepsPerEvent(){ return RulesConfig.maxZoomStepsPerEvent; },
        get defaultDifficulty(){ return RulesConfig.defaultDifficulty; },
        get difficultyProfiles(){ return RulesConfig.difficultyProfiles; },
        get shipSpecs(){ return RulesConfig.shipSpecs; },
        inBounds(ctx, gx, gy){ return BoardQueries.inBounds(ctx, gx, gy); },
        dist(a, b){ return BoardQueries.dist(a, b); },
        inRange(a, b, r){ return BoardQueries.inRange(a, b, r); },
        terrainAt(ctx, gx, gy){ return BoardQueries.terrainAt(ctx, gx, gy); },
        getUnitAt(ctx, gx, gy){ return BoardQueries.getUnitAt(ctx, gx, gy); },
        buildUnitIndex(units){ return BoardQueries.buildUnitIndex(units); },
        hasFlag(unit, flag){ return _hasFlag(unit, flag); },
        hasLineOfSight(ctx, x0, y0, x1, y1, mode){ return LineOfSight.hasLineOfSight(ctx, x0, y0, x1, y1, mode); },
        effectiveScan(ctx, unit){ return VisionQueries.effectiveScan(ctx, unit); },
        isCellVisibleToTeam(ctx, gx, gy, team){ return VisionQueries.isCellVisibleToTeam(ctx, gx, gy, team); },
        isUnitSpottedByTeam(ctx, targetUnit, observerTeam){ return VisionQueries.isUnitSpottedByTeam(ctx, targetUnit, observerTeam); },
        getSpottedEnemyAt(ctx, gx, gy, observerTeam){ return VisionQueries.getSpottedEnemyAt(ctx, gx, gy, observerTeam); },
        canMove(ctx, unitA, B){ return ActionLegality.canMove(unitA, B, _moveEvidence(ctx, unitA, B)); },
        canCapture(ctx, unitA, B){ return ActionLegality.canCapture(unitA, B, _captureEvidence(ctx, unitA, B)); },
        canShoot(ctx, unitA, B){ return ActionLegality.canShoot(unitA, B, _shootEvidence(ctx, unitA, B)); },
        canShield(ctx, unitA, B){ return ActionLegality.canShield(unitA, B, _shieldEvidence(ctx)); },
        getPriorityActionAt(ctx, unitA, gx, gy, opts){ return ActionLegality.getPriorityActionAt(unitA, gx, gy, _priorityEvidence(ctx, unitA, gx, gy), opts); },
        getValidWarpCells(ctx, capitalUnit, radius){ return ReservePlacement.getValidWarpCells(ctx, capitalUnit, radius); },
        shootableFrom(ctx, u, dest, target){ return CombatMath.shootableFrom(_activeWeapon(u), dest, target, _shootableEvidence(ctx, u, dest, target)); },
        isKillShot(u, target){ return CombatMath.isKillShot(u, target, _activeWeapon(u)); },
        computeCollisionOutcome(unitA, occupant){ return CombatMath.computeCollisionOutcome(unitA, occupant); },
        computeShootOutcome(unitA, target){ return CombatMath.computeShootOutcome(unitA, target, _activeWeapon(unitA)); },
        checkEndgameStatus(units){ return EndgameStatus.checkEndgameStatus(units); }
      };

      // Frozen plain facade of the pure rule queries + copied rule data,
      // built once here: this is what crosses into the AI snapshot DTO —
      // the Rules module identity never leaves game.js.
      PURE_RULES = deepFreeze({
        gridSize: Rules.gridSize,
        spawnRadius: Rules.spawnRadius,
        defaultDifficulty: Rules.defaultDifficulty,
        difficultyProfiles: deepCopy(Rules.difficultyProfiles),
        shipSpecs: deepCopy(Rules.shipSpecs),
        dist(a, b){ return Rules.dist(a, b); },
        inBounds(ctx, gx, gy){ return Rules.inBounds(ctx, gx, gy); },
        terrainAt(ctx, gx, gy){ return Rules.terrainAt(ctx, gx, gy); },
        getUnitAt(ctx, gx, gy){ return Rules.getUnitAt(ctx, gx, gy); },
        canMove(ctx, unitA, B){ return Rules.canMove(ctx, unitA, B); },
        canCapture(ctx, unitA, B){ return Rules.canCapture(ctx, unitA, B); },
        canShoot(ctx, unitA, B){ return Rules.canShoot(ctx, unitA, B); },
        canShield(ctx, unitA, B){ return Rules.canShield(ctx, unitA, B); },
        inRange(a, b, r){ return Rules.inRange(a, b, r); },
        isCellVisibleToTeam(ctx, gx, gy, team){ return Rules.isCellVisibleToTeam(ctx, gx, gy, team); },
        isUnitSpottedByTeam(ctx, targetUnit, observerTeam){ return Rules.isUnitSpottedByTeam(ctx, targetUnit, observerTeam); },
        hasLineOfSight(ctx, x0, y0, x1, y1, mode){ return Rules.hasLineOfSight(ctx, x0, y0, x1, y1, mode); },
        effectiveScan(ctx, unit){ return Rules.effectiveScan(ctx, unit); },
        getValidWarpCells(ctx, capitalUnit, radius){ return Rules.getValidWarpCells(ctx, capitalUnit, radius); },
        shootableFrom(ctx, u, dest, target){ return Rules.shootableFrom(ctx, u, dest, target); },
        isKillShot(u, target){ return Rules.isKillShot(u, target); },
        // M5 adoption: the loadout seam crosses into the AI snapshot so the
        // AI reads weapon stats through it, never off unit fields.
        fpOf(u){ return Outfitting.UnitFirepower(u); },
        rngOf(u){ return Outfitting.UnitRange(u); },
        railOf(u){
          const ws = Outfitting.UnitWeapons(u);
          for (let i = 0; i < ws.length; i++){ if (ws[i].class === "railgun") return true; }
          return false;
        },
        mountsOf(u){ return Outfitting.UnitWeapons(u); },
        // M5(d): the best single shot this unit could fire — per-shot damage
        // estimates key on the mount actually worth firing (a railgun-class
        // mount keeps full damage through a bubble, anything else strips it
        // for the shield hit). One mount yields exactly its own damage.
        bestDmgOf(u, shielded){
          const ws = Outfitting.UnitWeapons(u);
          const sd = (RULES_DATA.combatRules && RULES_DATA.combatRules.shieldNonRailgunDamage) || 1;
          let best = 0;
          for (let i = 0; i < ws.length; i++){
            const eff = (shielded && ws[i].class !== "railgun") ? sd : ws[i].dmg;
            if (eff > best) best = eff;
          }
          return best;
        },
        getPriorityActionAt(ctx, unitA, gx, gy, opts){ return Rules.getPriorityActionAt(ctx, unitA, gx, gy, opts); }
      });

      // Pure hud child: plain data + pure closure queries only (no module
      // identities cross the boundary). _hudView/_hudCache stay game-owned.
      _hudView = _modules.hud.createInitialView();
      HudLib = _modules.hud.createHud({
        campaignLevels: deepCopy(CAMPAIGN_LEVELS),
        shipSpecs: deepCopy(SHIP_SPECS),
        flagDescriptions: deepCopy(Rules.flagDescriptions || {}),
        getUnitAt(gx, gy){ return _unitDTO(MathGrid.getUnitAt(gx, gy)); },
        terrainAt(gx, gy){
          const st = GetGameState();
          return st.terrain && st.terrain[gx] ? st.terrain[gx][gy] : "EMPTY";
        },
        isSpotted(unit){ return Visibility.isUnitSpottedByTeam(unit, 1); },
        cellVisible(gx, gy){ return Visibility.isCellVisibleToTeam(gx, gy, 1); },
        effectiveScan(unit){ return Visibility.getEffectiveScan(unit); },
        validWarpCells(unit){ return Actions.getValidWarpCells(unit, 3).map(c => ({ x: c.x, y: c.y })); },
        canShield(unit, pos){ return Actions.canShield(unit, pos); },
        canCapture(unit, pos){ return Actions.canCapture(unit, pos); },
        canShoot(unit, pos){ return Actions.canShoot(unit, pos); },
        // M5 adoption: hud stat lines read weapon stats through the seam.
        fpOf(unit){ return Outfitting.UnitFirepower(unit); },
        rngOf(unit){ return Outfitting.UnitRange(unit); },
        mountsOf(unit){ return Outfitting.UnitWeapons(unit); },
        // M5(c) Q8: the per-shot choice (null = first mount).
        chosenOf(unit){ return _chosenName(unit); },
        priorityAction(unit, gx, gy){ return Actions.getPriorityActionAt(unit, gx, gy); },
        renderedViewport(){
          const vp = MathGrid.getRenderedViewport();
          return { viewX: vp.viewX, viewY: vp.viewY, cellPx: vp.cellPx };
        }
      });

      const rawAI = _modules.ai;
      await rawAI.load();
      getAIAction = snap => {
        // Sanctioned carve-out: hand-built snapshots (tests) may omit `rules`;
        // give them the same frozen facade the AI DTO carries (game-built
        // snapshots already have it, so this never writes to a frozen DTO).
        if (snap && !snap.rules) snap.rules = PURE_RULES;
        return rawAI(snap);
      };

    })();
    return _gameLoadPromise;
  },

  bindHost(host){
    bindHost(host);
  },

  bindInterfaces(ifaces){
    bindInterfaces(ifaces);
  },

  init(){
    initializeSubsystems();
  },

  bindInputs(){
    Actions.bindInputs();
  },

  startSector(levelId, opts){
    opts = opts || {};
    if (opts.skipDeploy){
      SectorGenerator.generate(levelId, opts);
      return;
    }
    if (InitializeCampaign && !GetGameState().campaign) InitializeCampaign();
    const section = GetGameState().campaign;
    const cap = (CAMPAIGN_DATA && CAMPAIGN_DATA.campaign && CAMPAIGN_DATA.campaign.start &&
      CAMPAIGN_DATA.campaign.start.battle && CAMPAIGN_DATA.campaign.start.battle.cornerCapacity) || 4;
    const fleet = (section && Array.isArray(section.fleet)) ? section.fleet : [];
    const split = ReservePlacement.splitOverflow(fleet, cap);
    const selected = [];
    for (let i = 0; i < fleet.length; i++){
      if (split.deployed.indexOf(fleet[i]) !== -1) selected.push(i);
    }
    _pendingDeploy = { levelId: levelId, fleet: fleet, capacity: cap, selected: selected, encounter: (opts && opts.encounter) || null };
    Hud.toggleDeployModal(true);
  },

  // M3: the campaign map is the campaign's main screen. Boot lands here —
  // no deployment modal, no level; battles launch from map encounters.
  enterMap(){
    Rules.initState({ preserve: ["profile", "campaign"] });
    if (InitializeCampaign && !GetGameState().campaign) InitializeCampaign();
    const c = GetGameState().campaign;
    if (c && c.map){
      TryPatchGameState({ campaign: Object.assign({}, c, {
        map: Object.assign({}, c.map, {
          screen: "map",
          battleActive: false,
          pendingEncounter: (c.map.pendingEncounter === undefined) ? null : c.map.pendingEncounter
        })
      }) });
    }
    Hud.updateAll();
  },

  getViewSpan(){
    return (typeof GetGameState === "function" && State.viewSpan) ? State.viewSpan : 16;
  },

  refreshLayout(){
    Hud.updateAll();
  },

  onResize(){
    State.zoomAnim.active = false;
    MathGrid.clampViewport();
    Hud.updateAll();
    InputProcessor.refreshHoverFromCamera();
  },

  processInputs(){
    InputProcessor.drainAndProcess();
  },

  stepFrame(now){
    InputProcessor.drainAndProcess();
    if (State.zoomAnim.active &&
        now - State.zoomAnim.start >= State.zoomAnim.duration) {
      State.zoomAnim.active = false;
    }

    // Prune expired VFX animations before rendering so the render pass stays pure (ISS-050).
    if (State.animations.length > 0) {
      State.animations = State.animations.filter(anim => (now - anim.start) < anim.duration);
    }

    InputProcessor.stepPan(now);

    // Memoized visibility cache rebuilt only when State.visDirty is set (ISS-029).
    return Visibility.ensureCache();
  },

  // The render-frame build (v89): the per-domain pure children build the
  // frame's slices; this body only composes their plain data into the
  // render-frame DTO (unchanged shape — graphicsInterface.js and
  // graphics/* consume it as before). Input gathering (clock, visibility
  // cache, selection, viewport query) and the publish handoff stay here.
  buildFrame(overrides){
    const nowVal = (overrides && typeof overrides.now === "number")
      ? overrides.now
      : ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());

    // M3: when the map screen is active, compose the map DTO (the map
    // domain's one render exit) and publish a kind:"map" frame. The HUD
    // chrome keeps working — only the world layer swaps to the map scene.
    const mapSection = (GetGameState().campaign && GetGameState().campaign.map) || null;
    if (mapSection && mapSection.screen === "map") {
      const mapDto = CampaignMapLib.MapFrame(mapSection, { x: 0, y: 0, span: 64 });
      const mapCursor = FrameCursor.build({ state: State, cursorStyle: InputProcessor.getCursor() });
      const mapStatus = FrameStatus.build({ state: State, maxAp: MAX_AP });
      const mapStateDTO = {
        ...mapStatus,
        theme: mapCursor.theme,
        viewX: 0,
        viewY: 0,
        viewSpan: mapDto.span,
        zoomAnim: State.zoomAnim,
        inspectMode: mapCursor.inspectMode,
        buttonHovered: mapCursor.buttonHovered,
        buttonPressed: mapCursor.buttonPressed,
        selectedCell: null,
        hoveredCell: null,
        terrain: [],
        asteroidSeeds: [],
        exploredCells: [],
        units: [],
        historicalVectors: [],
        animations: [],
        canvasButtons: mapCursor.canvasButtons,
        audioSettings: mapCursor.audioSettings,
        canShieldSelected: false,
        tacticalOverlays: []
      };
      const mapFrameDTO = {
        kind: "map",
        GRID_SIZE: GRID_SIZE,
        SPAWN_RADIUS: SPAWN_RADIUS,
        SHIP_SPECS,
        CAMPAIGN_LEVELS,
        MAX_AP: mapStatus.maxAp,
        state: mapStateDTO,
        viewport: { dx0: 0, dx1: 0, dy0: 0, dy1: 0, renderViewSpan: mapDto.span, renderViewX: 0, renderViewY: 0 },
        cursor: mapCursor.cursor,
        metrics: _metricsSnapshot(),
        theme: mapCursor.theme,
        now: nowVal,
        visCache: [],
        map: mapDto,
        uiHud: Hud.getSnapshot(nowVal)
      };
      if (overrides && typeof overrides === "object") {
        Object.assign(mapFrameDTO, overrides);
      }
      if (_graphicsProducer && typeof _graphicsProducer.publishFrame === "function"){
        _graphicsProducer.publishFrame(mapFrameDTO);
      }
      return mapFrameDTO;
    }

    const rawVis = (overrides && overrides.visCache) || State.visCache || Visibility.ensureCache();
    const selUnit = Selection.getUnit();
    const isPlayerTurn = State.activeTeam === 1 && !State.gameOver;

    const board = FrameBoard.build({
      gridSize: GRID_SIZE,
      spawnRadius: SPAWN_RADIUS,
      state: State,
      visCache: rawVis,
      renderedViewport: MathGrid.getRenderedViewport(nowVal),
      metrics: _metricsSnapshot()
    });
    const units = FrameUnits.build({ state: State, selUnit, isPlayerTurn });
    const overlay = FrameOverlay.build({
      state: State,
      visCache: rawVis,
      selUnit,
      isPlayerTurn,
      baseState: GetGameState(),
      gridSize: GRID_SIZE,
      dx0: board.viewport.dx0,
      dx1: board.viewport.dx1,
      dy0: board.viewport.dy0,
      dy1: board.viewport.dy1
    });
    const cursor = FrameCursor.build({ state: State, cursorStyle: InputProcessor.getCursor() });
    const status = FrameStatus.build({ state: State, maxAp: MAX_AP });

    const stateDTO = {
      ...status,
      theme: cursor.theme,
      hullThemes: _hullThemesNow(),
      viewX: board.viewX,
      viewY: board.viewY,
      viewSpan: board.viewSpan,
      zoomAnim: board.zoomAnim,
      inspectMode: cursor.inspectMode,
      buttonHovered: cursor.buttonHovered,
      buttonPressed: cursor.buttonPressed,
      selectedCell: cursor.selectedCell,
      hoveredCell: cursor.hoveredCell,
      terrain: board.terrain,
      asteroidSeeds: board.asteroidSeeds,
      exploredCells: board.exploredCells,
      units: units.units,
      historicalVectors: units.historicalVectors,
      animations: units.animations,
      canvasButtons: cursor.canvasButtons,
      audioSettings: cursor.audioSettings,
      canShieldSelected: units.canShieldSelected,
      tacticalOverlays: overlay.tacticalOverlays
    };

    const frame = {
      GRID_SIZE: board.GRID_SIZE,
      SPAWN_RADIUS: board.SPAWN_RADIUS,
      SHIP_SPECS,
      CAMPAIGN_LEVELS,
      MAX_AP: status.maxAp,
      state: stateDTO,
      viewport: board.viewport,
      cursor: cursor.cursor,
      metrics: board.metrics,
      theme: cursor.theme,
      now: nowVal,
      visCache: board.visCache,
      uiHud: Hud.getSnapshot(nowVal)
    };
    if (overrides && typeof overrides === "object") {
      Object.assign(frame, overrides);
    }
    if (_graphicsProducer && typeof _graphicsProducer.publishFrame === "function"){
      _graphicsProducer.publishFrame(frame);
    }
    return frame;
  },

  publishFrame(overrides){
    return this.buildFrame(overrides);
  },

  async loadTests(){
    return _loadTests();
  },

  initializeCampaign(){
    return InitializeCampaign();
  },

  async runTest(testName){
    await _loadTests();
    return _modules.tests(this.createTestBridge(), testName);
  },

  createTestBridge(){
    return {
      get gridSize(){ return GRID_SIZE; },
      get difficulty(){ return DIFFICULTY; },
      get difficultyTable(){ return DIFFICULTY_TABLE; },
      get shipSpecs(){ return SHIP_SPECS; },
      get weapons(){ return RULES_DATA.weapons; },
      get state(){ return State; },
      get campaign(){ return State.campaign; },
      initializeCampaign(){ return InitializeCampaign(); },
      openBattle(section, encounter){
        return CampaignLib.BeginBattle(section, encounter, ReservePlacement.splitOverflow);
      },
      foldBattle(section, battleResult){
        return CampaignLib.ApplyBattleResult(section, battleResult, SHIP_SPECS, CombatMath.crewLostFromDamage);
      },
      crewKilled(damage, maxHp, crew){
        return CombatMath.crewLostFromDamage(damage, maxHp, crew);
      },
      mapSection(){ return (GetGameState().campaign && GetGameState().campaign.map) || null; },
      mapFromTable(){ return CampaignMapLib.BuildMapState(CAMPAIGN_DATA.campaign, SHIP_SPECS, null); },
      mapRules(){ return (CAMPAIGN_DATA && CAMPAIGN_DATA.campaign && CAMPAIGN_DATA.campaign.map) || null; },
      travel(mapState, fleetId, dest, opts){ return CampaignMapLib.MoveFleet(mapState, fleetId, dest, opts); },
      travelCost(fleet, distance, space){ return CampaignMapLib.FuelCost(fleet, distance, space); },
      mapJump(mapState, fleetId, target, opts){ return CampaignMapLib.HyperspaceJump(mapState, fleetId, target, opts); },
      mapView(mapState, view){ return CampaignMapLib.MapFrame(mapState, view); },
      mapScan(mapState, observerFaction){ return CampaignMapLib.MapVisibility(mapState, observerFaction); },
      mapBattleEvent(mapState, locationId, entering){ return CampaignMapLib.BattleEventAt(mapState, locationId, entering); },
      hailModel(encounter){ return Hud.hailModel(encounter); },
      mapHudModel(mapState, extra){ return Hud.mapHudModel(mapState, extra); },
      merchantQuote(mapState, fleetId, reason){ return CampaignMapLib.MerchantOffer(mapState, fleetId, reason); },
      // M4 economy seam: the seeded market and the pure trade transforms.
      marketFromTable(){ return EconomyLib.BuildMarketState(CAMPAIGN_DATA.campaign.trade, SHIP_SPECS); },
      tradeTable(){ return CAMPAIGN_DATA.campaign.trade; },
      economyPrice(market, good, loc, time){ return EconomyLib.PriceAt(market, good, loc, time); },
      economyQuote(state, good, loc, time){ return EconomyLib.Quote(state, good, loc, time); },
      economyTrade(state, good, qty, loc, unit){ return EconomyLib.ApplyTrade(state, good, qty, loc, unit); },
      // M4 station seam: the live storefront ops (effects applied) + the
      // plain bundle the HUD child lays out.
      stationDock(){ return _stationDock(); },
      stationBundle(){ return _stationBundle(); },
      stationSetTab(tab){ _stationCtx.tab = tab; Hud.toggleStationModal(true); return _stationBundle(); },
      stationOpen(){ Hud.toggleStationModal(true); return Hud.getActiveModal(); },
      stationClose(){ Hud.toggleStationModal(false); return Hud.getActiveModal(); },
      stationTradeLive(good, sign){ _stationTrade(good, sign); return GetGameState().campaign; },
      stationServiceLive(kind, idx){ _stationService(kind, idx); return GetGameState().campaign; },
      // M5(d) outfit seam: the roster loadout transform + the outfit rows +
      // a seeded generator pull (the sweep test reads every emitted loadout).
      outfitShip(idx, opts){ _stationService("outfit", idx, opts); return GetGameState().campaign; },
      outfitRows(input){ return HudLib.outfitModel(input); },
      sectorUnits(levelId, seed){
        const seg = SectorGeneratorLib.generateSectorData({
          levelId: levelId,
          campaignLevels: CAMPAIGN_LEVELS,
          shipSpecs: SHIP_SPECS,
          gridSize: GRID_SIZE,
          maxAp: MAX_AP,
          rnd: mulberry32(seed),
          playerSpawnList: [],
          enemySpawnList: [],
          canFit: _outfitDeps.canFit,
          weaponNames: Object.keys(RULES_DATA.weapons || {})
        });
        return (seg.patch && Array.isArray(seg.patch.units)) ? seg.patch.units : (seg.units || []);
      },
      stationService(state, service){ return CampaignLib.ApplyStationService(state, service); },
      // M4(c) crew seam: manning verdicts, the deployment plan and the wage
      // clock transform (members renamed off the raw child stems — the
      // audit counts raw text).
      crewVerdict(unit, maxCrew){ return ActionLegality.CrewStatus(unit, maxCrew); },
      deployPlan(fleet, cap, choice){ return ReservePlacement.splitOverflow(fleet, cap, choice); },
      wageTick(state){ return EconomyLib.PayWages(state); },
      clockTick(){ return _mapClockTick(); },
      // M5(a) loadout seam: the slot math, validation and weapon readers
      // (members renamed off the raw child stems — the audit counts raw text).
      loadoutSlots(weapon){ return Outfitting.SlotSize(weapon); },
      loadoutCheck(loadout, hull){ return Outfitting.Validate(loadout, hull); },
      loadoutDefault(hull){ return Outfitting.DefaultLoadout(hull); },
      unitLoadout(unit){ return Outfitting.LoadoutOf(unit); },
      unitFp(unit){ return Outfitting.UnitFirepower(unit); },
      unitRng(unit){ return Outfitting.UnitRange(unit); },
      unitArsenal(unit){ return Outfitting.UnitWeapons(unit); },
      // M5(c) per-shot choice + the red-number cells (Q8 evidence).
      pickWeapon(unit, name){ _pendingWeapon = { unitId: unit.id, name: name }; return _chosenName(unit); },
      chosenWeapon(unit){ return _chosenName(unit); },
      overlayCells(){ return api.buildFrame().state.tacticalOverlays; },
      selectUnit(unit){ Selection.select(unit); return Selection.getUnit(); },
      canShootAt(unit, B){ return Actions.canShoot(unit, B); },
      // M3(c) live-map seam (tests drive the orchestrator, not just the
      // pure children): set the map section, travel/jump the player through
      // the arrival check, commit a map turn (encounter → battle launch).
      mapSet(mapState){
        const c = GetGameState().campaign;
        if (!c) return null;
        TryPatchGameState({ campaign: Object.assign({}, c, { map: JSON.parse(JSON.stringify(mapState)) }) });
        return _mapSection();
      },
      mapTravelLive(dest){ return _mapTravel(dest); },
      mapJumpLive(target){ return _mapJump(target); },
      mapEndTurn(){ _mapTurnCommit(); return _mapSection(); },
      activeModal(){ return Hud.getActiveModal(); },
      closeDeploy(){ _pendingDeploy = null; Hud.toggleDeployModal(false); },
      solidifyMirages(state){ return materializeMirages(state); },
      checkEndgameStatus(units){ return EndgameStatus.checkEndgameStatus(units); },
      executeWarpIn(unit, shipType, isAI, apCost, opts){
        return Actions.executeWarpIn(unit, shipType, isAI, apCost, opts);
      },
      executeShoot(unit, target, isAI, apCost, weaponName){
        return Actions.executeShoot(unit, target, isAI, apCost, weaponName);
      },
      executeShield(unit, isAI, apCost){
        return Actions.executeShield(unit, isAI, apCost);
      },
      canShield(unit, B){
        return Actions.canShield(unit, B);
      },
      executeMove(unit, dest, isAI, apCost){
        return Actions.executeMove(unit, dest, isAI, apCost);
      },
      saveState(){ return SerializeGameState(); },
      getLifetimes(){ return GetStateLifetimes(); },
      loadState(data){
        const ok = DeserializeGameState(data);
        if (ok) { Visibility.invalidate(); Visibility.ensureCache(); }
        return Boolean(ok);
      },
      dist(a, b){ return MathGrid.dist(a, b); },
      resolveZoom(viewX, viewY, viewSpan, mousePx, deltaY, displaySize){
        return MathGrid.resolveZoom(viewX, viewY, viewSpan, mousePx, deltaY, displaySize);
      },
      createUnit(type, team, x, y, applySpawnExhaustion){
        return SectorGenerator.createUnit(type, team, x, y, applySpawnExhaustion);
      },
      aiBeat: function(){ return AI.beat(); },
      aiSyncMemory: function(){ return AI.syncMemory(); },
      aiChooseBestPlan: function(){ return AI.chooseBestPlan(); },
      clearAudioSchedules(){ GameAudio.clearAll(); },
      resetState(){
        State.aiTimers.forEach(t => clearTimeout(t));
        GameAudio.clearAll();
        _battleSnapshot = null;
        _battleDeaths = { 1: 0, 2: 0 };
        _pendingDeploy = null;
        Rules.initState({ preserve: ["profile"] });
      },
      setSeed(s){ State.rng = mulberry32(s); State.rngSeed = s; },
      startCampaignBattle(opts){
        const o = opts || {};
        if (InitializeCampaign && !GetGameState().campaign) InitializeCampaign();
        return SectorGenerator.generate(o.levelId || 101, {
          skipDeploy: true,
          choice: o.choice,
          seed: o.seed,
          capacity: o.capacity
        });
      },
      checkEndgame(){ return Actions.checkEndgame(); },
      // M6(a) faction seam (tests): identity rows, doctrine-weighted fleet
      // rolls and the per-team hull themes the battle frame would carry.
      factionIds(){ return Factions ? Factions.Ids() : []; },
      factionRow(id){ return Factions ? Factions.Row(id) : null; },
      rollFleet(id, budget, seed){ return Factions ? Factions.ComposeFleet(id, budget, mulberry32(seed)) : []; },
      hullThemesFor(id){ return _hullThemesNow(id); },
      // M6(b) reputation seam (tests): bands, stances, adjustments, the
      // sharing policy and the pair-table seed.
      repBand(score){ return Reputation.Band(score); },
      repStance(rep, a, b){ return Reputation.Stance(rep, a, b); },
      repAdjust(rep, a, b, d){ return Reputation.Adjust(rep, a, b, d); },
      repEvent(rep, kind, a, b, sign){ return Reputation.ApplyEvent(rep, kind, a, b, sign); },
      repShares(band, where){ return Reputation.SharesSensors(band, where); },
      repInit(){ return Reputation.Init(CAMPAIGN_DATA.campaign.factions, id => Factions.AlignmentOf(id)); },
      // M6(c) dialogue seam (tests): the dialogue model, the hail panel and
      // the choice outcomes.
      dialogueFor(encounter, talkCount){ return Factions.DialogueModel(GetGameState().campaign, encounter, talkCount); },
      hailPanelFor(encounter, talkCount){ return Hud.hailPanel(encounter, Factions.DialogueModel(GetGameState().campaign, encounter, talkCount)); },
      dialogueOutcome(encounter, choice, seed){ return Factions.ApplyDialogueOutcome(GetGameState().campaign, encounter, choice, mulberry32(seed)); },
      // M6(d) missions seam (tests): the posted contracts, accept/settle,
      // and progress tracking (the real flow incl. the reputation event).
      missionTable(){ return Missions.Table(); },
      missionNextAt(locId, seed){ return Missions.NextAt({ id: locId }, GetGameState().campaign, mulberry32(seed)); },
      acceptContract(id){
        const c = GetGameState().campaign;
        const n = Missions.Accept(c, id);
        if (n !== c) TryPatchGameState({ campaign: n });
        return GetGameState().campaign;
      },
      completeContract(id){
        const c = GetGameState().campaign;
        const res = Missions.Complete(c, id);
        if (res.completed){
          let next = res.state;
          const row = Missions.Table().filter(function (mm){ return mm.id === id; })[0] || null;
          if (row && row.faction && Reputation){
            next = Object.assign({}, next, {
              reputation: Reputation.ApplyEvent(next.reputation, "mission", "player", row.faction)
            });
          }
          TryPatchGameState({ campaign: next });
        }
        return res;
      },
      creditProgress(kind, n){
        const c = GetGameState().campaign;
        const nx = Missions.Advance(c, kind, n);
        if (nx !== c) TryPatchGameState({ campaign: nx });
        return GetGameState().campaign;
      },
      // M6(e) world life seam (tests): the NPC map turn is pure over the map
      // state — decide orders and resolve one order's visible outcome.
      npcOrdersFor(mapState, fid, seed){ return CampaignMapLib.MapAi(mapState, fid, mulberry32(seed)); },
      npcResolve(mapState, order, seed){ return CampaignMapLib.ApplyMapOrder(mapState, order, mulberry32(seed)); },
      transitionToPlayerTurn(){ return Actions.transitionToPlayerTurn(); },
      transitionToAITurn(){ return Actions.transitionToAITurn(); },
      defaultDeployChoice(){
        const section = GetGameState().campaign;
        const cap = (CAMPAIGN_DATA && CAMPAIGN_DATA.campaign && CAMPAIGN_DATA.campaign.start &&
          CAMPAIGN_DATA.campaign.start.battle && CAMPAIGN_DATA.campaign.start.battle.cornerCapacity) || 4;
        const fleet = (section && section.fleet) || [];
        const split = ReservePlacement.splitOverflow(fleet, cap);
        const selected = [];
        for (let i = 0; i < fleet.length; i++){
          if (split.deployed.indexOf(fleet[i]) !== -1) selected.push(i);
        }
        return { capacity: cap, selected: selected, overflow: split.overflow.length };
      }
    };
  },

  createDebugHandle(){
    // Frozen plain-data snapshot of the theme table (order + palettes) — the
    // live themes module identity never leaves game.js. Switching themes goes
    // through setTheme()/getTheme() below.
    const themeSnapshot = deepFreeze({
      order: Themes.ORDER.slice(),
      palettes: (() => {
        const p = {};
        Themes.ORDER.forEach(t => { p[t] = deepCopy(Themes.palette(t)); });
        return p;
      })()
    });
    return {
      State, AI, Actions, Hud, Visibility, MathGrid, SectorGenerator, Rules, Themes: themeSnapshot, Selection,
      SHIP_SPECS, CAMPAIGN_LEVELS, DIFFICULTY_TABLE,
      playSound(kind, payload){ return GameAudio.play(kind, payload); },
      setTheme(t){ return Hud.setTheme(t); },
      getTheme(){ return Hud.getTheme(); },
      setSeed(s){ State.rng = mulberry32(s); State.rngSeed = s; },
      saveState(){ return SerializeGameState(); },
      loadState(data){
        const ok = DeserializeGameState(data);
        if (ok) {
          Visibility.invalidate();
          Visibility.ensureCache();
          Selection.sync();
          Hud.updateAll();
        }
        return Boolean(ok);
      },
      clearSeed(){ State.rng = null; State.rngSeed = null; },
      getRawState(){ return GetGameState(); },
      // M6(a) faction seam (browser evidence / test helpers): identity rows
      // and seeded doctrine-weighted fleet rolls.
      Factions: {
        ids(){ return Factions ? Factions.Ids() : []; },
        row(id){ return Factions ? Factions.Row(id) : null; },
        rollFleet(id, budget, seed){ return Factions ? Factions.ComposeFleet(id, budget, mulberry32(seed)) : []; },
        hullThemesFor(id){ return _hullThemesNow(id); }
      },
      // M6(d) missions seam (browser evidence): table + progress crediting —
      // accept/settle run through the real board buttons.
      Missions: {
        table(){ return Missions ? Missions.Table() : []; },
        advance(kind, n){
          const c = GetGameState().campaign;
          const nx = Missions.Advance(c, kind, n);
          if (nx !== c) TryPatchGameState({ campaign: nx });
          return GetGameState().campaign;
        }
      },
      // M5 loadout seam facade (browser evidence / test helpers): weapon
      // stats read through the loadout readers, never off unit fields.
      Outfitting: {
        fpOf(u){ return Outfitting.UnitFirepower(u); },
        rngOf(u){ return Outfitting.UnitRange(u); },
        mountsOf(u){ return Outfitting.UnitWeapons(u); },
        slotsOf(w){ return Outfitting.SlotSize(w); },
        checkOf(loadout, hull){ return Outfitting.Validate(loadout, hull); },
        // M5(c) Q8: the per-shot pick on the selected unit + its choice.
        pick(name){
          const u = Selection.getUnit();
          if (!u) return null;
          _pendingWeapon = { unitId: u.id, name: name };
          Hud.updateAll();
          return _chosenName(u);
        },
        chosen(u){ return _chosenName(u); }
      },
      overlayNumbers(){ return api.buildFrame().state.tacticalOverlays; },
      // M4 station storefront facade (browser evidence / probes).
      Station: {
        docked(){ return Boolean(_stationDock()); },
        bundle(){ return _stationBundle(); },
        trade(good, sign){ _stationTrade(good, sign); return _stationBundle(); },
        service(kind, idx){ _stationService(kind, idx); return _stationBundle(); },
        open(){ Hud.toggleStationModal(true); return Hud.getActiveModal(); },
        close(){ Hud.toggleStationModal(false); return Hud.getActiveModal(); }
      },
      Map: {
        state(){ return (GetGameState().campaign && GetGameState().campaign.map) || null; },
        travel(fleetId, dest){
          // Player moves go through the map orchestrator (arrival check →
          // encounter opens → hail shell); foreign fleets move directly.
          if (fleetId === "player") return _mapTravel(dest);
          const c = GetGameState().campaign;
          if (!c || !c.map) return null;
          const res = CampaignMapLib.MoveFleet(c.map, fleetId, dest);
          if (res.mapState) TryPatchGameState({ campaign: Object.assign({}, c, { map: res.mapState }) });
          return res.events;
        },
        jump(fleetId, target){
          if (fleetId === "player") return _mapJump(target);
          const c = GetGameState().campaign;
          if (!c || !c.map) return null;
          const res = CampaignMapLib.HyperspaceJump(c.map, fleetId, target);
          if (res.mapState) TryPatchGameState({ campaign: Object.assign({}, c, { map: res.mapState }) });
          return res.events;
        },
        endTurn(){ _mapTurnCommit(); return (_debugMapState() || {}).turn; },
        visibility(faction){
          const m = _debugMapState();
          return m ? CampaignMapLib.MapVisibility(m, faction || "player") : null;
        },
        battleEvent(locationId, entering){
          const m = _debugMapState();
          return m ? CampaignMapLib.BattleEventAt(m, locationId, entering || null) : null;
        },
        hail(){ const m = _debugMapState(); return m && m.pendingEncounter ? Hud.hailModel(m.pendingEncounter) : null; },
        show(mode){
          const c = GetGameState().campaign;
          if (!c || !c.map) return null;
          const battle = mode === "battle";
          TryPatchGameState({ campaign: Object.assign({}, c, {
            map: Object.assign({}, c.map, { screen: battle ? "battle" : "map", battleActive: battle })
          }) });
          return battle ? "battle" : "map";
        }
      },
      help(){
        console.log("%cSEEK & DESTROY DEBUG HANDLE","color:#38bdf8;font-size:14px;");
        console.log("SD.State            — the whole game memory");
        console.log("SD.saveState() / SD.loadState(obj) — JSON-safe snapshot of profile/match/AI/camera state");
        console.log("SD.Themes           — frozen snapshot of theme ids + palettes (switch via SD.setTheme/getTheme); SD.Selection.getUnit()");
        console.log("SD.AI               — the enemy turn runner (game.js)");
        console.log("SD.Hud              — HUD / modal view-model (hud.js)");
        console.log("SD.Graphics / SD.Sound — renderer and audio engine modules");
        console.log("SD.setSeed(1234)    — make sector generation repeatable (then SD.SectorGenerator.generate(levelId))");
        console.log("SD.runTests()       — load tests/test.js on demand and run the AI + sprite self-tests (19)");
        console.log("                      (returns a Promise the first time; add ?test=1 to the URL to preload tests)");
        console.log("SD.Harness.runAll() — same as SD.runTests()");
        console.log("SD.runAudioTests()  — validate the audio clip manifest, event routing, loops, themes & buses (5)");
        console.log("SD.Harness.testKiting() / testFlagshipGuard() / testFocusFire() / testDoctrine()");
        console.log("SD.Harness.testFlagshipShieldAlwaysUp() / testRailgunAvoidance() / testFleeWhenOutgunned()");
        console.log("SD.Harness.testRecedingHorizon() / testBudgetAwarePlanning()");
        console.log("SD.Harness.testZoomAnchor() / testZoomClamp()");
        console.log("%c--- BAKED SPRITES & OVERLAYS ---","color:#c9924f;");
        console.log("SD.Harness.testBakedSpriteAtlas() / testRailgunPulseOffset()");
        console.log("SD.Harness.testHullFactionRead() / testWeaponFactionNeutral() / testExhaustedDistinct()");
        console.log("SD.railgunPulseOffset(t,period)");
        console.log("%c--- AUDIO ---","color:#c084fc;");
        console.log("SD.playSound(name, payload) — trigger any sound event (e.g. \"unit.move\", \"weapon.fire\")");
        console.log("SD.Sound.unlock() / toggleMute() / setMaster(0..1) / setBusGain(name, 0..1)");
        console.log("SD.State.audioTimers — tracked audio timers (cleared on level restart)");
        console.log("SD.State.aiScoreTrace — what the AI considered last turn");
        console.log("SD.State.aiEmergencyMode — whether the AI thinks its flagship is about to die");
        console.log("SD.LayoutMetrics — live canvas geometry (displaySize, cellPx, renderScale, devicePx, fontScale, textScale)");
        console.log("SD.State.viewSpan — current viewport span (5..32)");
        console.log("SD.State.viewX / viewY — viewport top-left cell");
        console.log("SD.MathGrid.clampViewport() — clamp viewport to board bounds");
        console.log("SD.State.zoomAnim — active zoom animation (from/to span, x, y, start, duration)");
        console.log("SD.MathGrid.resolveZoom(viewX,viewY,viewSpan,mousePx,deltaY,displaySize) — pure zoom resolver");
      }
    };
  }
};

return api;
})();
