(() => {
  'use strict';

  const VERSION = '0.3.0';
  const PROFILE_KEY = 'buscawacha-profile-v1';
  const DEV_KEY = 'buscawacha-dev-mode-v1';
  const LONG_PRESS_MS = 430;
  const TRAVERSE_COLS = 11;
  const TRAVERSE_ROWS = 13;
  const TRAVERSE_GENERATION_ATTEMPTS = 260;
  const TRAVERSE_SHAPES = [
    { id: 'cave', name: 'Caverna' },
    { id: 'corridors', name: 'Pasillos' },
    { id: 'chambers', name: 'Salas rotas' }
  ];
  const TRAVERSE_FLOOR_TYPES = {
    safe: { id: 'safe', name: 'Seguro', density: 0.105, pickups: 1, description: 'menos minas · 1 objeto' },
    normal: { id: 'normal', name: 'Normal', density: 0.145, pickups: 1, description: 'riesgo medio · 1 objeto' },
    dangerous: { id: 'dangerous', name: 'Peligroso', density: 0.185, pickups: 2, description: 'más minas · 2 objetos' }
  };
  const FLOOR_TYPES = {
    safe: { id: 'safe', name: 'Piso seguro', rewardChance: 0.10, rewardQuality: 'Baja', densityDelta: -0.035, cellDelta: 5, mineDamage: 1 },
    normal: { id: 'normal', name: 'Piso normal', rewardChance: 0.40, rewardQuality: 'Normal', densityDelta: 0, cellDelta: 0, mineDamage: 1 },
    dangerous: { id: 'dangerous', name: 'Piso peligroso', rewardChance: 1.00, rewardQuality: 'Normal', densityDelta: 0.035, cellDelta: -2, mineDamage: 1 },
    heavy: { id: 'heavy', name: 'Piso pesado', rewardChance: 0.65, rewardQuality: 'Alta', densityDelta: 0.012, cellDelta: 0, mineDamage: 2 }
  };
  const SHAPE_UNLOCKS = [
    { id: 'room', name: 'Sala', at: 0 },
    { id: 'cross', name: 'Cruz', at: 0 },
    { id: 'corridor', name: 'Pasillo', at: 3 },
    { id: 'ring', name: 'Anillo', at: 8 },
    { id: 'cave', name: 'Caverna', at: 15 }
  ];

  const $ = (s) => document.querySelector(s);
  const screens = ['#homeScreen', '#traverseScreen', '#gameScreen', '#choiceScreen', '#deathScreen'];
  const profile = loadProfile();

  let run = null;
  let board = null;
  let traverse = null;
  let traversePressTimer = null;
  let traversePressKey = null;
  let traverseLongPressTriggered = false;
  let pendingChoices = [];
  let latestVersion = VERSION;
  let longPressTimer = null;
  let longPressTriggered = false;
  let longPressCellKey = null;
  let longPressPointerId = null;
  let clueSelection = null;
  let clueDrag = null;
  let devMode = false;
  let devPeek = false;

  function loadProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      return {
        bestFloor: Math.max(0, Number(p?.bestFloor) || 0),
        totalFloors: Math.max(0, Number(p?.totalFloors) || 0),
        runs: Math.max(0, Number(p?.runs) || 0),
        echoes: Math.max(0, Number(p?.echoes ?? p?.totalFloors) || 0),
        deaths: Math.max(0, Number(p?.deaths) || 0)
      };
    } catch {
      return { bestFloor: 0, totalFloors: 0, runs: 0, echoes: 0, deaths: 0 };
    }
  }

  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch {}
  }

  function unlockedShapes(echoes = profile.echoes) {
    return SHAPE_UNLOCKS.filter(s => echoes >= s.at);
  }

  function showScreen(selector) {
    screens.forEach(s => $(s).classList.toggle('hidden', s !== selector));
    updateDevStatus();
    window.scrollTo(0, 0);
  }

  function loadDevMode() {
    try { return localStorage.getItem(DEV_KEY) === '1'; } catch { return false; }
  }

  function setDevMode(enabled) {
    devMode = Boolean(enabled);
    try { localStorage.setItem(DEV_KEY, devMode ? '1' : '0'); } catch {}
    const panel = $('#devPanel');
    const button = $('#devToggleButton');
    if (panel) panel.classList.toggle('hidden', !devMode);
    if (button) {
      button.textContent = devMode ? 'JUGADOR' : 'DEV';
      button.setAttribute('aria-expanded', devMode ? 'true' : 'false');
      button.classList.toggle('active', devMode);
    }
    updateDevStatus();
  }

  function updateDevStatus(message = '') {
    const status = $('#devStatus');
    if (!status) return;
    if (message) {
      status.textContent = message;
      return;
    }
    status.textContent = run
      ? `Piso ${run.floor} · ? ${run.clues} · escudos ${run.shields}/${run.shieldCapacity}`
      : 'Sin run activa';
  }

  function handleDevAction(action) {
    if (!devMode) return;
    if (!run) {
      updateDevStatus('Iniciá una run primero');
      return;
    }

    if (action === 'clue') {
      run.clues += 1;
      updateClueUI();
      updateDevStatus('+1 objeto ?');
      return;
    }

    if (action === 'shield') {
      if (run.shields >= run.shieldCapacity) {
        updateDevStatus('Escudos al máximo');
        return;
      }
      run.shields += 1;
      updateShieldLabel();
      updateDevStatus('+1 escudo');
      return;
    }

    if (action === 'capacity') {
      run.shieldCapacity += 1;
      updateShieldLabel();
      updateDevStatus('+1 espacio');
      return;
    }

    if (action === 'remove-shield') {
      run.shields = Math.max(0, run.shields - 1);
      updateShieldLabel();
      updateDevStatus('−1 escudo');
      return;
    }

    if (action === 'complete') {
      if (!board || board.ended) {
        updateDevStatus('No hay piso activo');
        return;
      }
      completeFloor();
      updateDevStatus('Piso completado');
      return;
    }

    if (action === 'peek') {
      if (!board || !board.minesPlaced) {
        updateDevStatus('Tocá una casilla primero');
        return;
      }
      devPeek = !devPeek;
      document.querySelectorAll('.cell').forEach(button => {
        const cell = board.cells.find(c => c.key === button.dataset.key);
        button.classList.toggle('dev-mine', Boolean(devPeek && cell?.active && cell.mine && !cell.revealed));
      });
      updateDevStatus(devPeek ? 'Minas visibles' : 'Minas ocultas');
    }
  }

  function renderHome() {
    const unlocked = unlockedShapes().length;
    $('#homeStats').innerHTML = [
      ['Mejor piso', profile.bestFloor || '—'],
      ['Ecos', profile.echoes],
      ['Formas', `${unlocked}/${SHAPE_UNLOCKS.length}`]
    ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }


  function startTraverse() {
    run = null;
    board = null;
    traverse = createTraverseState({
      floor: 1,
      shields: 0,
      clues: 0,
      rescues: 0
    }, 'normal');
    showScreen('#traverseScreen');
    renderTraverse();
  }

  function createTraverseState(meta, floorTypeId) {
    const rows = TRAVERSE_ROWS;
    const cols = TRAVERSE_COLS;
    const floor = Math.max(1, Number(meta.floor) || 1);
    const floorType = TRAVERSE_FLOOR_TYPES[floorTypeId] || TRAVERSE_FLOOR_TYPES.normal;
    const shape = TRAVERSE_SHAPES[Math.floor(Math.random() * TRAVERSE_SHAPES.length)];
    const start = { r: rows - 1, c: Math.floor(cols / 2) };
    start.key = keyOf(start.r, start.c);
    const doors = makeTraverseDoors(cols, floor + 1);
    const generated = generateTraverseDungeon(rows, cols, start, doors, shape.id, floorType, floor);

    const state = {
      rows,
      cols,
      floor,
      floorTypeId: floorType.id,
      floorTypeName: floorType.name,
      shapeId: shape.id,
      shapeName: shape.name,
      start,
      doors,
      active: generated.active,
      mines: generated.mines,
      numbers: generated.numbers,
      mineCount: generated.mines.size,
      pickups: generated.pickups,
      revealed: new Set(),
      flags: new Set(),
      knownSafe: new Set(),
      hitMines: new Set(),
      shields: Math.max(0, Number(meta.shields) || 0),
      clues: Math.max(0, Number(meta.clues) || 0),
      rescues: Math.max(0, Number(meta.rescues) || 0),
      clueArmed: false,
      ended: false,
      revealMines: false,
      status: 'Abrí camino hasta una puerta.',
      detector: ''
    };

    revealTraverseCascade(state, start.key, false);
    state.detector = 'Detector 4: ' + traverseOrthogonalMineCount(state, start.r, start.c);
    return state;
  }

  function makeTraverseDoors(cols, nextFloor) {
    const positions = [
      Math.max(1, Math.floor(cols * 0.23)),
      Math.min(cols - 2, Math.floor(cols * 0.77))
    ];
    const types = chooseTraverseDoorTypes(nextFloor);
    return positions.map((c, index) => ({
      r: 0,
      c,
      key: keyOf(0, c),
      label: index === 0 ? 'A' : 'B',
      typeId: types[index],
      type: TRAVERSE_FLOOR_TYPES[types[index]]
    }));
  }

  function chooseTraverseDoorTypes(nextFloor) {
    const weighted = nextFloor < 3
      ? ['safe', 'safe', 'normal', 'normal', 'dangerous']
      : ['safe', 'normal', 'normal', 'dangerous', 'dangerous'];
    const first = weighted[Math.floor(Math.random() * weighted.length)];
    const alternatives = weighted.filter(id => id !== first);
    const second = alternatives[Math.floor(Math.random() * alternatives.length)] || (first === 'safe' ? 'dangerous' : 'safe');
    return [first, second];
  }

  function generateTraverseDungeon(rows, cols, start, doors, shapeId, floorType, floor) {
    for (let geometryAttempt = 0; geometryAttempt < 14; geometryAttempt++) {
      const active = buildTraverseShape(rows, cols, start, doors, shapeId);
      const pickupSpecs = makeTraversePickupSpecs(floorType, floor);
      const pickupKeys = chooseTraversePickupKeys(active, start, doors, pickupSpecs.length);
      if (pickupKeys.length < pickupSpecs.length) continue;

      const pickups = new Map();
      pickupSpecs.forEach((spec, index) => {
        pickups.set(pickupKeys[index], {
          type: spec.type,
          icon: spec.icon,
          label: spec.label,
          collected: false
        });
      });

      const reserved = new Set([start.key]);
      doors.forEach(door => reserved.add(door.key));
      pickups.forEach((_, key) => reserved.add(key));
      neighbors8(start.r, start.c).forEach(([r, c]) => {
        const key = keyOf(r, c);
        if (active.has(key)) reserved.add(key);
      });

      const routeTargets = [...doors.map(door => door.key), ...pickups.keys()];
      routeTargets.forEach(target => {
        traverseShortestPath(active, start.key, target).forEach(key => reserved.add(key));
      });

      const candidates = [...active].filter(key => !reserved.has(key));
      const density = clamp(floorType.density + Math.min(0.045, (floor - 1) * 0.004), 0.09, 0.23);
      const desiredMineCount = Math.max(4, Math.min(candidates.length, Math.round(active.size * density)));

      for (let attempt = 0; attempt < TRAVERSE_GENERATION_ATTEMPTS; attempt++) {
        const mines = new Set(shuffle(candidates).slice(0, desiredMineCount));
        const numbers = computeTraverseNumbers(active, mines);
        if (isTraverseLayoutSolvable(active, mines, numbers, start, doors, pickups)) {
          return { active, mines, numbers, pickups };
        }
      }

      const fallback = makeTraverseFallback(active, candidates, desiredMineCount, start, doors, pickups);
      if (fallback) return { active, mines: fallback.mines, numbers: fallback.numbers, pickups };
    }

    throw new Error('No se pudo generar una Travesía jugable.');
  }

  function makeTraversePickupSpecs(floorType, floor) {
    const specs = [];
    const count = Math.max(1, floorType.pickups || 1);
    for (let i = 0; i < count; i++) {
      if (floor === 1 && i === 0) {
        specs.push({ type: 'shield', icon: 'S', label: 'Escudo' });
      } else if ((floor + i) % 2 === 0) {
        specs.push({ type: 'clue', icon: '?', label: 'Detector' });
      } else {
        specs.push({ type: 'shield', icon: 'S', label: 'Escudo' });
      }
    }
    if (floor >= 2 && Math.random() < 0.55) {
      specs.push({ type: 'rescue', icon: 'R', label: 'Rescate' });
    }
    return specs;
  }

  function buildTraverseShape(rows, cols, start, doors, shapeId) {
    const active = new Set([start.key]);
    const protectedCells = new Set([start.key]);

    doors.forEach(door => {
      carveTraverseRoute(active, protectedCells, start, door, rows, cols, shapeId);
      active.add(door.key);
      protectedCells.add(door.key);
    });

    const total = rows * cols;
    const targetRatio = shapeId === 'corridors' ? 0.46 : shapeId === 'chambers' ? 0.61 : 0.67;
    const target = Math.max(active.size, Math.round(total * targetRatio));

    if (shapeId === 'chambers') {
      const seeds = shuffle([...active]).slice(0, 4);
      seeds.forEach(key => {
        const [sr, sc] = fromKey(key);
        const height = 2 + Math.floor(Math.random() * 2);
        const width = 2 + Math.floor(Math.random() * 3);
        for (let r = sr - 1; r < sr - 1 + height; r++) {
          for (let c = sc - 1; c < sc - 1 + width; c++) {
            if (r > 0 && r < rows - 1 && c >= 0 && c < cols) active.add(keyOf(r, c));
          }
        }
      });
    }

    let guard = 0;
    while (active.size < target && guard < total * 30) {
      guard += 1;
      const existing = [...active];
      const seed = existing[Math.floor(Math.random() * existing.length)];
      const [r, c] = fromKey(seed);
      const options = neighbors4(r, c).filter(([nr, nc]) => {
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) return false;
        if (nr === 0 && !doors.some(door => door.r === nr && door.c === nc)) return false;
        if (nr === rows - 1 && !(nr === start.r && nc === start.c)) return false;
        return true;
      });
      if (!options.length) continue;
      const next = options[Math.floor(Math.random() * options.length)];
      active.add(keyOf(next[0], next[1]));
      if (shapeId === 'cave' && Math.random() < 0.28) {
        neighbors4(next[0], next[1]).forEach(([nr, nc]) => {
          if (nr > 0 && nr < rows - 1 && nc >= 0 && nc < cols && Math.random() < 0.32) {
            active.add(keyOf(nr, nc));
          }
        });
      }
    }

    doors.forEach(door => active.add(door.key));
    active.add(start.key);
    return active;
  }

  function carveTraverseRoute(active, protectedCells, start, door, rows, cols, shapeId) {
    let r = start.r;
    let c = start.c;
    let guard = 0;

    while ((r !== door.r || c !== door.c) && guard < rows * cols * 3) {
      guard += 1;
      active.add(keyOf(r, c));
      protectedCells.add(keyOf(r, c));

      const verticalDistance = r - door.r;
      const horizontalDistance = door.c - c;
      if (horizontalDistance !== 0 && (verticalDistance <= Math.abs(horizontalDistance) || Math.random() < 0.42)) {
        c += Math.sign(horizontalDistance);
      } else if (r > door.r) {
        r -= 1;
      }

      c = clamp(c, 0, cols - 1);
      r = clamp(r, 0, rows - 1);
      active.add(keyOf(r, c));
      protectedCells.add(keyOf(r, c));

      if (shapeId !== 'corridors' && r > 0 && r < rows - 1 && Math.random() < 0.36) {
        const side = Math.random() < 0.5 ? -1 : 1;
        if (c + side >= 0 && c + side < cols) active.add(keyOf(r, c + side));
      }
    }
  }

  function chooseTraversePickupKeys(active, start, doors, count) {
    if (count <= 0) return [];
    const distStart = traverseGraphDistances(active, start.key);
    const doorDistances = doors.map(door => traverseGraphDistances(active, door.key));
    const directDoorDistance = Math.min(...doors.map(door => distStart.get(door.key) ?? 999));
    const blocked = new Set([start.key, ...doors.map(door => door.key)]);

    const scored = [...active]
      .filter(key => {
        if (blocked.has(key)) return false;
        const [r] = fromKey(key);
        const distance = distStart.get(key) ?? 0;
        return r > 1 && r < TRAVERSE_ROWS - 1 && distance >= 4;
      })
      .map(key => {
        const fromStart = distStart.get(key) ?? 999;
        const toDoor = Math.min(...doorDistances.map(map => map.get(key) ?? 999));
        const detour = fromStart + toDoor - directDoorDistance;
        return { key, score: detour * 10 + fromStart + Math.random() * 4 };
      })
      .sort((a, b) => b.score - a.score);

    const chosen = [];
    for (const candidate of scored) {
      if (chosen.length >= count) break;
      const [r, c] = fromKey(candidate.key);
      const tooClose = chosen.some(existing => {
        const [er, ec] = fromKey(existing);
        return Math.abs(r - er) + Math.abs(c - ec) < 4;
      });
      if (!tooClose) chosen.push(candidate.key);
    }

    if (chosen.length < count) {
      for (const candidate of scored) {
        if (chosen.length >= count) break;
        if (!chosen.includes(candidate.key)) chosen.push(candidate.key);
      }
    }
    return chosen;
  }

  function traverseGraphDistances(active, sourceKey) {
    const distances = new Map([[sourceKey, 0]]);
    const queue = [sourceKey];
    while (queue.length) {
      const current = queue.shift();
      const [r, c] = fromKey(current);
      const nextDistance = distances.get(current) + 1;
      neighbors4(r, c).forEach(([nr, nc]) => {
        const key = keyOf(nr, nc);
        if (!active.has(key) || distances.has(key)) return;
        distances.set(key, nextDistance);
        queue.push(key);
      });
    }
    return distances;
  }

  function computeTraverseNumbers(active, mines) {
    const numbers = new Map();
    active.forEach(key => {
      if (mines.has(key)) return;
      const [r, c] = fromKey(key);
      const number = neighbors8(r, c).reduce((total, [nr, nc]) => total + Number(mines.has(keyOf(nr, nc))), 0);
      numbers.set(key, number);
    });
    return numbers;
  }

  function isTraverseLayoutSolvable(active, mines, numbers, start, doors, pickups) {
    const revealed = new Set();
    const flagged = new Set();
    const knownSafe = new Set([start.key, ...pickups.keys()]);
    const specialSafe = new Set([...doors.map(door => door.key), ...pickups.keys()]);

    const revealSafe = key => {
      if (!active.has(key) || mines.has(key) || revealed.has(key)) return false;
      const queue = [key];
      let changed = false;
      while (queue.length) {
        const current = queue.shift();
        if (revealed.has(current) || mines.has(current)) continue;
        revealed.add(current);
        changed = true;
        const number = numbers.get(current) ?? 0;
        if (number !== 0) continue;
        const [r, c] = fromKey(current);
        neighbors8(r, c).forEach(([nr, nc]) => {
          const next = keyOf(nr, nc);
          if (!active.has(next) || mines.has(next) || revealed.has(next)) return;
          if (specialSafe.has(next) && next !== key) return;
          queue.push(next);
        });
      }
      return changed;
    };

    revealSafe(start.key);

    for (let guard = 0; guard < active.size * 12; guard++) {
      let changed = false;

      [...knownSafe].forEach(key => {
        if (!revealed.has(key) && isTraverseFrontierForSet(revealed, key)) {
          if (revealSafe(key)) changed = true;
        }
      });

      const deducedSafe = new Set();
      revealed.forEach(key => {
        const number = numbers.get(key);
        if (number === undefined) return;
        const [r, c] = fromKey(key);
        const normalUnknown = [];
        let flaggedAround = 0;

        neighbors8(r, c).forEach(([nr, nc]) => {
          const next = keyOf(nr, nc);
          if (!active.has(next) || specialSafe.has(next) || revealed.has(next)) return;
          if (flagged.has(next)) flaggedAround += 1;
          else normalUnknown.push(next);
        });

        const remaining = number - flaggedAround;
        if (remaining === 0) {
          normalUnknown.forEach(next => deducedSafe.add(next));
        } else if (normalUnknown.length > 0 && remaining === normalUnknown.length) {
          normalUnknown.forEach(next => {
            if (!flagged.has(next)) {
              flagged.add(next);
              changed = true;
            }
          });
        }
      });

      deducedSafe.forEach(key => knownSafe.add(key));
      [...knownSafe].forEach(key => {
        if (!revealed.has(key) && isTraverseFrontierForSet(revealed, key)) {
          if (revealSafe(key)) changed = true;
        }
      });

      const allDoorsReachable = doors.every(door => isTraverseFrontierForSet(revealed, door.key));
      const allPickupsReachable = [...pickups.keys()].every(key => revealed.has(key));
      if (allDoorsReachable && allPickupsReachable) return true;
      if (!changed) break;
    }

    return false;
  }

  function isTraverseFrontierForSet(revealed, key) {
    const [r, c] = fromKey(key);
    return neighbors4(r, c).some(([nr, nc]) => revealed.has(keyOf(nr, nc)));
  }

  function makeTraverseFallback(active, candidates, desiredMineCount, start, doors, pickups) {
    const targets = [...doors.map(door => door.key), ...pickups.keys()];
    const paths = targets
      .map(target => traverseShortestPath(active, start.key, target))
      .filter(path => path.length > 0);
    const guaranteed = new Set([start.key]);
    paths.forEach(path => path.forEach(key => guaranteed.add(key)));

    const haloStrides = [4, 3, 2];
    for (const stride of haloStrides) {
      const protectedCells = new Set(guaranteed);
      paths.forEach(path => {
        path.forEach((key, index) => {
          if (index % stride !== 0) return;
          const [r, c] = fromKey(key);
          neighbors8(r, c).forEach(([nr, nc]) => {
            const next = keyOf(nr, nc);
            if (active.has(next)) protectedCells.add(next);
          });
        });
      });

      const pool = candidates.filter(key => !protectedCells.has(key));
      if (pool.length < desiredMineCount) continue;

      for (let attempt = 0; attempt < 90; attempt++) {
        const mines = new Set(shuffle(pool).slice(0, desiredMineCount));
        const numbers = computeTraverseNumbers(active, mines);
        if (isTraverseLayoutSolvable(active, mines, numbers, start, doors, pickups)) {
          return { mines, numbers };
        }
      }
    }

    const safeHalo = new Set(guaranteed);
    guaranteed.forEach(key => {
      const [r, c] = fromKey(key);
      neighbors8(r, c).forEach(([nr, nc]) => {
        const next = keyOf(nr, nc);
        if (active.has(next)) safeHalo.add(next);
      });
    });

    const pool = candidates.filter(key => !safeHalo.has(key));
    const minimumAcceptable = Math.max(4, Math.ceil(desiredMineCount * 0.8));
    if (pool.length < minimumAcceptable) return null;
    const count = Math.min(desiredMineCount, pool.length);
    const mines = new Set(shuffle(pool).slice(0, count));
    const numbers = computeTraverseNumbers(active, mines);
    return { mines, numbers };
  }

  function traverseShortestPath(active, sourceKey, targetKey) {
    const queue = [sourceKey];
    const previous = new Map([[sourceKey, null]]);
    while (queue.length) {
      const current = queue.shift();
      if (current === targetKey) break;
      const [r, c] = fromKey(current);
      neighbors4(r, c).forEach(([nr, nc]) => {
        const next = keyOf(nr, nc);
        if (!active.has(next) || previous.has(next)) return;
        previous.set(next, current);
        queue.push(next);
      });
    }
    if (!previous.has(targetKey)) return [];
    const path = [];
    let current = targetKey;
    while (current) {
      path.push(current);
      current = previous.get(current);
    }
    return path.reverse();
  }

  function traverseNumberAt(state, r, c) {
    return state.numbers.get(keyOf(r, c)) ?? 0;
  }

  function traverseOrthogonalMineCount(state, r, c) {
    return neighbors4(r, c).reduce((total, [nr, nc]) => total + Number(state.mines.has(keyOf(nr, nc))), 0);
  }

  function isTraverseDoorKey(key) {
    return Boolean(traverse?.doors.some(door => door.key === key));
  }

  function isTraverseFrontier(key) {
    if (!traverse || traverse.revealed.has(key)) return false;
    return isTraverseFrontierForSet(traverse.revealed, key);
  }

  function traversePickupAt(key) {
    return traverse?.pickups.get(key) || null;
  }

  function renderTraverse() {
    if (!traverse) return;
    const root = $('#traverseBoard');
    root.style.setProperty('--cols', traverse.cols);
    root.style.setProperty('--rows', traverse.rows);
    root.innerHTML = '';

    for (let r = 0; r < traverse.rows; r++) {
      for (let c = 0; c < traverse.cols; c++) {
        const key = keyOf(r, c);
        const active = traverse.active.has(key);
        const door = traverse.doors.find(item => item.key === key);
        const pickup = traverse.pickups.get(key);
        const revealed = traverse.revealed.has(key);
        const mine = traverse.mines.has(key);
        const hitMine = traverse.hitMines.has(key);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'traverse-cell';
        btn.dataset.key = key;

        if (!active) {
          btn.classList.add('inactive');
          btn.tabIndex = -1;
          btn.setAttribute('aria-hidden', 'true');
          root.appendChild(btn);
          continue;
        }

        if (door) {
          btn.classList.add('door');
          if (isTraverseFrontier(door.key)) btn.classList.add('available');
          btn.textContent = door.label;
          btn.setAttribute('aria-label', 'Puerta ' + door.label + ': ' + door.type.name);
          btn.addEventListener('click', () => enterTraverseDoor(door));
          root.appendChild(btn);
          continue;
        }

        if (isTraverseFrontier(key) && !revealed) btn.classList.add('frontier');

        if (traverse.revealMines && mine) {
          btn.classList.add('mine');
          btn.textContent = '✹';
        } else if (hitMine) {
          btn.classList.add('mine', 'spent');
          btn.textContent = '✹';
        } else if (revealed) {
          btn.classList.add('revealed');
          const number = traverseNumberAt(traverse, r, c);
          if (number > 0) {
            btn.textContent = number;
            btn.classList.add('n' + number);
          }
        } else if (pickup && !pickup.collected) {
          btn.classList.add('pickup');
          btn.textContent = pickup.icon;
          btn.setAttribute('aria-label', pickup.label + ' sin recoger');
        } else if (traverse.flags.has(key)) {
          btn.classList.add('flagged');
          btn.textContent = '⚑';
        } else if (traverse.knownSafe.has(key)) {
          btn.classList.add('known-safe');
          btn.textContent = '·';
        }

        btn.addEventListener('click', () => {
          if (traverseLongPressTriggered) {
            traverseLongPressTriggered = false;
            return;
          }
          handleTraverseCell(r, c);
        });
        btn.addEventListener('contextmenu', event => {
          event.preventDefault();
          toggleTraverseFlag(key);
        });
        btn.addEventListener('pointerdown', event => beginTraverseLongPress(event, key));
        btn.addEventListener('pointerup', cancelTraverseLongPress);
        btn.addEventListener('pointercancel', cancelTraverseLongPress);
        btn.addEventListener('pointerleave', cancelTraverseLongPress);
        root.appendChild(btn);
      }
    }

    $('#traverseFloorLabel').textContent = traverse.floor;
    $('#traverseShapeLabel').textContent = traverse.shapeName;
    $('#traverseMineLabel').textContent = traverse.mineCount;
    $('#traverseShieldLabel').textContent = traverse.shields;
    $('#traverseRescueLabel').textContent = traverse.rescues;
    $('#traverseStatus').textContent = traverse.status;
    $('#traverseDetector').textContent = traverse.detector || 'Detector 4: —';

    const legend = $('#traverseDoorLegend');
    legend.innerHTML = '';
    traverse.doors.forEach(door => {
      const item = document.createElement('div');
      item.className = 'traverse-door-info';
      item.innerHTML = '<strong>' + door.label + ' · ' + door.type.name + '</strong><span>' + door.type.description + '</span>';
      legend.appendChild(item);
    });

    const clueButton = $('#traverseClueButton');
    const clueCount = $('#traverseClueCount');
    clueCount.textContent = traverse.clues;
    clueButton.classList.toggle('hidden', traverse.clues <= 0);
    clueButton.classList.toggle('active', traverse.clueArmed);
    clueButton.disabled = traverse.ended || traverse.clues <= 0;
  }

  function handleTraverseCell(r, c) {
    if (!traverse || traverse.ended) return;
    const key = keyOf(r, c);
    if (!traverse.active.has(key) || isTraverseDoorKey(key) || traverse.revealed.has(key)) return;

    if (traverse.clueArmed) {
      useTraverseClue(key);
      return;
    }

    if (traverse.flags.has(key)) return;
    if (!isTraverseFrontier(key)) {
      traverse.status = 'Sólo podés abrir una casilla conectada al territorio revelado.';
      renderTraverse();
      return;
    }

    if (traverse.mines.has(key)) {
      if (traverse.shields > 0) {
        traverse.shields -= 1;
        traverse.hitMines.add(key);
        traverse.flags.delete(key);
        traverse.status = 'Escudo consumido. Esa casilla queda bloqueada.';
        traverse.detector = 'Detector 4: —';
        if ('vibrate' in navigator) { try { navigator.vibrate([35, 45, 35]); } catch {} }
      } else {
        traverse.ended = true;
        traverse.revealMines = true;
        traverse.status = 'Run terminada: pisaste una mina.';
        traverse.detector = 'Detector 4: —';
      }
      renderTraverse();
      return;
    }

    const beforeShield = traverse.shields;
    const beforeClues = traverse.clues;
    const beforeRescues = traverse.rescues;
    revealTraverseCascade(traverse, key, true);
    traverse.detector = 'Detector 4: ' + traverseOrthogonalMineCount(traverse, r, c);

    if (traverse.shields > beforeShield) {
      traverse.status = 'Escudo recogido. Podés seguir explorando.';
    } else if (traverse.clues > beforeClues) {
      traverse.status = 'Detector ? recogido.';
    } else if (traverse.rescues > beforeRescues) {
      traverse.status = 'Rescate completado.';
    } else {
      traverse.status = 'Seguí abriendo frontera o entrá por una puerta disponible.';
    }

    renderTraverse();
  }

  function revealTraverseCascade(state, startKey, collectPickups) {
    if (!state.active.has(startKey) || state.mines.has(startKey)) return;
    const queue = [startKey];
    const queued = new Set([startKey]);

    while (queue.length) {
      const key = queue.shift();
      if (state.revealed.has(key) || state.mines.has(key)) continue;
      if (state.doors.some(door => door.key === key)) continue;

      state.revealed.add(key);
      state.flags.delete(key);
      state.knownSafe.delete(key);

      if (collectPickups) collectTraversePickup(state, key);

      const number = state.numbers.get(key) ?? 0;
      if (number !== 0) continue;

      const [r, c] = fromKey(key);
      neighbors8(r, c).forEach(([nr, nc]) => {
        const next = keyOf(nr, nc);
        if (!state.active.has(next) || state.mines.has(next) || state.revealed.has(next) || queued.has(next)) return;
        if (state.doors.some(door => door.key === next)) return;
        const pickup = state.pickups.get(next);
        if (pickup && !pickup.collected) return;
        queued.add(next);
        queue.push(next);
      });
    }
  }

  function collectTraversePickup(state, key) {
    const pickup = state.pickups.get(key);
    if (!pickup || pickup.collected) return;
    pickup.collected = true;

    if (pickup.type === 'shield') {
      state.shields += 1;
    } else if (pickup.type === 'clue') {
      state.clues += 1;
    } else if (pickup.type === 'rescue') {
      state.rescues += 1;
    }
  }

  function enterTraverseDoor(door) {
    if (!traverse || traverse.ended) return;
    if (!isTraverseFrontier(door.key)) {
      traverse.status = 'Primero abrí un camino hasta esa puerta.';
      renderTraverse();
      return;
    }

    const meta = {
      floor: traverse.floor + 1,
      shields: traverse.shields,
      clues: traverse.clues,
      rescues: traverse.rescues
    };
    traverse = createTraverseState(meta, door.typeId);
    renderTraverse();
  }

  function toggleTraverseFlag(key) {
    if (!traverse || traverse.ended || !traverse.active.has(key) || traverse.revealed.has(key) || isTraverseDoorKey(key)) return;
    const pickup = traversePickupAt(key);
    if (pickup && !pickup.collected) return;
    if (traverse.knownSafe.has(key)) return;

    if (traverse.flags.has(key)) traverse.flags.delete(key);
    else traverse.flags.add(key);
    renderTraverse();
  }

  function beginTraverseLongPress(event, key) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    cancelTraverseLongPress();
    traverseLongPressTriggered = false;
    traversePressKey = key;
    const btn = $('.traverse-cell[data-key="' + key + '"]');
    if (btn) btn.classList.add('hold-pending');

    traversePressTimer = setTimeout(() => {
      traversePressTimer = null;
      traverseLongPressTriggered = true;
      const heldKey = traversePressKey;
      traversePressKey = null;
      toggleTraverseFlag(heldKey);
      if ('vibrate' in navigator) { try { navigator.vibrate(25); } catch {} }
    }, LONG_PRESS_MS);
  }

  function cancelTraverseLongPress() {
    if (traversePressTimer) clearTimeout(traversePressTimer);
    traversePressTimer = null;
    if (traversePressKey) {
      const btn = $('.traverse-cell[data-key="' + traversePressKey + '"]');
      if (btn) btn.classList.remove('hold-pending');
    }
    traversePressKey = null;
  }

  function toggleTraverseClue() {
    if (!traverse || traverse.ended || traverse.clues <= 0) return;
    traverse.clueArmed = !traverse.clueArmed;
    traverse.status = traverse.clueArmed
      ? 'Detector ?: elegí una casilla de la frontera.'
      : 'Detector cancelado.';
    renderTraverse();
  }

  function useTraverseClue(key) {
    if (!traverse || !traverse.clueArmed || traverse.clues <= 0) return;
    const pickup = traversePickupAt(key);
    if (!traverse.active.has(key) || traverse.revealed.has(key) || isTraverseDoorKey(key) || (pickup && !pickup.collected)) return;
    if (!isTraverseFrontier(key)) {
      traverse.status = 'El detector sólo se usa sobre la frontera actual.';
      renderTraverse();
      return;
    }

    traverse.clues -= 1;
    traverse.clueArmed = false;
    if (traverse.mines.has(key)) {
      traverse.flags.add(key);
      traverse.status = 'Detector: mina. Quedó marcada.';
    } else {
      traverse.knownSafe.add(key);
      traverse.status = 'Detector: casilla segura.';
    }
    renderTraverse();
  }

  function leaveTraverse() {
    cancelTraverseLongPress();
    traverse = null;
    renderHome();
    showScreen('#homeScreen');
  }

  function startRun() {
    profile.runs += 1;
    saveProfile();
    run = { floor: 1, cleared: 0, shields: 0, shieldCapacity: 1, clues: 0, rewardClaimedFloor: 0, pendingReward: null, startedAt: Date.now() };
    startFloor(makeFloorSpec(1, null, 'normal'));
  }

  function makeFloorSpec(floor, bias, floorTypeId = 'normal') {
    const shapes = unlockedShapes();
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const difficulty = Math.max(1, floor);
    const floorType = FLOOR_TYPES[floorTypeId] || FLOOR_TYPES.normal;
    const baseCells = Math.min(104, 25 + difficulty * 4);
    const densityBase = Math.min(0.32, 0.12 + (difficulty - 1) * 0.018);
    let density = clamp(densityBase + floorType.densityDelta, 0.08, 0.38);
    let targetCells = Math.max(20, baseCells + floorType.cellDelta);
    let trait = 'Equilibrado';

    if (bias === 'safe') {
      targetCells = Math.min(92, targetCells + 6);
      trait = 'Más abierto';
    } else if (bias === 'dense') {
      density = Math.min(0.38, density + 0.012);
      targetCells = Math.max(22, targetCells - 4);
      trait = 'Más denso';
    } else if (bias === 'long') {
      targetCells = Math.min(96, targetCells + 10);
      trait = 'Más largo';
    }

    const maxSide = Math.min(13, 7 + Math.floor((difficulty - 1) / 2));
    const dims = dimensionsForShape(shape.id, maxSide, targetCells);
    return {
      floor, difficulty, shapeId: shape.id, shapeName: shape.name, density, targetCells,
      rows: dims.rows, cols: dims.cols, trait,
      floorTypeId: floorType.id, floorTypeName: floorType.name,
      rewardChance: floorType.rewardChance, rewardQuality: floorType.rewardQuality,
      mineDamage: floorType.mineDamage,
      mineCountEstimate: Math.max(3, Math.round(targetCells * density))
    };
  }

  function dimensionsForShape(shapeId, maxSide, targetCells) {
    if (shapeId === 'corridor') return { rows: Math.min(13, maxSide + 1), cols: Math.min(13, maxSide) };
    if (shapeId === 'ring') return { rows: Math.min(13, maxSide), cols: Math.min(13, maxSide) };
    const side = Math.max(6, Math.min(13, Math.ceil(Math.sqrt(targetCells * 1.45))));
    return { rows: side, cols: side };
  }

  function startFloor(spec) {
    devPeek = false;
    showScreen('#gameScreen');
    profile.bestFloor = Math.max(profile.bestFloor, spec.floor);
    saveProfile();
    board = createBoard(spec);
    $('#floorLabel').textContent = spec.floor;
    $('#shapeLabel').textContent = spec.shapeName;
    $('#mineLabel').textContent = board.mineCount;
    $('#difficultyLabel').textContent = spec.difficulty;
    clueSelection = null;
    updateShieldLabel();
    updateClueUI();
    $('#gameHint').textContent = spec.mineDamage > 1
      ? 'Piso pesado: cada mina quita 2 escudos · Toque: revelar · Mantener: bandera'
      : 'Toque: revelar · Mantener: bandera';
    renderBoard();
  }

  function createBoard(spec) {
    const active = generateShape(spec.shapeId, spec.rows, spec.cols, spec.targetCells);
    const mineCount = Math.max(3, Math.min(active.size - 5, Math.round(active.size * spec.density)));
    const cells = [];
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        const key = keyOf(r, c);
        cells.push({ r, c, key, active: active.has(key), mine: false, revealed: false, flagged: false, number: 0, clueResult: null });
      }
    }
    return { spec, cells, mineCount, minesPlaced: false, ended: false };
  }

  function generateShape(type, rows, cols, targetCells) {
    const all = new Set();
    const add = (r, c) => { if (r >= 0 && c >= 0 && r < rows && c < cols) all.add(keyOf(r, c)); };

    if (type === 'room') {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add(r, c);
      const cuts = Math.max(2, Math.floor(rows * cols * 0.16));
      const borderCandidates = [...all].filter(k => {
        const [r, c] = fromKey(k);
        return r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
      });
      shuffle(borderCandidates).slice(0, cuts).forEach(k => all.delete(k));
      ensureConnected(all, rows, cols);
      return all;
    }

    if (type === 'cross') {
      const mr = Math.floor(rows / 2), mc = Math.floor(cols / 2);
      const arm = Math.max(1, Math.floor(Math.min(rows, cols) / 3));
      for (let r = 0; r < rows; r++) for (let c = Math.max(0, mc - arm); c <= Math.min(cols - 1, mc + arm); c++) add(r, c);
      for (let c = 0; c < cols; c++) for (let r = Math.max(0, mr - arm); r <= Math.min(rows - 1, mr + arm); r++) add(r, c);
      return all;
    }

    if (type === 'ring') {
      const margin = rows >= 9 ? 1 : 0;
      for (let r = margin; r < rows - margin; r++) {
        for (let c = margin; c < cols - margin; c++) {
          const edge = r <= margin + 1 || c <= margin + 1 || r >= rows - margin - 2 || c >= cols - margin - 2;
          if (edge) add(r, c);
        }
      }
      const bridgeR = Math.floor(rows / 2);
      for (let c = margin; c < cols - margin; c++) add(bridgeR, c);
      return all;
    }

    if (type === 'corridor') {
      let r = Math.floor(rows / 2), c = 1;
      const goal = Math.min(rows * cols, Math.max(24, targetCells));
      for (let guard = 0; guard < rows * cols * 10 && all.size < goal; guard++) {
        add(r, c);
        if (Math.random() < 0.62) {
          c += Math.random() < 0.72 ? 1 : -1;
        } else {
          r += Math.random() < 0.5 ? 1 : -1;
        }
        r = clamp(r, 1, rows - 2);
        c = clamp(c, 1, cols - 2);
        if (Math.random() < 0.5) add(r + (Math.random() < 0.5 ? 1 : -1), c);
      }
      return growConnected(all, rows, cols, goal);
    }

    const goal = Math.min(rows * cols, Math.max(24, targetCells));
    add(Math.floor(rows / 2), Math.floor(cols / 2));
    return growConnected(all, rows, cols, goal);
  }

  function growConnected(set, rows, cols, goal) {
    while (set.size < goal) {
      const existing = [...set];
      const seed = existing[Math.floor(Math.random() * existing.length)];
      const [r, c] = fromKey(seed);
      const options = neighbors4(r, c).filter(([nr, nc]) => nr >= 0 && nc >= 0 && nr < rows && nc < cols);
      const [nr, nc] = options[Math.floor(Math.random() * options.length)];
      set.add(keyOf(nr, nc));
    }
    return set;
  }

  function ensureConnected(set, rows, cols) {
    if (!set.size) return;
    const start = [...set][0];
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      const [r, c] = fromKey(cur);
      neighbors4(r, c).forEach(([nr, nc]) => {
        const k = keyOf(nr, nc);
        if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && set.has(k) && !seen.has(k)) {
          seen.add(k); stack.push(k);
        }
      });
    }
    [...set].forEach(k => { if (!seen.has(k)) set.delete(k); });
  }

  function placeMines(firstCell) {
    const excluded = new Set([firstCell.key]);
    neighbors8(firstCell.r, firstCell.c).forEach(([r, c]) => excluded.add(keyOf(r, c)));
    let pool = board.cells.filter(c => c.active && !excluded.has(c.key));
    if (pool.length < board.mineCount) pool = board.cells.filter(c => c.active && c.key !== firstCell.key);
    shuffle(pool).slice(0, board.mineCount).forEach(c => { c.mine = true; });
    board.cells.filter(c => c.active && !c.mine).forEach(c => {
      c.number = neighbors8(c.r, c.c).reduce((n, [r, col]) => n + (cellAt(r, col)?.mine ? 1 : 0), 0);
    });
    board.minesPlaced = true;
  }

  function renderBoard() {
    const root = $('#board');
    root.style.setProperty('--cols', board.spec.cols);
    root.innerHTML = '';
    board.cells.forEach(cell => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cell';
      btn.dataset.key = cell.key;
      if (!cell.active) {
        btn.classList.add('inactive');
        btn.tabIndex = -1;
        btn.setAttribute('aria-hidden', 'true');
      } else {
        paintCell(btn, cell);
        btn.addEventListener('click', () => {
          if (longPressTriggered) { longPressTriggered = false; return; }
          handleCellAction(cell);
        });
        btn.addEventListener('contextmenu', e => { e.preventDefault(); if (!longPressTriggered) toggleFlag(cell); });
        btn.addEventListener('pointerdown', e => beginLongPress(e, cell));
        btn.addEventListener('pointerup', cancelLongPress);
        btn.addEventListener('pointercancel', cancelLongPress);
        btn.addEventListener('pointerleave', cancelLongPress);
      }
      root.appendChild(btn);
    });
  }

  function paintCell(btn, cell) {
    btn.className = 'cell';
    btn.textContent = '';
    btn.setAttribute('aria-label', 'Casilla sin revelar');
    if (!cell.active) { btn.classList.add('inactive'); return; }
    if (cell.revealed) {
      btn.classList.add('revealed');
      if (cell.mine) {
        btn.classList.add('mine');
        btn.textContent = '✹';
        btn.setAttribute('aria-label', 'Mina');
      } else if (cell.number > 0) {
        btn.textContent = cell.number;
        btn.classList.add(`n${cell.number}`);
        btn.setAttribute('aria-label', `${cell.number} minas alrededor`);
      } else {
        btn.setAttribute('aria-label', 'Vacía');
      }
    } else if (cell.clueResult === 'mine') {
      btn.classList.add('clue-known-mine');
      btn.textContent = '!';
      btn.setAttribute('aria-label', 'La pista indicó una mina');
    } else if (cell.clueResult === 'safe') {
      btn.classList.add('clue-known-safe');
      btn.textContent = '·';
      btn.setAttribute('aria-label', 'La pista indicó que es segura');
    } else if (cell.flagged) {
      btn.classList.add('flagged');
      btn.textContent = '⚑';
      btn.setAttribute('aria-label', 'Marcada con bandera');
    }
  }

  function repaintCell(cell) {
    const btn = $(`.cell[data-key="${cell.key}"]`);
    if (btn) paintCell(btn, cell);
  }

  function handleCellAction(cell) {
    if (!cell.active || cell.revealed || board.ended) return;
    if (clueSelection) {
      chooseSecondClueCell(cell);
      return;
    }
    reveal(cell);
  }

  function updateClueUI() {
    const bar = $('#itemBar');
    const item = $('#clueItem');
    const count = $('#clueCount');
    if (!bar || !item || !count || !run) return;
    count.textContent = run.clues;
    bar.classList.toggle('hidden', run.clues <= 0);
    item.disabled = run.clues <= 0 || !board || board.ended;
  }

  function beginClueDrag(e) {
    if (!run || run.clues <= 0 || !board || board.ended) return;
    e.preventDefault();
    if (!board.minesPlaced) {
      $('#gameHint').textContent = 'Revelá una casilla antes de usar la pista.';
      return;
    }
    cancelClueSelection();
    const ghost = document.createElement('div');
    ghost.className = 'clue-drag-ghost';
    ghost.textContent = '?';
    document.body.appendChild(ghost);
    clueDrag = { pointerId: e.pointerId, ghost };
    moveClueDrag(e);
    window.addEventListener('pointermove', moveClueDrag);
    window.addEventListener('pointerup', endClueDrag, { once: true });
    window.addEventListener('pointercancel', cancelClueDrag, { once: true });
  }

  function moveClueDrag(e) {
    if (!clueDrag || e.pointerId !== clueDrag.pointerId) return;
    clueDrag.ghost.style.left = e.clientX + 'px';
    clueDrag.ghost.style.top = e.clientY + 'px';
  }

  function endClueDrag(e) {
    if (!clueDrag || e.pointerId !== clueDrag.pointerId) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell');
    const key = target?.dataset?.key;
    const cell = key ? board.cells.find(c => c.key === key) : null;
    cancelClueDrag();
    if (cell) beginClueSelection(cell);
  }

  function cancelClueDrag() {
    window.removeEventListener('pointermove', moveClueDrag);
    if (clueDrag?.ghost) clueDrag.ghost.remove();
    clueDrag = null;
  }

  function beginClueSelection(cell) {
    if (!run || run.clues <= 0 || !board?.minesPlaced || board.ended) return;
    if (!cell?.active || cell.revealed) {
      $('#gameHint').textContent = 'Arrastrá ? sobre una casilla sin revelar.';
      return;
    }
    clueSelection = cell;
    const btn = $('.cell[data-key="' + cell.key + '"]');
    if (btn) btn.classList.add('clue-first');

    const validNeighbors = neighbors8(cell.r, cell.c)
      .map(([r, c]) => cellAt(r, c))
      .filter(next => next?.active && !next.revealed);

    validNeighbors.forEach(next => {
      const option = $('.cell[data-key="' + next.key + '"]');
      if (option) option.classList.add('clue-option');
    });

    $('#gameHint').textContent = validNeighbors.length
      ? 'Elegí una de las casillas marcadas.'
      : 'No hay una segunda casilla válida.';
  }

  function cancelClueSelection() {
    document.querySelectorAll('.cell.clue-first, .cell.clue-option').forEach(btn => {
      btn.classList.remove('clue-first', 'clue-option');
    });
    clueSelection = null;
  }

  function chooseSecondClueCell(cell) {
    const first = clueSelection;
    if (!first || !cell || cell === first) return;
    const adjacent = neighbors8(first.r, first.c).some(([r, c]) => r === cell.r && c === cell.c);
    if (!adjacent || !cell.active || cell.revealed) {
      $('#gameHint').textContent = 'La segunda casilla tiene que estar contigua y sin revelar.';
      return;
    }

    first.clueResult = first.mine ? 'mine' : 'safe';
    cell.clueResult = cell.mine ? 'mine' : 'safe';
    run.clues = Math.max(0, run.clues - 1);
    cancelClueSelection();
    repaintCell(first);
    repaintCell(cell);
    updateClueUI();

    const mines = Number(first.mine) + Number(cell.mine);
    $('#gameHint').textContent = mines === 1
      ? 'Pista usada: la mina quedó marcada con !.'
      : mines === 0
        ? 'Pista usada: ninguna de las dos tiene mina.'
        : 'Pista usada: las dos tienen mina.';
  }

  function reveal(cell) {
    if (cell.flagged || cell.revealed || board.ended) return;
    if (!board.minesPlaced) placeMines(cell);
    cell.revealed = true;
    repaintCell(cell);

    if (cell.mine) {
      const mineDamage = Math.max(1, board.spec.mineDamage || 1);
      if (run.shields >= mineDamage) {
        run.shields -= mineDamage;
        updateShieldLabel();
        const hitButton = document.querySelector('.cell[data-key="' + cell.key + '"]');
        if (hitButton) hitButton.classList.add('shielded-hit');
        $('#gameHint').textContent = mineDamage === 2
          ? 'Piso pesado: 2 escudos consumidos. La run continúa.'
          : 'Escudo consumido. La run continúa.';
        if ('vibrate' in navigator) { try { navigator.vibrate([35, 45, 35]); } catch {} }
        return;
      }
      run.shields = 0;
      updateShieldLabel();
      loseRun(cell);
      return;
    }

    if (cell.number === 0) floodReveal(cell);
    if (checkClear()) completeFloor();
  }

  function floodReveal(start) {
    const queue = [start];
    const seen = new Set([start.key]);
    while (queue.length) {
      const current = queue.shift();
      neighbors8(current.r, current.c).forEach(([r, c]) => {
        const next = cellAt(r, c);
        if (!next?.active || next.mine || next.flagged || next.revealed) return;
        next.revealed = true;
        repaintCell(next);
        if (next.number === 0 && !seen.has(next.key)) {
          seen.add(next.key);
          queue.push(next);
        }
      });
    }
  }

  function toggleFlag(cell) {
    if (!cell.active || cell.revealed || board.ended) return;
    cell.flagged = !cell.flagged;
    repaintCell(cell);
  }

  function beginLongPress(e, cell) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelLongPress();
    longPressTriggered = false;
    longPressCellKey = cell.key;
    longPressPointerId = e.pointerId;

    const btn = $('.cell[data-key="' + cell.key + '"]');
    if (btn) btn.classList.add('hold-pending');

    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressTriggered = true;
      const key = longPressCellKey;
      longPressCellKey = null;
      longPressPointerId = null;
      toggleFlag(cell);

      const confirmed = key ? $('.cell[data-key="' + key + '"]') : null;
      if (confirmed) {
        confirmed.classList.remove('hold-pending');
        confirmed.classList.add('hold-confirmed');
        setTimeout(() => confirmed.classList.remove('hold-confirmed'), 160);
      }

      if ('vibrate' in navigator) { try { navigator.vibrate(25); } catch {} }
    }, LONG_PRESS_MS);
  }

  function cancelLongPress(e) {
    if (e && longPressPointerId !== null && e.pointerId !== longPressPointerId) return;
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = null;

    if (longPressCellKey) {
      const btn = $('.cell[data-key="' + longPressCellKey + '"]');
      if (btn) btn.classList.remove('hold-pending');
    }
    longPressCellKey = null;
    longPressPointerId = null;
  }

  function checkClear() {
    return board.cells.every(c => !c.active || c.mine || c.revealed);
  }

  function updateShieldLabel() {
    const label = $('#shieldLabel');
    if (label) label.textContent = run ? `${run.shields}/${run.shieldCapacity}` : '0/1';
    updateDevStatus();
  }

  function rollFloorReward() {
    if (run.floor === 1) return 'shield';

    const chance = board?.spec?.rewardChance ?? FLOOR_TYPES.normal.rewardChance;
    if (Math.random() >= chance) return 'none';

    const quality = board?.spec?.rewardQuality || 'Normal';
    const canTakeShield = run.shields < run.shieldCapacity;
    const vulnerable = run.shields === 0 && canTakeShield;
    let pool;

    if (vulnerable) {
      if (quality === 'Alta') pool = ['shield', 'shield', 'capacity', 'capacity', 'clue'];
      else if (quality === 'Baja') pool = ['shield', 'shield', 'shield', 'capacity', 'clue'];
      else pool = ['shield', 'shield', 'capacity', 'clue'];
    } else if (quality === 'Alta') {
      pool = canTakeShield
        ? ['capacity', 'capacity', 'shield', 'clue', 'clue']
        : ['capacity', 'capacity', 'clue', 'clue'];
    } else if (quality === 'Baja') {
      pool = canTakeShield
        ? ['shield', 'shield', 'capacity', 'clue']
        : ['capacity', 'clue', 'clue'];
    } else {
      pool = canTakeShield
        ? ['shield', 'capacity', 'clue']
        : ['capacity', 'clue'];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function renderFloorReward() {
    run.pendingReward = rollFloorReward();
    const claim = $('#claimShieldButton');
    const skip = $('#skipShieldButton');

    claim.classList.remove('hidden');
    skip.textContent = 'Seguir sin mejora';

    if (run.pendingReward === 'shield') {
      claim.textContent = '+1 escudo';
      skip.textContent = 'Seguir sin escudo';
    } else if (run.pendingReward === 'capacity') {
      claim.textContent = '+1 espacio de escudo';
    } else if (run.pendingReward === 'clue') {
      claim.textContent = '? · pista';
      skip.textContent = 'Seguir sin objeto';
    } else {
      claim.classList.add('hidden');
      skip.textContent = 'Seguir';
    }
  }

  function claimFloorReward() {
    if (!run || run.rewardClaimedFloor === run.floor || !run.pendingReward) return;
    run.rewardClaimedFloor = run.floor;

    if (run.pendingReward === 'shield' && run.shields < run.shieldCapacity) {
      run.shields += 1;
    } else if (run.pendingReward === 'capacity') {
      run.shieldCapacity += 1;
    } else if (run.pendingReward === 'clue') {
      run.clues += 1;
    }

    run.pendingReward = null;
    updateShieldLabel();
    updateClueUI();
    showPathChoices();
  }

  function skipFloorReward() {
    if (!run) return;
    run.pendingReward = null;
    showPathChoices();
  }

  function showPathChoices() {
    $('#rewardStep').classList.add('hidden');
    $('#pathStep').classList.remove('hidden');
    $('#choiceTitle').textContent = 'Elegí el siguiente descenso.';
  }

  function completeFloor() {
    if (board.ended) return;
    board.ended = true;
    run.cleared += 1;
    profile.totalFloors += 1;
    saveProfile();
    setTimeout(showChoices, 180);
  }

  function chooseFloorTypes(nextFloor) {
    const weighted = nextFloor < 3
      ? ['safe', 'safe', 'normal', 'normal', 'normal', 'dangerous']
      : ['safe', 'safe', 'normal', 'normal', 'normal', 'dangerous', 'dangerous', 'heavy', 'heavy'];
    const first = weighted[Math.floor(Math.random() * weighted.length)];
    const remaining = weighted.filter(id => id !== first);
    const second = remaining[Math.floor(Math.random() * remaining.length)] || (first === 'normal' ? 'safe' : 'normal');
    return [first, second];
  }

  function showChoices() {
    showScreen('#choiceScreen');
    $('#clearedFloorLabel').textContent = run.floor;
    $('#choiceTitle').textContent = 'Recompensa del piso.';
    $('#rewardStep').classList.remove('hidden');
    $('#pathStep').classList.add('hidden');
    renderFloorReward();

    const nextFloor = run.floor + 1;
    const biases = shuffle(['safe', 'dense', 'long']).slice(0, 2);
    const floorTypes = chooseFloorTypes(nextFloor);
    pendingChoices = floorTypes.map((typeId, i) => makeFloorSpec(nextFloor, biases[i], typeId));

    $('#choiceList').innerHTML = '';
    pendingChoices.forEach(choice => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-card';
      const chance = Math.round(choice.rewardChance * 100);
      const mineRule = choice.mineDamage > 1
        ? 'Cada mina quita 2 escudos'
        : 'Minas aprox.: ' + choice.mineCountEstimate;
      btn.innerHTML =
        '<strong>' + choice.floorTypeName + '</strong>' +
        '<span>' + choice.shapeName + ' · ' + choice.trait + '</span>' +
        '<span>' + mineRule + '</span>' +
        '<span>Prob. recompensa: ' + chance + '%</span>' +
        '<span>Calidad: ' + choice.rewardQuality + '</span>';
      btn.addEventListener('click', () => {
        run.floor += 1;
        startFloor(choice);
      });
      $('#choiceList').appendChild(btn);
    });
  }

  function loseRun(hit) {
    board.ended = true;
    board.cells.filter(c => c.active && c.mine).forEach(c => { c.revealed = true; repaintCell(c); });
    const hitButton = $(`.cell[data-key="${hit.key}"]`);
    if (hitButton) hitButton.textContent = '✹';

    const before = unlockedShapes().map(s => s.id);
    const earned = run.cleared;
    profile.echoes += earned;
    profile.deaths += 1;
    saveProfile();
    const newUnlocks = unlockedShapes().filter(s => !before.includes(s.id));

    setTimeout(() => {
      showScreen('#deathScreen');
      $('#deathScreen h2').textContent = 'Encontraste una mina.';
      $('#deathStats').innerHTML = [
        ['Llegaste', `Piso ${run.floor}`],
        ['Superados', run.cleared],
        ['Ecos', `+${earned}`]
      ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
      const notice = $('#unlockNotice');
      if (newUnlocks.length) {
        notice.textContent = `Nueva forma desbloqueada: ${newUnlocks.map(s => s.name).join(', ')}.`;
        notice.classList.remove('hidden');
      } else {
        notice.classList.add('hidden');
      }
      renderHome();
    }, 450);
  }

  function abandonRun() {
    if (!run) return;
    showScreen('#deathScreen');
    $('#deathScreen h2').textContent = 'Run abandonada.';
    $('#deathStats').innerHTML = [
      ['Llegaste', `Piso ${run.floor}`],
      ['Superados', run.cleared],
      ['Ecos', '+0']
    ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
    const notice = $('#unlockNotice');
    if (run.cleared > 0) {
      notice.textContent = 'Los ecos pendientes de esta run no se acreditan al abandonar.';
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
  }

  function cellAt(r, c) {
    if (!board || r < 0 || c < 0 || r >= board.spec.rows || c >= board.spec.cols) return null;
    return board.cells[r * board.spec.cols + c] || null;
  }

  function neighbors8(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr || dc) out.push([r + dr, c + dc]);
    }
    return out;
  }

  function neighbors4(r, c) { return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]; }
  function keyOf(r, c) { return `${r},${c}`; }
  function fromKey(key) { return key.split(',').map(Number); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function shuffle(array) {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function checkForUpdate() {
    try {
      const response = await fetch(`version.json?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      latestVersion = String(data.version || VERSION);
      const button = $('#updateButton');
      if (latestVersion !== VERSION) {
        button.textContent = `Actualizar a v${latestVersion}`;
        button.classList.remove('hidden');
      } else {
        button.classList.add('hidden');
      }
    } catch {}
  }

  function installLatestVersion() {
    const button = $('#updateButton');
    button.disabled = true;
    button.textContent = 'Actualizando…';
    const url = new URL(location.href);
    url.searchParams.set('_v', latestVersion);
    url.searchParams.set('_t', Date.now().toString());
    location.replace(url.toString());
  }

  $('#startButton').addEventListener('click', startRun);
  $('#traverseButton').addEventListener('click', startTraverse);
  $('#restartTraverseButton').addEventListener('click', startTraverse);
  $('#traverseHomeButton').addEventListener('click', leaveTraverse);
  $('#traverseClueButton').addEventListener('click', toggleTraverseClue);
  $('#retryButton').addEventListener('click', () => {
    $('#deathScreen h2').textContent = 'Encontraste una mina.';
    startRun();
  });
  $('#homeButton').addEventListener('click', () => { renderHome(); showScreen('#homeScreen'); });
  $('#restartRunButton').addEventListener('click', abandonRun);
  $('#claimShieldButton').addEventListener('click', claimFloorReward);
  $('#skipShieldButton').addEventListener('click', skipFloorReward);
  $('#updateButton').addEventListener('click', installLatestVersion);
  $('#devToggleButton').addEventListener('click', () => setDevMode(!devMode));
  $('#devPanel').addEventListener('click', (event) => {
    const button = event.target.closest('[data-dev-action]');
    if (button) handleDevAction(button.dataset.devAction);
  });
  $('#clueItem').addEventListener('pointerdown', beginClueDrag);
  window.addEventListener('focus', checkForUpdate);
  setInterval(checkForUpdate, 60000);

  $('#versionLabel').textContent = `v${VERSION}`;
  setDevMode(loadDevMode());
  renderHome();
  checkForUpdate();
})();
