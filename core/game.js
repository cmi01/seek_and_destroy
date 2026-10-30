"use strict";

// ============================================================
// GAME CORE — State view, seeded RNG, host binding, GameAudio, MathGrid,
// Visibility, Selection, Actions (domain actions & turn state machine),
// InputProcessor, and AI turn runner. Owns all state and privately loads
// data/*_DATA.js, core/gameState.js, core/themes.js, core/rules.js,
// core/hud.js, core/sectorGenerator.js, and ai/ai.js via Game._registerModule.
// ============================================================
const Game = (() => {
const _modules = {
  rulesData: null,
  campaignData: null,
  beginningGameStateData: null,
  themesData: null,
  gameState: null,
  themes: null,
  rules: null,
  hud: null,
  sectorGenerator: null,
  ai: null,
  tests: null
};
let _registrationOpen = true;
const _stateBox = { current: null };
const _themeState = { active: "default", caches: {} };
let _hudStore = null;

let RULES_DATA = null;
let CAMPAIGN_DATA = null;
let BEGINNING_GAME_STATE_DATA = null;
let THEME_DATA = null;

let InitializeGameState = null;
let GetGameState = null;
let TryPatchGameState = null;
let GetStateLifetimes = null;
let SerializeGameState = null;
let DeserializeGameState = null;

let Rules = null;
let Themes = null;
let Hud = null;
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
      buses: { UI: 0.40, TELEMETRY: 0.65, SYSTEMS: 0.80, COMBAT: 0.95, AMBIENCE: 0.55, MUSIC: 0.22 },
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

// ---- Host & Interface services ------------------------------------------
// main.js injects the platform host and the 3 unidirectional Interface Server
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
    getAnalyser(){
      return null;
    },
    getRadioActiveUntil(){
      return _radioActiveUntil;
    }
  };
})();

const MathGrid = {
  inBounds(gx,gy){ return typeof Rules!=="undefined"?Rules.inBounds(State,gx,gy):(gx>=0&&gx<GRID_SIZE&&gy>=0&&gy<GRID_SIZE); },
  gridToCenter(gx,gy){ const cp = _host.getCellPx(); return {x:(gx+0.5)*cp, y:(gy+0.5)*cp}; },
  getRenderedViewport(now){
    const DS = _host ? _host.getDisplaySize() : 768;
    const anim = State.zoomAnim;
    if (anim && anim.active){
      const tNow = (typeof now === "number")
        ? now
        : ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());
      const t = Math.min(1, Math.max(0, (tNow - anim.start) / (anim.duration || 180)));
      if (t < 1){
        const ease = 1 - Math.pow(1 - t, 3);
        const viewSpan = anim.fromSpan + (anim.toSpan - anim.fromSpan) * ease;
        const viewX = anim.fromX + (anim.toX - anim.fromX) * ease;
        const viewY = anim.fromY + (anim.toY - anim.fromY) * ease;
        return { viewX, viewY, viewSpan, cellPx: DS / viewSpan, active: true };
      }
    }
    const viewSpan = State.viewSpan;
    return { viewX: State.viewX, viewY: State.viewY, viewSpan, cellPx: DS / viewSpan, active: false };
  },
  pixelToGrid(px,py){
    const vp = this.getRenderedViewport();
    return {
      x: Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(vp.viewX + px / vp.cellPx))),
      y: Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(vp.viewY + py / vp.cellPx)))
    };
  },
  clampViewport(){
    const nextSpan = Math.max(5, Math.min(32, State.viewSpan));
    const nextX = Math.max(0, Math.min(GRID_SIZE - nextSpan, State.viewX));
    const nextY = Math.max(0, Math.min(GRID_SIZE - nextSpan, State.viewY));
    if (typeof Rules !== "undefined" && Rules.patchState){
      Rules.patchState({ viewSpan: nextSpan, viewX: nextX, viewY: nextY });
    } else {
      State.viewSpan = nextSpan;
      State.viewX = nextX;
      State.viewY = nextY;
    }
  },
  dist(a,b){ return typeof Rules!=="undefined"?Rules.dist(a,b):Math.hypot(a.x-b.x, a.y-b.y); },
  inRange(a,b,r){ return typeof Rules!=="undefined"?Rules.inRange(a,b,r):Math.hypot(a.x-b.x, a.y-b.y) <= r+1e-6; },
  getUnitAt(gx,gy){ return typeof Rules!=="undefined"?Rules.getUnitAt(State,gx,gy):(State.units.find(u=>u.hp>0&&u.x===gx&&u.y===gy)||null); },
  hasLineOfSight(x0,y0,x1,y1,mode){
    return typeof Rules!=="undefined"?Rules.hasLineOfSight(State,x0,y0,x1,y1,mode):false;
  },

  // Camera zoom: step the zoom ladder by whole wheel notches while keeping
  // the grid cell under the cursor anchored. Pure function of its inputs.
  // (Moved here from Rules in V57 — it is viewport math, not a game rule.)
  resolveZoom(viewX, viewY, viewSpan, mousePx, deltaY, displaySize) {
    const zoomLadder = Rules.zoomLadder;
    const wheelNotchPx = Rules.wheelNotchPx;
    const maxZoomStepsPerEvent = Rules.maxZoomStepsPerEvent;
    const gridSize = Rules.gridSize;
    const DS = displaySize || (_host ? _host.getDisplaySize() : 768);
    if (deltaY === 0) return { viewX, viewY, viewSpan, changed: false };

    const rawSteps = deltaY / wheelNotchPx;
    let steps = Math.round(rawSteps);
    steps = Math.max(-maxZoomStepsPerEvent, Math.min(maxZoomStepsPerEvent, steps));
    if (steps === 0) return { viewX, viewY, viewSpan, changed: false };

    let idx = zoomLadder.indexOf(viewSpan);
    if (idx === -1) {
      let best = 0, bestDiff = Infinity;
      for (let i = 0; i < zoomLadder.length; i++) {
        const d = Math.abs(zoomLadder[i] - viewSpan);
        if (d < bestDiff) { bestDiff = d; best = i; }
      }
      idx = best;
    }

    const newIdx = Math.max(0, Math.min(zoomLadder.length - 1, idx + steps));
    if (newIdx === idx) return { viewX, viewY, viewSpan, changed: false };

    const newSpan = zoomLadder[newIdx];
    const cellPx = DS / viewSpan;
    const anchorGX = viewX + mousePx.x / cellPx;
    const anchorGY = viewY + mousePx.y / cellPx;

    const newCellPx = DS / newSpan;
    let newViewX = Math.round(anchorGX - mousePx.x / newCellPx);
    let newViewY = Math.round(anchorGY - mousePx.y / newCellPx);

    newViewX = Math.max(0, Math.min(gridSize - newSpan, newViewX));
    newViewY = Math.max(0, Math.min(gridSize - newSpan, newViewY));

    return {
      viewX: newViewX,
      viewY: newViewY,
      viewSpan: newSpan,
      changed: (newSpan !== viewSpan || newViewX !== viewX || newViewY !== viewY)
    };
  }
};

