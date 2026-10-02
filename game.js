(() => {
  'use strict';

  const VERSION = '0.1.0';
  const PROFILE_KEY = 'buscawacha-profile-v1';
  const LONG_PRESS_MS = 430;
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
  let inputMode = 'reveal';
  let pendingChoices = [];
  let latestVersion = VERSION;
  let longPressTimer = null;
  let longPressTriggered = false;

  function loadProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      return {
        bestFloor: Math.max(0, Number(p?.bestFloor) || 0),
        totalFloors: Math.max(0, Number(p?.totalFloors) || 0),
        runs: Math.max(0, Number(p?.runs) || 0)
      };
    } catch {
      return { bestFloor: 0, totalFloors: 0, runs: 0 };
    }
  }

  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch {}
  }

  function unlockedShapes(totalFloors = profile.totalFloors) {
    return SHAPE_UNLOCKS.filter(s => totalFloors >= s.at);
  }

  function showScreen(selector) {
    screens.forEach(s => $(s).classList.toggle('hidden', s !== selector));
    window.scrollTo(0, 0);
  }

  function renderHome() {
    const unlocked = unlockedShapes().length;
    $('#homeStats').innerHTML = [
      ['Mejor piso', profile.bestFloor || '—'],
      ['Pisos totales', profile.totalFloors],
      ['Formas', `${unlocked}/${SHAPE_UNLOCKS.length}`]
    ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function startRun() {
    profile.runs += 1;
    saveProfile();
    run = { floor: 1, cleared: 0, startedAt: Date.now(), newUnlocks: [] };
    inputMode = 'reveal';
    updateModeButton();
    startFloor(makeFloorSpec(1, null));
  }

  function makeFloorSpec(floor, bias) {
    const shapes = unlockedShapes();
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const baseCells = Math.min(78, 27 + floor * 3);
    const densityBase = Math.min(0.225, 0.13 + (floor - 1) * 0.006);
    let density = densityBase;
    let targetCells = baseCells;
    let trait = 'Equilibrado';

    if (bias === 'safe') {
      density = Math.max(0.11, densityBase - 0.025);
      targetCells = Math.min(82, baseCells + 6);
      trait = 'Más abierto';
    } else if (bias === 'dense') {
      density = Math.min(0.245, densityBase + 0.025);
      targetCells = Math.max(22, baseCells - 4);
      trait = 'Más denso';
    } else if (bias === 'long') {
      targetCells = Math.min(84, baseCells + 10);
      trait = 'Más largo';
    }

    const maxSide = Math.min(11, 7 + Math.floor((floor - 1) / 3));
    const dims = dimensionsForShape(shape.id, maxSide, targetCells);
    return { floor, shapeId: shape.id, shapeName: shape.name, density, targetCells, rows: dims.rows, cols: dims.cols, trait };
  }

  function dimensionsForShape(shapeId, maxSide, targetCells) {
    if (shapeId === 'corridor') return { rows: Math.min(11, maxSide + 1), cols: Math.min(11, maxSide) };
    if (shapeId === 'ring') return { rows: Math.min(11, maxSide), cols: Math.min(11, maxSide) };
    const side = Math.max(6, Math.min(11, Math.ceil(Math.sqrt(targetCells * 1.45))));
    return { rows: side, cols: side };
  }

  function startFloor(spec) {
    showScreen('#gameScreen');
    profile.bestFloor = Math.max(profile.bestFloor, spec.floor);
    saveProfile();
    board = createBoard(spec);
    $('#floorLabel').textContent = spec.floor;
    $('#shapeLabel').textContent = spec.shapeName;
    $('#mineLabel').textContent = board.mineCount;
    $('#gameHint').textContent = 'Revelá todas las casillas que no tengan minas.';
    renderBoard();
  }

  function createBoard(spec) {
    const active = generateShape(spec.shapeId, spec.rows, spec.cols, spec.targetCells);
    const mineCount = Math.max(3, Math.min(active.size - 5, Math.round(active.size * spec.density)));
    const cells = [];
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        const key = keyOf(r, c);
        cells.push({ r, c, key, active: active.has(key), mine: false, revealed: false, flagged: false, number: 0 });
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
    if (inputMode === 'flag') { toggleFlag(cell); return; }
    reveal(cell);
  }

  function reveal(cell) {
    if (cell.flagged || cell.revealed || board.ended) return;
    if (!board.minesPlaced) placeMines(cell);
    cell.revealed = true;
    repaintCell(cell);

    if (cell.mine) {
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

  function completeFloor() {
    if (board.ended) return;
    board.ended = true;
    run.cleared += 1;
    profile.totalFloors += 1;
    saveProfile();
    const before = unlockedShapes(profile.totalFloors - 1).map(s => s.id);
    const after = unlockedShapes(profile.totalFloors);
    const unlocked = after.find(s => !before.includes(s.id)) || null;
    if (unlocked && !run.newUnlocks.some(s => s.id === unlocked.id)) run.newUnlocks.push(unlocked);
    setTimeout(showChoices, 180);
  }

  function showChoices() {
    showScreen('#choiceScreen');
    $('#clearedFloorLabel').textContent = run.floor;
    const biases = shuffle(['safe', 'dense', 'long']).slice(0, 2);
    pendingChoices = biases.map(bias => makeFloorSpec(run.floor + 1, bias));
    $('#choiceList').innerHTML = '';
    pendingChoices.forEach((choice, index) => {
      const activePreview = generateShape(choice.shapeId, choice.rows, choice.cols, choice.targetCells).size;
      const mines = Math.max(3, Math.min(activePreview - 5, Math.round(activePreview * choice.density)));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-card';
      btn.innerHTML = `<strong>${choice.shapeName} · ${choice.trait}</strong><div class="choice-meta"><span>${activePreview} casillas aprox.</span><span>${mines} minas aprox.</span></div>`;
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
    setTimeout(() => {
      showScreen('#deathScreen');
      $('#deathScreen h2').textContent = 'Encontraste una mina.';
      $('#deathStats').innerHTML = [
        ['Llegaste', `Piso ${run.floor}`],
        ['Superados', run.cleared],
        ['Récord', profile.bestFloor || '—']
      ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
      const notice = $('#unlockNotice');
      if (run.newUnlocks.length) {
        notice.textContent = `Nueva forma desbloqueada: ${run.newUnlocks.map(s => s.name).join(', ')}.`;
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
      ['Récord', profile.bestFloor || '—']
    ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
    $('#unlockNotice').classList.add('hidden');
  }

  function updateModeButton() {
    $('#modeButton').textContent = inputMode === 'reveal' ? 'Modo: revelar' : 'Modo: bandera';
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
  $('#modeButton').addEventListener('click', () => {
    inputMode = inputMode === 'reveal' ? 'flag' : 'reveal';
    updateModeButton();
    $('#gameHint').textContent = inputMode === 'reveal' ? 'Toque para revelar.' : 'Toque para poner o sacar banderas.';
  });
  $('#updateButton').addEventListener('click', installLatestVersion);
  window.addEventListener('focus', checkForUpdate);
  setInterval(checkForUpdate, 60000);

  $('#versionLabel').textContent = `v${VERSION}`;
  renderHome();
  checkForUpdate();
})();
