"use strict";

// ============================================================
// SECTOR GENERATOR — Pure-function campaign sector generator: procedural
// asteroid clusters & nebula patches, unit spawning, and initial camera.
// Privately registered with Game (core/game.js); holds zero state, mutates
// zero external objects, and exposes zero globals.
// ============================================================
Game._registerModule("sectorGenerator", (() => {
  function inBounds(gridSize, gx, gy) {
    return gx >= 0 && gx < gridSize && gy >= 0 && gy < gridSize;
  }

  function createUnitData(shipSpecs, nextId, type, team, x, y, applySpawnExhaustion = false) {
    const spec = shipSpecs[type];
    const flags = new Set(spec.flags);
    if (applySpawnExhaustion) {
      flags.add("-moved");
      flags.add("-sent boarding party");
      flags.add("-attacked");
      flags.add("-shielded");
    }
    return {
      id: nextId,
      type,
      team,
      x,
      y,
      hp: spec.hp,
      maxHp: spec.hp,
      move: spec.move,
      firepower: spec.firepower,
      range: spec.range,
      scan: spec.scan,
      cost: spec.cost,
      flags
    };
  }

  function generateSectorData(params) {
    const {
      levelId,
      campaignLevels,
      shipSpecs,
      gridSize = 32,
      maxAp = 4,
      rnd
    } = params;
    const R = typeof rnd === "function" ? rnd : Math.random;
    const spec = campaignLevels.find(l => l.id === levelId) || campaignLevels[0];

    const terrain = Array.from({ length: gridSize }, () => Array(gridSize).fill("EMPTY"));
    const exploredCells = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
    const asteroidSeeds = Array.from({ length: gridSize }, (_, x) =>
      Array.from({ length: gridSize }, (__, y) => ((x * 73 + y * 37 + spec.id * 19) % 100) / 100)
    );
    const clusterMap = Array.from({ length: gridSize }, () => Array(gridSize).fill(-1));
    const units = [];
    let nextUnitId = 1;

    const getUnitAt = (gx, gy) => units.find(u => u.hp > 0 && u.x === gx && u.y === gy) || null;
    const spawnUnit = (type, team, x, y, applySpawnExhaustion = false) => {
      const u = createUnitData(shipSpecs, nextUnitId++, type, team, x, y, applySpawnExhaustion);
      units.push(u);
      return u;
    };

    // The player fleet always starts in a tight semicircle formation: the
    // flagship at the lead (apex facing the enemy side, +x) with the escorts
    // filling the arc directly behind it (radius 2). Formation cells are
    // cleared of asteroids. Returns the spawned units, lead first.
    const spawnPlayerFormation = (spawnList) => {
      const flagIdx = spawnList.findIndex(n => shipSpecs[n].flags.includes("!flagship"));
      const leadIdx = flagIdx >= 0 ? flagIdx : 0;
      const lead = { x: 4, y: 15 };
      const cells = [{ type: spawnList[leadIdx], x: lead.x, y: lead.y }];
      const escorts = spawnList.filter((_, i) => i !== leadIdx);
      for (let i = 0; i < escorts.length; i++) {
        const theta = Math.PI / 2 + Math.PI * (i + 0.5) / escorts.length;
        cells.push({
          type: escorts[i],
          x: lead.x + Math.round(2 * Math.cos(theta)),
          y: lead.y + Math.round(2 * Math.sin(theta))
        });
      }
      return cells.map(c => {
        if (terrain[c.x][c.y] === "ASTEROID") terrain[c.x][c.y] = "EMPTY";
        return spawnUnit(c.type, 1, c.x, c.y, false);
      });
    };

    // Asteroid clusters
    const astCount = spec.asteroidClusters.count;
    const seeds = [];
    for (let c = 0; c < astCount; c++) {
      let sx = 15, sy = 15, attempts = 0;
      while (attempts < 80) {
        sx = 8 + Math.floor(R() * 16);
        sy = 3 + Math.floor(R() * 26);
        if (seeds.every(s => Math.hypot(s.x - sx, s.y - sy) >= 5.5)) break;
        attempts++;
      }
      seeds.push({ x: sx, y: sy });
      terrain[sx][sy] = "ASTEROID";
      clusterMap[sx][sy] = c;
      const targetSize = spec.asteroidClusters.clusterSizeMin + Math.floor(R() * (spec.asteroidClusters.clusterSizeMax - spec.asteroidClusters.clusterSizeMin + 1));
      const frontier = [{ x: sx, y: sy }];
      let placed = 1, walkTries = 0;
      while (placed < targetSize && frontier.length > 0 && walkTries < 60) {
        walkTries++;
        const base = frontier[Math.floor(R() * frontier.length)];
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const d = dirs[Math.floor(R() * 4)];
        const nx = base.x + d[0], ny = base.y + d[1];
        if (nx < 8 || nx > 23 || ny < 2 || ny > 29) continue;
        if (terrain[nx][ny] === "ASTEROID") continue;
        let tooClose = false;
        for (let ox = -2; ox <= 2; ox++) {
          for (let oy = -2; oy <= 2; oy++) {
            const cx = nx + ox, cy = ny + oy;
            if (inBounds(gridSize, cx, cy) && clusterMap[cx][cy] !== -1 && clusterMap[cx][cy] !== c) {
              tooClose = true;
            }
          }
        }
        if (tooClose) continue;
        terrain[nx][ny] = "ASTEROID";
        clusterMap[nx][ny] = c;
        frontier.push({ x: nx, y: ny });
        placed++;
      }
    }

    // Nebula patches
    const nebCount = spec.nebulaPatches.count;
    for (let n = 0; n < nebCount; n++) {
      let nx = 8 + Math.floor(R() * 16), ny = 3 + Math.floor(R() * 26), tries = 0;
      while (tries < 50 && terrain[nx][ny] !== "EMPTY") {
        nx = 8 + Math.floor(R() * 16);
        ny = 3 + Math.floor(R() * 26);
        tries++;
      }
      if (terrain[nx][ny] !== "EMPTY") continue;
      terrain[nx][ny] = "NEBULA";
      const targetSize = spec.nebulaPatches.patchSizeMin + Math.floor(R() * (spec.nebulaPatches.patchSizeMax - spec.nebulaPatches.patchSizeMin + 1));
      const frontier = [{ x: nx, y: ny }];
      let placed = 1, walkTries = 0;
      while (placed < targetSize && frontier.length > 0 && walkTries < 60) {
        walkTries++;
        const base = frontier[Math.floor(R() * frontier.length)];
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const d = dirs[Math.floor(R() * 4)];
        const px = base.x + d[0], py = base.y + d[1];
        if (px < 6 || px > 25 || py < 2 || py > 29) continue;
        if (terrain[px][py] !== "EMPTY") continue;
        terrain[px][py] = "NEBULA";
        frontier.push({ x: px, y: py });
        placed++;
      }
    }

    let selectedUnit = null;
    let viewport = { viewSpan: 32, viewX: 0, viewY: 0 };

    if (spec.id === 101) {
      // Fog (nebula), asteroids and enemies are all randomly positioned by
      // the generators above and the placement loops below — nothing here is
      // pinned to fixed cells.
      const playerUnits = spawnPlayerFormation(spec.t1SpawnList);

      // The enemy arrangement is randomly generated: the level's fixed
      // composition (t2SpawnList) is scattered across the right half of the
      // board — flagships held far right — clear of asteroids, of each
      // other, and of any opening strike on the player formation (d >= 3).
      const enemySpots = [];
      const pickEnemySpot = (minX, maxX, minGap) => {
        for (let tries = 0; tries < 120; tries++) {
          const gx = minX + Math.floor(R() * (maxX - minX + 1));
          const gy = 4 + Math.floor(R() * 24);
          if (terrain[gx][gy] === "ASTEROID") continue;
          if (getUnitAt(gx, gy)) continue;
          if (enemySpots.some(s => Math.hypot(s.x - gx, s.y - gy) < minGap)) continue;
          if (units.some(u => u.team === 1 && Math.hypot(u.x - gx, u.y - gy) < 3)) continue;
          return { x: gx, y: gy };
        }
        return null;
      };
      const placeEnemy = (shipType, minX, maxX, minGap) => {
        let spot = pickEnemySpot(minX, maxX, minGap);
        if (!spot) {
          for (let gx = minX; gx <= maxX && !spot; gx++) {
            for (let gy = 4; gy <= 27; gy++) {
              if (terrain[gx][gy] === "ASTEROID" || getUnitAt(gx, gy)) continue;
              spot = { x: gx, y: gy };
              break;
            }
          }
        }
        if (!spot) return;
        enemySpots.push(spot);
        spawnUnit(shipType, 2, spot.x, spot.y, false);
      };
      const t2List = spec.t2SpawnList || [];
      t2List.filter(n => !shipSpecs[n].flags.includes("!flagship"))
        .forEach(n => placeEnemy(n, 9, 27, 2));
      t2List.filter(n => shipSpecs[n].flags.includes("!flagship"))
        .forEach(n => placeEnemy(n, 23, 28, 4.5));

      selectedUnit = playerUnits.find(u => u.type === "Probe") || playerUnits[0];
      viewport = { viewSpan: 16, viewX: 0, viewY: 7 };
    } else {
      // Team 1 — the standard semicircle formation (flagship at the lead).
      const t1Units = spawnPlayerFormation(spec.t1SpawnList);
      const t1Capitals = t1Units.filter(u => u.flags.has("#capital ship"));
      if (t1Capitals.length > 0) selectedUnit = t1Capitals[0];

      // Team 2
      const t2FullList = [...spec.t2SpawnList];
      let remBudget = spec.t2CompositionBudget || 0;
      const pool = spec.t2ArchetypePool || [];
      let safety = 0;
      while (remBudget >= 5 && pool.length > 0 && safety < 50) {
        safety++;
        const affordable = pool.filter(name => shipSpecs[name].cost <= remBudget && shipSpecs[name].cost > 0);
        if (affordable.length === 0) break;
        const pickName = affordable[Math.floor(R() * affordable.length)];
        t2FullList.push(pickName);
        remBudget -= shipSpecs[pickName].cost;
      }
      const t2Flagships = t2FullList.filter(n => n === "Flagship Battlecruiser");
      const t2Escorts = t2FullList.filter(n => n !== "Flagship Battlecruiser");
      const placedT2Flagships = [];
      t2Flagships.forEach((shipType, idx) => {
        let fx = 26, fy = 9 + idx * 6, tries = 0;
        while (tries < 80) {
          fx = 25 + Math.floor(R() * 3);
          fy = 7 + Math.floor(R() * 18);
          const spaced = placedT2Flagships.every(f => Math.hypot(f.x - fx, f.y - fy) >= 4.5);
          if (spaced && terrain[fx][fy] !== "ASTEROID" && !getUnitAt(fx, fy)) break;
          tries++;
        }
        terrain[fx][fy] = "EMPTY";
        const u = spawnUnit(shipType, 2, fx, fy, false);
        placedT2Flagships.push(u);
      });
      t2Escorts.forEach(shipType => {
        const candidates = [];
        for (let gx = 22; gx <= 28; gx++) {
          for (let gy = 6; gy <= 25; gy++) {
            if (terrain[gx][gy] === "ASTEROID") continue;
            if (getUnitAt(gx, gy)) continue;
            candidates.push({ x: gx, y: gy });
          }
        }
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(R() * candidates.length)];
          spawnUnit(shipType, 2, pick.x, pick.y, false);
        }
      });

      const playerFlag = units.find(u => u.team === 1 && u.flags.has("!flagship"));
      if (playerFlag) {
        viewport = {
          viewSpan: 16,
          viewX: Math.round(playerFlag.x - 16 / 2),
          viewY: Math.round(playerFlag.y - 16 / 2)
        };
      }
    }

    return {
      spec,
      patch: {
        levelId: spec.id,
        ap: maxAp,
        credits: { 1: spec.t1StartingCredits, 2: spec.t2StartingCredits },
        income: { 1: spec.t1Income, 2: spec.t2Income },
        aiDoctrine: spec.aiDoctrine,
        terrain,
        exploredCells,
        asteroidSeeds,
        units,
        nextUnitId,
        visDirty: true
      },
      selectedUnitId: selectedUnit ? selectedUnit.id : null,
      viewport,
      initialIntel: [...(spec.initialIntel || [])]
    };
  }

  return {
    createUnitData,
    generateSectorData
  };
})());