const Visibility = {
  invalidate(){
    State.visDirty = true;
  },
  ensureCache(){
    if (!State.visCache || State.visDirty){
      const vis = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
      if (!Array.isArray(State.exploredCells) || State.exploredCells.length !== GRID_SIZE){
        State.exploredCells = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
      }
      for (let gx = 0; gx < GRID_SIZE; gx++){
        for (let gy = 0; gy < GRID_SIZE; gy++){
          const v = this.isCellVisibleToTeam(gx, gy, 1);
          vis[gx][gy] = v;
          if (v && State.exploredCells[gx]) State.exploredCells[gx][gy] = true;
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
    State.selectedCell = { x: unit.x, y: unit.y };
    return unit;
  },
  clear(){
    if (State.selectedUnitId !== null) State.selectedUnitId = null;
    if (State.selectedCell !== null) State.selectedCell = null;
    return null;
  },
  getUnit(){
    const id = State.selectedUnitId;
    if (id === null || id === undefined) return null;
    return State.units.find(u => u.id === id && u.hp > 0) || null;
  },
  // Re-derive selectedCell after units move, die or change hands.
  sync(){
    const u = this.getUnit();
    if (!u) return this.clear();
    const c = State.selectedCell;
    if (!c || c.x !== u.x || c.y !== u.y) State.selectedCell = { x: u.x, y: u.y };
    return u;
  }
};

// ======================== ACTIONS ========================
// Domain actions & turn state machine: rule queries, combat/move/capture/
// shield/warp execution, AP accounting, endgame detection and turn hand-off.
// Presentation lives in hud.js (Hud); sector setup in sectorGenerator.js;
// the AI turn runner in aiController.js.
const Actions = {
  bindInputs(){
    // Inputs process is bound directly by main.js to InputInterface (V66).
  },

  addAnimation(anim){ State.animations.push({...anim,start:performance.now()}); },

  getPriorityActionAt(unitA,gx,gy,opts){
    return Rules.getPriorityActionAt(State,unitA,gx,gy,opts);
  },

  canMove(unitA,B){
    return Rules.canMove(State,unitA,B);
  },

  canCapture(unitA,B){
    return Rules.canCapture(State,unitA,B);
  },

  canShoot(unitA,B){
    return Rules.canShoot(State,unitA,B);
  },

  canShield(unitA,B){
    return Rules.canShield(State,unitA,B);
  },

  getValidWarpCells(capitalUnit,radius){
    return Rules.getValidWarpCells(State,capitalUnit,radius);
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

      const outcome=Rules.computeCollisionOutcome(unitA,occupant);
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
      State.units=State.units.filter(u=>u.hp>0);
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
    target.flags.add("-attacked"); target.flags.add("-shielded");
    Visibility.invalidate();
    Visibility.ensureCache();

    this.addAnimation({kind:"capture",duration:350,from:origin,to:dest,targetName:target.type});
    this.consumeAPAndCheckTurn(isAI,apCost);
  },

  executeShoot(unitA,target,isAI=false,apCost=1){
    const origin={x:unitA.x,y:unitA.y};
    const dest={x:target.x,y:target.y};
    const visStartOrEnd=Visibility.isCellVisibleToTeam(origin.x,origin.y,1)||Visibility.isCellVisibleToTeam(dest.x,dest.y,1);
    const spec=SHIP_SPECS[unitA.type];
    const wType=spec.wType||"pdc";

    if(isAI&&visStartOrEnd) State.historicalVectors.push({kind:"shoot",from:origin,to:dest,team:unitA.team});
    GameAudio.play("weapon.fire", {from:origin, to:dest, team:unitA.team, unitType:unitA.type, targetType:target.type, wType, isVisible:visStartOrEnd});

    unitA.flags.add("-attacked");

    if(unitA.flags.has("+shield")){
      unitA.flags.delete("+shield");
      this.addAnimation({kind:"shielddrop",duration:160,cell:origin});
      GameAudio.play("weapon.shieldStrip", {from:origin, to:origin, team:unitA.team, isVisible:visStartOrEnd, attackerStrip:true});
    }

    const shootOutcome=Rules.computeShootOutcome(unitA,target);
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
      State.units=State.units.filter(u=>u.hp>0);
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
    unitA.flags.add("-shielded");
    this.addAnimation({kind:"shieldup",duration:250,cell});
    this.consumeAPAndCheckTurn(isAI,apCost);
  },

  executeWarpIn(capitalUnit,shipType,isAI=false,apCost=1,opts={}){
    const radius=(opts.radius===undefined)?SPAWN_RADIUS:opts.radius;
    const costMult=(opts.costMult===undefined)?1:opts.costMult;
    const spec=SHIP_SPECS[shipType];
    const team=capitalUnit.team;
    const validCells=this.getValidWarpCells(capitalUnit,radius);
    const effectiveCost=Math.ceil(spec.cost*costMult);
    if(!spec||State.credits[team]<effectiveCost||validCells.length===0){
      if(!isAI) GameAudio.play("ui.invalid", {});
      return false;
    }

    const pick=validCells[Math.floor(RND()*validCells.length)];
    State.credits[team]-=effectiveCost;
    const spawned=SectorGenerator.createUnit(shipType,team,pick.x,pick.y,true);
    Visibility.invalidate();
    Visibility.ensureCache();
    const vis=Visibility.isCellVisibleToTeam(pick.x,pick.y,1);

    if(isAI&&vis) State.turnReportQueue.push(`WARP SIGNATURE: Syndicate warped in ${shipType} at [${pick.x},${pick.y}].`);

    GameAudio.play("unit.warpIn", {from:pick, to:pick, team, unitType:shipType, isVisible:vis});

    this.addAnimation({kind:"warp",duration:300,cell:pick,shipType:spawned.type});
    Hud.triggerWarpAnomaly();
    this.consumeAPAndCheckTurn(isAI,apCost);
    return true;
  },

  checkEndgame(){
    if(State.gameOver) return true;
    const status=Rules.checkEndgameStatus(State.units);

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
    State.credits[2]+=State.income[2];
    State.historicalVectors=[];
    State.units.forEach(u=>{
      if(u.team===2){
        u.flags.delete("-moved"); u.flags.delete("-sent boarding party");
        u.flags.delete("-attacked"); u.flags.delete("-shielded");
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
    State.credits[1]+=State.income[1];
    State.units.forEach(u=>{
      if(u.team===1){
        u.flags.delete("-moved"); u.flags.delete("-sent boarding party");
        u.flags.delete("-attacked"); u.flags.delete("-shielded");
      }
    });
    GameAudio.play("turn.aiEnd", { delaySec: 0.18 });
    if(State.turnReportQueue.length===0) State.turnReportQueue.push("SYNDICATE TURN COMPLETE: 4/4 actions executed in sector.");
    Hud.showIntelOverlay(`TURN ${String(State.turnNumber).padStart(2,"0")} // OPERATIONAL REPORT`,State.turnReportQueue);
    State.turnReportQueue=[];
    Hud.updateAll();
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
    if (btn.id === "BRIDGE"){
      Hud.toggleBridgeModal();
    } else if (btn.id === "MAP"){
      Hud.toggleCampaignModal(true);
    } else if (btn.id === "THEME"){
      Hud.setTheme(Themes.next(State.theme));
      GameAudio.play("ui.select");
    } else if (btn.id === "AUDIO"){
      if (!GameAudio.isReady()){
        GameAudio.unlock();
      } else {
        GameAudio.toggleMute();
        GameAudio.play("ui.select");
      }
      Hud.syncLayout();
    } else if (btn.id === "SHIELD"){
      const selUnit = Selection.getUnit();
      if (selUnit && selUnit.team === 1 && Actions.canShield(selUnit, { x: selUnit.x, y: selUnit.y })){
        Actions.executeShield(selUnit, false);
      } else {
        GameAudio.play("ui.invalid");
      }
    } else if (btn.id === "END_TURN"){
      if (State.activeTeam === 1 && !State.gameOver){
        Actions.consumeAPAndCheckTurn(false, Math.max(1, State.ap));
      }
    } else if (btn.id === "CLOSE_MODAL"){
      Hud.toggleBridgeModal(false);
      Hud.toggleCampaignModal(false);
    } else if (typeof btn.id === "string" && btn.id.indexOf("SHOP_BUY:") === 0){
      const shipName = btn.id.slice("SHOP_BUY:".length);
      const selUnit = Selection.getUnit();
      if (selUnit && selUnit.team === 1){
        Hud.toggleBridgeModal(false);
        Actions.executeWarpIn(selUnit, shipName, false);
      } else {
        GameAudio.play("ui.invalid");
      }
    } else if (typeof btn.id === "string" && btn.id.indexOf("LEVEL_SELECT:") === 0){
      const lvlId = Number(btn.id.slice("LEVEL_SELECT:".length));
      Hud.hideEndgameModal();
      GameAudio.play("ui.select");
      SectorGenerator.generate(lvlId);
      Hud.toggleCampaignModal(false);
    } else if (btn.id === "ENDGAME_RETRY"){
      Hud.hideEndgameModal();
      GameAudio.play("ui.select");
      SectorGenerator.generate(State.levelId);
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
      Hud.refreshMinimapLabel();
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
        Hud.toggleBridgeModal();
        refreshHoverFromCamera();
      } else if (evt.key === "i" || evt.key === "I"){
        if (!State.inspectMode){
          State.inspectMode = true;
          GameAudio.play("ui.inspect");
          Hud.updateRightWing();
        }
      } else if (evt.code === "Escape"){
        if (Hud.isModalOpen()){
          Hud.toggleBridgeModal(false);
          Hud.toggleCampaignModal(false);
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
// Folded into game.js (V65) so ai/ai.js (getAIAction) is a direct
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
    return {
      gridSize: GRID_SIZE,
      spawnRadius: SPAWN_RADIUS,
      difficulty: DIFFICULTY,
      difficultyTable: DIFFICULTY_TABLE,
      shipSpecs: SHIP_SPECS,
      aiDoctrine: State.aiDoctrine,
      turnNumber: State.turnNumber,
      activeTeam: State.activeTeam,
      ap: State.ap,
      credits: State.credits ? { ...State.credits } : { 1: 0, 2: 0 },
      terrain: clonedTerrain,
      units: clonedUnits,
      // O(1) Rules.getUnitAt during planning (the board does not change while
      // the AI evaluates a beat; a new snapshot is built every beat).
      unitIndex: Rules.buildUnitIndex(clonedUnits),
      lastSeenEnemies: State.lastSeenEnemies,
      reservations: (State.aiPlan && State.aiPlan.reservations) ? State.aiPlan.reservations : new Map(),
      aiEmergencyMode: State.aiEmergencyMode,
      aiScoreTrace: State.aiScoreTrace,
      gameOver: State.gameOver,
      rolls,
      roll: withRolls ? RND() : 1,
      syncOnly,
      rules: Rules
    };
  },
  getAIAction(snap){
    return getAIAction(snap);
  },
  syncMemory(){
    if (typeof getAIAction !== "function") return;
    const snap = this._snapshot(false, true);
    getAIAction(snap);
    State.lastSeenEnemies = snap.lastSeenEnemies;
  },
  chooseBestPlan(){
    if (typeof getAIAction !== "function") return null;
    const snap = this._snapshot(true, false);
    const [action, coord] = getAIAction(snap);
    State.lastSeenEnemies = snap.lastSeenEnemies;
    State.aiEmergencyMode = snap.aiEmergencyMode;
    State.aiScoreTrace = snap.aiScoreTrace;
    if (!action || action === "NONE") return null;
    const dec = snap.decision || {};
    const pl = snap.selectedPlan || {};
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
    const [action, coord] = getAIAction(snap);
    State.lastSeenEnemies = snap.lastSeenEnemies;
    State.aiEmergencyMode = snap.aiEmergencyMode;
    State.aiScoreTrace = snap.aiScoreTrace;
    if (!State.aiPlan) State.aiPlan = {reservations: new Map(), currentPlan: null, stepIndex: 0};
    State.aiPlan.reservations = snap.reservations;
    State.aiPlan.currentPlan = snap.selectedPlan || null;
    State.aiPlan.stepIndex = 0;

    const dec = snap.decision || null;
    const actingUnit = (dec && dec.unitId !== undefined)
      ? State.units.find(u => u.id === dec.unitId && u.hp > 0 && u.team === 2) || null
      : null;
    const gx = Array.isArray(coord) ? coord[0] : -1;
    const gy = Array.isArray(coord) ? coord[1] : -1;

    if (typeof action === "string" && action.startsWith("WARP:")){
      const shipType = action.slice(5);
      const capitalUnit = actingUnit || MathGrid.getUnitAt(gx, gy);
      if (capitalUnit){
        Actions.executeWarpIn(capitalUnit, shipType, true, 1, (dec && dec.warpOpts) || snap.warpOpts || {});
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
// core/sectorGenerator.js and applies the returned plain data to State,
// Selection, MathGrid, Visibility, AI, Hud, and GameAudio.
const SectorGenerator = {
  createUnit(type, team, x, y, applySpawnExhaustion = false){
    const u = _modules.sectorGenerator.createUnitData(
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

  generate(levelId){
    State.aiTimers.forEach(t => clearTimeout(t));
    GameAudio.clearAll();
    Rules.initState({ preserve: ["profile"] });

    const result = _modules.sectorGenerator.generateSectorData({
      levelId,
      campaignLevels: CAMPAIGN_LEVELS,
      shipSpecs: SHIP_SPECS,
      gridSize: GRID_SIZE,
      maxAp: MAX_AP,
      rnd: RND
    });

    Rules.patchState(result.patch);

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
    Hud.refreshMinimapLabel();

    State.turnReportQueue = [...result.initialIntel];
    Hud.showIntelOverlay(result.spec.tag, State.turnReportQueue);
    State.turnReportQueue = [];
    Hud.updateAll();

    GameAudio.play("level.start", { levelId: result.spec.id });
  }
};

// ======================== SUBSYSTEM INITIALIZATION ========================
// Called once by Game.init() AFTER Game.load() and Game.bindInterfaces() have run.
function initializeSubsystems(){
  Rules.initState();
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
// The single entry point main.js uses to load, initialize, step, publish frames,
// test, and inspect the game domain without main.js referencing any internal
// domain files or globals.
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

// On-demand child: tests/gameTests.js. Registration is reopened only while it loads.
let _testsPromise = null;
function _loadTests(){
  if (_modules.tests) return Promise.resolve();
  if (!_testsPromise){
    _registrationOpen = true;
    api._registerModule = function(name, mod){
      if (!_registrationOpen || name !== "tests") throw new Error("[S&D Game] Unexpected module registration for " + name);
      _modules.tests = mod;
    };
    _testsPromise = _loadScripts(["tests/gameTests.js"]).then(() => {
      if (!_modules.tests) throw new Error("tests/gameTests.js loaded but did not register its module.");
    }).finally(() => {
      _registrationOpen = false;
      delete api._registerModule;
    }).catch(err => {
      _testsPromise = null;
      throw err;
    });
  }
  return _testsPromise;
}

let _gameLoadPromise = null;
const api = {
  _registerModule(name, mod){
    if (!_registrationOpen || !(name in _modules)) {
      throw new Error("[S&D Game] Unexpected module registration for " + name);
    }
    _modules[name] = mod;
  },

  async load(){
    if (_gameLoadPromise) return _gameLoadPromise;
    _gameLoadPromise = (async () => {
      await _loadScripts([
        "data/rules_DATA.js",
        "data/campaign_DATA.js",
        "data/beginningGameState_DATA.js",
        "data/themes_DATA.js",
        "core/gameState.js",
        "core/themes.js",
        "core/rules.js",
        "core/hud.js",
        "core/sectorGenerator.js",
        "ai/ai.js"
      ]);
      const missing = [
        ["data/rules_DATA.js",              _modules.rulesData],
        ["data/campaign_DATA.js",           _modules.campaignData],
        ["data/beginningGameState_DATA.js", _modules.beginningGameStateData],
        ["data/themes_DATA.js",             _modules.themesData],
        ["core/gameState.js",               typeof _modules.gameState === "function"],
        ["core/themes.js",                  typeof _modules.themes === "function"],
        ["core/rules.js",                   typeof _modules.rules === "function"],
        ["core/hud.js",                     _modules.hud && typeof _modules.hud.createHud === "function"],
        ["core/sectorGenerator.js",         _modules.sectorGenerator && typeof _modules.sectorGenerator.generateSectorData === "function"],
        ["ai/ai.js",                        typeof _modules.ai === "function" && typeof _modules.ai.load === "function"]
      ].filter(c => !c[1]).map(c => c[0]);
      if (missing.length > 0) {
        throw new Error("These scripts loaded but did not register their module (see earlier errors):\n  " + missing.join("\n  "));
      }

      RULES_DATA = _modules.rulesData;
      CAMPAIGN_DATA = _modules.campaignData;
      BEGINNING_GAME_STATE_DATA = _modules.beginningGameStateData;
      THEME_DATA = _modules.themesData;

      GRID_SIZE = RULES_DATA.gridSize;
      SPAWN_RADIUS = RULES_DATA.spawnRadius;
      MAX_AP = RULES_DATA.maxAp;
      ENEMY_ACTION_INTERVAL_MS = RULES_DATA.enemyActionIntervalMs;
      DIFFICULTY = RULES_DATA.defaultDifficulty;
      DIFFICULTY_TABLE = RULES_DATA.difficultyProfiles;
      SHIP_SPECS = RULES_DATA.shipSpecs;
      CAMPAIGN_LEVELS = CAMPAIGN_DATA.levels;

      const stateLib = _modules.gameState(BEGINNING_GAME_STATE_DATA);
      InitializeGameState = opts => stateLib.InitializeGameState(_stateBox, opts);
      GetGameState = () => stateLib.GetGameState(_stateBox);
      TryPatchGameState = delta => stateLib.TryPatchGameState(_stateBox, delta);
      GetStateLifetimes = () => stateLib.GetStateLifetimes();
      SerializeGameState = () => stateLib.SerializeGameState(_stateBox);
      DeserializeGameState = data => stateLib.DeserializeGameState(_stateBox, data);

      Themes = _modules.themes(THEME_DATA, _themeState);

      const pureRules = _modules.rules(RULES_DATA);
      Rules = Object.defineProperties({}, Object.getOwnPropertyDescriptors(pureRules));
      Rules.getState = function(ctx){ return (ctx && ctx.units !== undefined) ? ctx : GetGameState(); };
      Rules.initState = function(opts){ return InitializeGameState(opts); };
      Rules.patchState = function(delta){ return TryPatchGameState(delta); };

      _hudStore = _modules.hud.createInitialHudStore();
      Hud = _modules.hud.createHud({
        hudStore: _hudStore,
        State,
        MathGrid,
        Visibility,
        Actions,
        Selection,
        Rules,
        Themes,
        GameAudio,
        getHost: () => _host,
        getCampaignLevels: () => CAMPAIGN_LEVELS,
        getShipSpecs: () => SHIP_SPECS
      });

      const rawAI = _modules.ai;
      await rawAI.load();
      getAIAction = snap => {
        if (snap && !snap.rules) snap.rules = pureRules;
        return rawAI(snap);
      };

      _registrationOpen = false;
      delete api._registerModule;
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

  startSector(levelId){
    SectorGenerator.generate(levelId);
  },

  getViewSpan(){
    return (typeof GetGameState === "function" && State.viewSpan) ? State.viewSpan : 16;
  },

  refreshLayout(){
    Hud.refreshMinimapLabel();
    Hud.updateAll();
  },

  onResize(){
    State.zoomAnim.active = false;
    MathGrid.clampViewport();
    Hud.refreshMinimapLabel();
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

  sampleOscilloscope(now){
    Hud.sampleOscilloscope(now);
  },

  buildFrame(overrides){
    const nowVal = (overrides && typeof overrides.now === "number")
      ? overrides.now
      : ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());
    const rawVis = (overrides && overrides.visCache) || State.visCache || Visibility.ensureCache();
    const m = (_host && _host.metrics) ? _host.metrics : null;
    const metricsDTO = m ? {
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
      minimapDevicePx: m.minimapDevicePx
    } : null;

    const vp = MathGrid.getRenderedViewport(nowVal);
    const anim = State.zoomAnim;
    let dx0 = State.viewX, dx1 = State.viewX + State.viewSpan;
    let dy0 = State.viewY, dy1 = State.viewY + State.viewSpan;
    if (anim && anim.active){
      dx0 = Math.max(0, Math.floor(Math.min(anim.fromX, anim.toX)));
      dx1 = Math.min(GRID_SIZE, Math.ceil(Math.max(anim.fromX + anim.fromSpan, anim.toX + anim.toSpan)));
      dy0 = Math.max(0, Math.floor(Math.min(anim.fromY, anim.toY)));
      dy1 = Math.min(GRID_SIZE, Math.ceil(Math.max(anim.fromY + anim.fromSpan, anim.toY + anim.toSpan)));
    }
    const viewportDTO = {
      viewX: State.viewX,
      viewY: State.viewY,
      viewSpan: State.viewSpan,
      renderViewX: vp.viewX,
      renderViewY: vp.viewY,
      renderViewSpan: vp.viewSpan,
      dx0, dx1, dy0, dy1
    };

    const selUnit = Selection.getUnit();
    const isPlayerTurn = State.activeTeam === 1 && !State.gameOver;
    const canShieldSelected = Boolean(
      isPlayerTurn &&
      selUnit &&
      selUnit.team === 1 &&
      State.ap > 0 &&
      Actions.canShield(selUnit, { x: selUnit.x, y: selUnit.y })
    );

    const tacticalOverlays = { active: false, originX: 0, originY: 0, cells: [], hoveredMoveLine: null };
    if (selUnit && selUnit.team === 1 && isPlayerTurn && State.ap > 0){
      tacticalOverlays.active = true;
      tacticalOverlays.originX = selUnit.x;
      tacticalOverlays.originY = selUnit.y;
      const explored = State.exploredCells;
      const knownTerrain = Array.from({ length: GRID_SIZE }, (_, x) =>
        Array.from({ length: GRID_SIZE }, (__, y) => {
          const isKnown = Boolean((rawVis && rawVis[x] && rawVis[x][y]) || (explored && explored[x] && explored[x][y]));
          return isKnown && State.terrain && State.terrain[x] ? State.terrain[x][y] : "EMPTY";
        })
      );
      const knownCtx = Object.create(GetGameState());
      knownCtx.terrain = knownTerrain;
      knownCtx.unitIndex = Rules.buildUnitIndex(State.units);
      const canMoveKnown = (u, b) => Rules.canMove(knownCtx, u, b);
      const hasKnownLos = (x0, y0, x1, y1, mode) => Rules.hasLineOfSight(knownCtx, x0, y0, x1, y1, mode);

      for (let gx = dx0; gx < dx1; gx++){
        for (let gy = dy0; gy < dy1; gy++){
          const B = { x: gx, y: gy };
          const cm = canMoveKnown(selUnit, B);
          const cs = Boolean(
            !Rules.hasFlag(selUnit, "-attacked") &&
            selUnit.firepower > 0 &&
            !(gx === selUnit.x && gy === selUnit.y) &&
            MathGrid.inRange(selUnit, B, selUnit.range) &&
            hasKnownLos(selUnit.x, selUnit.y, gx, gy, "WEAPON")
          );
          const spottedEnemy = cs ? Visibility.getSpottedEnemyAt(gx, gy, 1) : null;
          const spottedEnemyDmg = spottedEnemy ? Rules.computeShootOutcome(selUnit, spottedEnemy).damageDealt : null;
          const isHov = Boolean(State.hoveredCell && State.hoveredCell.x === gx && State.hoveredCell.y === gy);
          const cc = Actions.canCapture(selUnit, B);
          const csh = Actions.canShield(selUnit, B);
          if (cm || cs || cc || csh){
            tacticalOverlays.cells.push({
              gx, gy,
              canMove: cm,
              canShoot: cs,
              spottedEnemyDmg,
              isHovered: isHov,
              firepower: selUnit.firepower,
              canCapture: cc,
              canShield: csh
            });
          }
        }
      }
      if (State.hoveredCell && canMoveKnown(selUnit, State.hoveredCell)){
        tacticalOverlays.hoveredMoveLine = {
          fromX: selUnit.x,
          fromY: selUnit.y,
          toX: State.hoveredCell.x,
          toY: State.hoveredCell.y,
          dist: MathGrid.dist(selUnit, State.hoveredCell)
        };
      }
    }

    const unitsDTO = Array.isArray(State.units) ? State.units.map(u => ({
      id: u.id,
      type: u.type,
      team: u.team,
      x: u.x,
      y: u.y,
      hp: u.hp,
      maxHp: u.maxHp,
      move: u.move,
      firepower: u.firepower,
      range: u.range,
      scan: u.scan,
      effectiveScan: Visibility.getEffectiveScan(u),
      spottedByPlayer: Visibility.isUnitSpottedByTeam(u, 1),
      cost: u.cost,
      flags: new Set(u.flags)
    })) : [];

    const stateDTO = {
      levelId: State.levelId,
      turnNumber: State.turnNumber,
      activeTeam: State.activeTeam,
      ap: State.ap,
      maxAp: MAX_AP,
      gameOver: Boolean(State.gameOver),
      credits: State.credits ? { ...State.credits } : { 1: 0, 2: 0 },
      income: State.income ? { ...State.income } : { 1: 0, 2: 0 },
      theme: State.theme || "default",
      viewX: State.viewX,
      viewY: State.viewY,
      viewSpan: State.viewSpan,
      zoomAnim: State.zoomAnim ? { ...State.zoomAnim } : { active: false },
      inspectMode: Boolean(State.inspectMode),
      buttonHovered: State.buttonHovered,
      buttonPressed: State.buttonPressed,
      selectedCell: State.selectedCell ? { ...State.selectedCell } : null,
      hoveredCell: State.hoveredCell ? { ...State.hoveredCell } : null,
      terrain: State.terrain,
      asteroidSeeds: State.asteroidSeeds,
      exploredCells: State.exploredCells,
      units: unitsDTO,
      historicalVectors: Array.isArray(State.historicalVectors) ? State.historicalVectors.slice() : [],
      animations: Array.isArray(State.animations) ? State.animations.slice() : [],
      canvasButtons: Array.isArray(State.canvasButtons) ? State.canvasButtons.slice() : [],
      audioSettings: State.audioSettings ? { muted: Boolean(State.audioSettings.muted) } : { muted: false },
      canShieldSelected,
      tacticalOverlays
    };

    const frame = {
      GRID_SIZE,
      SPAWN_RADIUS,
      SHIP_SPECS,
      CAMPAIGN_LEVELS,
      MAX_AP,
      state: stateDTO,
      viewport: viewportDTO,
      cursor: InputProcessor.getCursor(),
      metrics: metricsDTO,
      theme: State.theme || "default",
      now: nowVal,
      visCache: rawVis,
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
      get state(){ return State; },
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
        Rules.initState({ preserve: ["profile"] });
      }
    };
  },

  createDebugHandle(){
    return {
      State, AI, Actions, Hud, Visibility, MathGrid, SectorGenerator, Rules, Themes, Selection,
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
      help(){
        console.log("%cSEEK & DESTROY DEBUG HANDLE","color:#38bdf8;font-size:14px;");
        console.log("SD.State            — the whole game memory");
        console.log("SD.saveState() / SD.loadState(obj) — JSON-safe snapshot of profile/match/AI/camera state");
        console.log("SD.Themes           — theme ids, palettes, normalize()/next(); SD.Selection.getUnit()");
        console.log("SD.AI               — the enemy turn runner (game.js)");
        console.log("SD.Hud              — HUD / modal view-model (hud.js)");
        console.log("SD.Graphics / SD.Sound — renderer and audio engine modules");
        console.log("SD.setSeed(1234)    — make sector generation repeatable (then SD.SectorGenerator.generate(levelId))");
        console.log("SD.runTests()       — load tests/test.js on demand and run the AI + sprite self-tests (16)");
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
