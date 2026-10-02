(() => {
  'use strict';

  const VERSION = '0.1.9';
  const PROFILE_KEY = 'buscawacha-profile-v1';
  const DEV_KEY = 'buscawacha-dev-mode-v1';
  const LONG_PRESS_MS = 430;
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
  const screens = ['#homeScreen', '#gameScreen', '#choiceScreen', '#deathScreen'];
  const profile = loadProfile();

  let run = null;
  let board = null;
  let pendingChoices = [];
  let latestVersion = VERSION;
  let longPressTimer = null;
  let longPressTriggered = false;
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
    $('#gameHint').textContent = 'Pista: elegí una segunda casilla contigua.';
  }

  function cancelClueSelection() {
    if (clueSelection) {
      const btn = $('.cell[data-key="' + clueSelection.key + '"]');
      if (btn) btn.classList.remove('clue-first');
    }
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
    if (e.pointerType === 'mouse') return;
    cancelLongPress();
    longPressTriggered = false;
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      toggleFlag(cell);
      if ('vibrate' in navigator) { try { navigator.vibrate(25); } catch {} }
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = null;
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
