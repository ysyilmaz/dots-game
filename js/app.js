import { RED, BLUE, createState, play, pass, resign, scores, encodeState, decodeState } from './rules.js';
import { BoardView, coordLabel } from './render.js';
import { Net, makeRoomCode } from './net.js';
import { pickBotMove } from './bot.js';

const $ = (id) => document.getElementById(id);

const MIN_CELL = 10;
const MAX_CELL = 40;
const BOT_DELAY = 480;
const PEER_TIMEOUT = 24000;
const PING_EVERY = 7000;
const STALE_LIMIT = 3;
const TOAST_MS = 2600;
const COPY_MS = 1600;
const OVER_DELAY = 450;
const MOVE_ROWS = 120;

const el = {
  board: $('board'),
  boardWrap: $('boardWrap'),
  turnPill: $('turnPill'),
  turnPillText: $('turnPillText'),
  toast: $('toast'),
  roomChip: $('roomChip'),
  connDot: $('connDot'),
  chipCode: $('chipCode'),
  chipLabel: $('chipLabel'),
  cardRed: $('cardRed'),
  cardBlue: $('cardBlue'),
  nameRed: $('nameRed'),
  nameBlue: $('nameBlue'),
  stateRed: $('stateRed'),
  stateBlue: $('stateBlue'),
  scoreRed: $('scoreRed'),
  scoreBlue: $('scoreBlue'),
  status: $('status'),
  roomBox: $('roomBox'),
  roomCode: $('roomCode'),
  pingText: $('pingText'),
  moveCount: $('moveCount'),
  moveList: $('moveList'),
  modeGrid: $('modeGrid'),
  sizeSeg: $('sizeSeg'),
  inpW: $('inpW'),
  inpH: $('inpH'),
  inpRoom: $('inpRoom'),
  onlineBlock: $('onlineBlock'),
  roomClosed: $('roomClosed'),
  roomOpen: $('roomOpen'),
  roomCodeBig: $('roomCodeBig'),
  roomConnLabel: $('roomConnLabel'),
  roomConnDot: document.querySelector('.ro-conn i'),
  shareLink: $('shareLink'),
  roomHint: $('roomHint'),
  startRow: $('startRow'),
  resultTitle: $('resultTitle'),
  resultSub: $('resultSub'),
  finalRed: $('finalRed'),
  finalBlue: $('finalBlue'),
};

const view = new BoardView(el.board);

const app = {
  mode: 'local',
  setupMode: 'local',
  role: null,
  myColor: 0,
  state: null,
  history: [],
  moves: [],
  net: null,
  room: null,
  roomOpen: false,
  peerOnline: false,
  peerAt: 0,
  peerMc: null,
  staleTicks: 0,
  ping: 0,
  zoom: null,
  busy: false,
  overlay: null,
  overShown: false,
};

let botTimer = null;
let toastTimer = null;
let copyTimer = null;
let overTimer = null;
let movesKey = '';

const isOnline = () => app.mode === 'online';
const colorName = (p) => (p === RED ? 'Kırmızı' : 'Mavi');

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function boardSize() {
  return { w: clampInt(el.inpW.value, 5, 120, 39), h: clampInt(el.inpH.value, 5, 120, 32) };
}

function myTurn() {
  const s = app.state;
  if (!s || s.finished || app.busy) return false;
  if (app.mode === 'local') return true;
  if (!app.myColor) return false;
  if (isOnline() && !app.peerOnline) return false;
  return s.turn === app.myColor;
}

function labelFor(p) {
  if (app.mode === 'bot') return p === app.myColor ? 'Sen' : 'Bot';
  if (isOnline() && app.myColor) {
    if (p === app.myColor) return colorName(p) + ' · sen';
    return app.peerOnline ? 'Rakip' : 'Rakip bekleniyor';
  }
  return colorName(p);
}

function fitCell() {
  const s = app.state;
  if (!s) return 20;
  if (app.zoom) return Math.min(MAX_CELL, Math.max(MIN_CELL, app.zoom));
  const r = el.boardWrap.getBoundingClientRect();
  const c = Math.floor(Math.min((r.width - 54) / (s.w + 1), (r.height - 54) / (s.h + 1)));
  return Math.min(MAX_CELL, Math.max(MIN_CELL, c));
}

function redraw() {
  if (!app.state) return;
  view.layout(app.state, fitCell());
  view.showHover = myTurn();
  view.draw();
}

function setOverlay(name) {
  app.overlay = name;
  $('overlaySetup').classList.toggle('hidden', name !== 'setup');
  $('overlayRules').classList.toggle('hidden', name !== 'rules');
  $('overlayOver').classList.toggle('hidden', name !== 'over');
}

function toast(text) {
  clearTimeout(toastTimer);
  el.toast.textContent = text;
  el.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), TOAST_MS);
}

function statusText(sc) {
  const s = app.state;
  if (isOnline() && !app.peerOnline) {
    return app.role === 'host' ? 'Rakip bekleniyor — oda linkini paylaş.' : 'Odaya bağlanılıyor…';
  }
  if (s.finished) {
    const res = s.resigned ? colorName(s.resigned) + ' pes etti. ' : '';
    return s.winner
      ? res + colorName(s.winner) + ' kazandı — ' + sc.red + '–' + sc.blue
      : res + 'Berabere — ' + sc.red + '–' + sc.blue;
  }
  if (app.mode === 'local') return 'Sıra ' + colorName(s.turn) + "'da. Bir kesişime dokun.";
  if (myTurn()) return 'Sıra sende. En iyi kuşatmayı ara.';
  return app.mode === 'bot' ? 'Bot düşünüyor…' : 'Rakip oynuyor…';
}

function turnPillText() {
  const s = app.state;
  if (s.finished) return 'Oyun bitti';
  if (isOnline() && !app.peerOnline) return 'Rakip bekleniyor';
  if (app.mode === 'local') return 'Sıra: ' + colorName(s.turn);
  if (myTurn()) return 'Sıra sende';
  return app.mode === 'bot' ? 'Bot düşünüyor' : 'Rakip oynuyor';
}

function canUndo() {
  if (!app.state || app.state.finished) return false;
  if (isOnline() && app.role === 'guest') return app.peerOnline && app.moves.length > 0;
  return app.history.length > 0;
}

function refresh() {
  if (!app.state) return;
  const s = app.state;
  const sc = scores(s);

  el.scoreRed.textContent = sc.red;
  el.scoreBlue.textContent = sc.blue;
  el.nameRed.textContent = labelFor(RED);
  el.nameBlue.textContent = labelFor(BLUE);

  const active = !s.finished && !app.busy && !(isOnline() && !app.peerOnline);
  const redTurn = active && s.turn === RED;
  const blueTurn = active && s.turn === BLUE;
  el.cardRed.classList.toggle('is-turn', redTurn);
  el.cardBlue.classList.toggle('is-turn', blueTurn);
  el.stateRed.textContent = redTurn ? 'Sırada' : 'Bekliyor';
  el.stateBlue.textContent = blueTurn ? 'Sırada' : 'Bekliyor';

  el.status.textContent = statusText(sc);

  el.turnPill.classList.remove('hidden');
  el.turnPill.classList.toggle('is-waiting', !myTurn());
  el.turnPillText.textContent = turnPillText();

  el.roomChip.classList.toggle('hidden', !isOnline());
  el.roomBox.classList.toggle('hidden', !isOnline());
  if (isOnline()) {
    const connLabel = app.peerOnline ? 'bağlı' : (app.role === 'host' ? 'rakip bekleniyor' : 'bağlanıyor…');
    el.chipCode.textContent = app.room || '------';
    el.chipLabel.textContent = connLabel;
    el.connDot.classList.toggle('waiting', !app.peerOnline);
    el.roomCode.textContent = app.room || '------';
    el.roomConnLabel.textContent = connLabel;
    el.roomConnDot.classList.toggle('waiting', !app.peerOnline);
    el.pingText.classList.toggle('hidden', !app.peerOnline || !app.ping);
    el.pingText.textContent = app.ping + ' ms';
  }

  const over = s.finished;
  $('btnPass').classList.toggle('hidden', over || !myTurn());
  $('btnUndo').classList.toggle('hidden', !canUndo());
  $('btnResign').classList.toggle('hidden', over || !(app.mode === 'local' || !!app.myColor));
  $('btnRematchBar').classList.toggle('hidden', !over);

  renderResult(sc);
  renderMoves();
  redraw();
}

function renderResult(sc) {
  const s = app.state;
  el.finalRed.textContent = sc.red;
  el.finalBlue.textContent = sc.blue;
  el.resultTitle.textContent = s.winner ? colorName(s.winner) + ' kazandı' : 'Berabere';
  if (s.resigned) {
    el.resultSub.textContent = colorName(s.resigned) + ' pes etti.';
  } else if (s.winner) {
    el.resultSub.textContent = colorName(s.winner) + ' ' + Math.abs(sc.red - sc.blue) + ' nokta farkla kazandı.';
  } else {
    el.resultSub.textContent = 'İki taraf da ' + sc.red + ' nokta kuşattı.';
  }
}

function renderMoves() {
  const key = app.moves.length + ':' + app.mode + ':' + (app.moves.length ? app.moves[app.moves.length - 1].coord : '');
  el.moveCount.textContent = app.moves.length;
  if (key === movesKey) return;
  movesKey = key;

  el.moveList.textContent = '';
  if (!app.moves.length) {
    const p = document.createElement('p');
    p.className = 'mv-empty';
    p.textContent = 'Henüz hamle yok. Tahtadaki bir kesişime dokunarak başla.';
    el.moveList.appendChild(p);
    return;
  }

  const total = app.moves.length;
  const frag = document.createDocumentFragment();
  for (let i = total - 1; i >= Math.max(0, total - MOVE_ROWS); i--) {
    const m = app.moves[i];
    const color = m.p === RED ? 'var(--red)' : 'var(--blue)';
    const row = document.createElement('div');
    row.className = 'mv-row';

    const n = document.createElement('span');
    n.className = 'mv-n';
    n.textContent = i + 1;

    const dot = document.createElement('span');
    dot.className = 'mv-dot';
    dot.style.background = color;

    const coord = document.createElement('span');
    coord.className = 'mv-coord';
    coord.textContent = m.coord;

    row.append(n, dot, coord);

    if (m.gain > 0) {
      const gain = document.createElement('span');
      gain.className = 'mv-gain';
      gain.style.color = color;
      gain.textContent = '+' + m.gain;
      row.appendChild(gain);
    }
    frag.appendChild(row);
  }
  el.moveList.appendChild(frag);
}

function commit(next, meta) {
  const before = scores(app.state);
  const after = scores(next);
  const gain = next.turn === BLUE ? after.red - before.red : after.blue - before.blue;
  app.moves = app.moves.concat([{
    p: app.state.turn,
    coord: meta === 'pass' ? 'pas' : coordLabel(next.lastMove.x, next.lastMove.y),
    gain: meta === 'pass' ? 0 : Math.max(0, gain),
  }]);
  app.history = app.history.concat([app.state]);
  app.state = next;
  broadcast();
  refresh();
  afterCommit();
}

function afterCommit() {
  if (app.state.finished) scheduleOver();
  else scheduleBot();
}

function scheduleOver() {
  if (app.overShown) return;
  app.overShown = true;
  clearTimeout(overTimer);
  overTimer = setTimeout(() => setOverlay('over'), OVER_DELAY);
}

function broadcast() {
  if (isOnline() && app.role === 'host' && app.net) {
    app.net.send({ t: 'state', s: encodeState(app.state), mv: app.moves });
  }
}

function scheduleBot() {
  if (app.mode !== 'bot' || !app.state || app.state.finished) return;
  if (app.state.turn === app.myColor) return;
  app.busy = true;
  refresh();
  clearTimeout(botTimer);
  botTimer = setTimeout(() => {
    const cur = app.state;
    app.busy = false;
    if (!cur || cur.finished) { refresh(); return; }
    const mv = pickBotMove(cur);
    const next = mv ? play(cur, mv.x, mv.y) : pass(cur);
    if (next) commit(next, mv ? 'move' : 'pass');
    else refresh();
  }, BOT_DELAY);
}

function requestMove(x, y) {
  if (!myTurn()) return;
  if (isOnline() && app.role === 'guest') {
    app.net.send({ t: 'move', x, y });
    return;
  }
  const next = play(app.state, x, y);
  if (next) commit(next, 'move');
}

function doPass() {
  if (!myTurn()) return;
  if (isOnline() && app.role === 'guest') {
    app.net.send({ t: 'pass' });
    return;
  }
  const next = pass(app.state);
  if (next) commit(next, 'pass');
}

function doResign() {
  if (!app.state || app.state.finished) return;
  if (isOnline() && app.role === 'guest') {
    app.net.send({ t: 'resign' });
    return;
  }
  const who = app.mode === 'local' ? app.state.turn : app.myColor;
  if (!who) return;
  const next = resign(app.state, who);
  if (!next) return;
  app.history = app.history.concat([app.state]);
  app.state = next;
  broadcast();
  refresh();
  scheduleOver();
}

function doUndo() {
  if (!canUndo()) return;
  if (isOnline() && app.role === 'guest') {
    app.net.send({ t: 'undo' });
    return;
  }
  clearTimeout(botTimer);
  clearTimeout(overTimer);
  let steps = app.mode === 'local' ? 1 : 2;
  while (steps > 0 && app.history.length) {
    app.state = app.history.pop();
    app.moves.pop();
    steps--;
  }
  app.busy = false;
  app.overShown = false;
  if (app.overlay === 'over') setOverlay(null);
  broadcast();
  refresh();
}

function newGame(w, h) {
  clearTimeout(botTimer);
  clearTimeout(overTimer);
  app.state = createState(w, h);
  app.history = [];
  app.moves = [];
  app.busy = false;
  app.zoom = null;
  app.overShown = false;
  setOverlay(null);
  broadcast();
  refresh();
  scheduleBot();
}

function doRematch() {
  if (isOnline() && app.role === 'guest') {
    app.net.send({ t: 'restart' });
    setOverlay(null);
    return;
  }
  newGame(app.state.w, app.state.h);
}

el.board.addEventListener('mousemove', (e) => {
  const g = view.toGrid(e.clientX, e.clientY);
  const changed = (g && view.hover) ? (g.x !== view.hover.x || g.y !== view.hover.y) : (g !== view.hover);
  view.hover = g;
  if (changed) view.draw();
});

el.board.addEventListener('mouseleave', () => {
  view.hover = null;
  view.draw();
});

el.board.addEventListener('click', (e) => {
  const g = view.toGrid(e.clientX, e.clientY);
  if (g) requestMove(g.x, g.y);
});

$('btnPass').addEventListener('click', doPass);
$('btnUndo').addEventListener('click', doUndo);
$('btnResign').addEventListener('click', doResign);
$('btnRematchBar').addEventListener('click', doRematch);
$('btnRematch').addEventListener('click', doRematch);
$('btnInspect').addEventListener('click', () => setOverlay(null));

$('btnRules').addEventListener('click', () => setOverlay('rules'));
$('btnCloseRules').addEventListener('click', () => setOverlay(null));
$('btnGotIt').addEventListener('click', () => setOverlay(null));
$('btnSetup').addEventListener('click', openSetup);
$('btnCloseSetup').addEventListener('click', () => setOverlay(null));

$('btnZoomIn').addEventListener('click', () => { app.zoom = Math.min(MAX_CELL, fitCell() + 4); redraw(); });
$('btnZoomOut').addEventListener('click', () => { app.zoom = Math.max(MIN_CELL, fitCell() - 4); redraw(); });
$('btnZoomFit').addEventListener('click', () => { app.zoom = null; redraw(); });

window.addEventListener('resize', redraw);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.overlay) setOverlay(null);
});

el.modeGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  app.setupMode = btn.dataset.mode;
  [...el.modeGrid.children].forEach((b) => b.classList.toggle('on', b === btn));
  syncSetupMode();
});

function syncSetupMode() {
  const online = app.setupMode === 'online';
  el.onlineBlock.classList.toggle('hidden', !online);
  el.startRow.classList.toggle('hidden', online);
  el.roomClosed.classList.toggle('hidden', online && app.roomOpen);
  el.roomOpen.classList.toggle('hidden', !(online && app.roomOpen));
  $('btnResize').classList.toggle('hidden', app.role !== 'host');
}

el.sizeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-w]');
  if (!btn) return;
  el.inpW.value = btn.dataset.w;
  el.inpH.value = btn.dataset.h;
  markSizePreset();
});

[el.inpW, el.inpH].forEach((inp) => inp.addEventListener('input', markSizePreset));

function markSizePreset() {
  const { w, h } = boardSize();
  [...el.sizeSeg.children].forEach((b) => {
    b.classList.toggle('on', Number(b.dataset.w) === w && Number(b.dataset.h) === h);
  });
}

function openSetup() {
  app.setupMode = app.mode;
  [...el.modeGrid.children].forEach((b) => b.classList.toggle('on', b.dataset.mode === app.setupMode));
  resetCopyLabels();
  markSizePreset();
  syncSetupMode();
  setOverlay('setup');
}

$('btnStart').addEventListener('click', () => {
  const { w, h } = boardSize();
  leaveRoom();
  app.mode = app.setupMode === 'bot' ? 'bot' : 'local';
  app.myColor = app.mode === 'bot' ? RED : 0;
  newGame(w, h);
});

$('btnHost').addEventListener('click', () => startOnline('host', makeRoomCode()));

$('btnJoin').addEventListener('click', () => {
  const code = el.inpRoom.value.trim().toUpperCase();
  if (code.length < 4) {
    app.roomOpen = true;
    syncSetupMode();
    el.roomHint.textContent = 'Geçerli bir oda kodu gir (en az 4 karakter).';
    return;
  }
  startOnline('guest', code);
});

el.inpRoom.addEventListener('input', () => {
  el.inpRoom.value = el.inpRoom.value.toUpperCase().slice(0, 6);
});

for (const btn of [$('btnCopyPanel'), $('btnCopyModal')]) {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el.shareLink.value);
    } catch (err) {
      el.shareLink.select();
    }
    clearTimeout(copyTimer);
    $('btnCopyPanel').textContent = 'Kopyalandı';
    $('btnCopyModal').textContent = 'Kopyalandı';
    copyTimer = setTimeout(resetCopyLabels, COPY_MS);
  });
}

function resetCopyLabels() {
  $('btnCopyPanel').textContent = 'Linki kopyala';
  $('btnCopyModal').textContent = 'Linki kopyala';
}

document.querySelector('.quick').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-say]');
  if (!btn || !app.net) return;
  app.net.send({ t: 'say', text: btn.dataset.say });
  toast('Rakibe gönderildi: “' + btn.dataset.say + '”');
});

$('btnLeave').addEventListener('click', () => {
  leaveRoom();
  app.mode = 'local';
  app.setupMode = 'local';
  app.myColor = 0;
  [...el.modeGrid.children].forEach((b) => b.classList.toggle('on', b.dataset.mode === 'local'));
  syncSetupMode();
  newGame(boardSize().w, boardSize().h);
  setOverlay('setup');
});

$('btnResize').addEventListener('click', () => {
  if (app.role !== 'host') return;
  const { w, h } = boardSize();
  newGame(w, h);
});

function leaveRoom() {
  clearTimeout(botTimer);
  if (app.net) {
    app.net.close();
    app.net = null;
  }
  app.role = null;
  app.room = null;
  app.roomOpen = false;
  app.peerOnline = false;
  app.peerMc = null;
  app.staleTicks = 0;
  app.ping = 0;
}

async function startOnline(role, code) {
  leaveRoom();
  app.mode = 'online';
  app.role = role;
  app.room = code;
  app.roomOpen = true;
  app.myColor = role === 'host' ? RED : BLUE;
  app.zoom = null;
  app.busy = false;
  app.overShown = false;

  const { w, h } = boardSize();
  app.state = createState(w, h);
  app.history = [];
  app.moves = [];

  el.roomCodeBig.textContent = code;
  el.shareLink.value = `${location.origin}${location.pathname}?room=${code}`;
  el.roomHint.textContent = 'Aktarım sunucusuna bağlanılıyor…';
  resetCopyLabels();
  syncSetupMode();
  setOverlay('setup');
  refresh();

  app.net = new Net(code, { onMessage: handleMessage, onStatus: () => {} });
  try {
    await app.net.connect();
  } catch (err) {
    app.net = null;
    el.roomHint.textContent = 'Bağlanılamadı. Ağ engelliyor olabilir, tekrar dene.';
    return;
  }

  el.roomHint.textContent = role === 'host'
    ? 'Linki arkadaşına gönder — o açtığı an oyun başlar.'
    : 'Odaya girildi, oyun durumu bekleniyor…';
  syncSetupMode();

  if (role === 'guest') app.net.send({ t: 'hello' });
  else broadcast();
  sendPing();
  refresh();
}

function markPeer() {
  app.peerAt = Date.now();
  if (app.peerOnline) return;
  app.peerOnline = true;
  el.roomHint.textContent = 'Rakip bağlandı.';
  if (app.overlay === 'setup') setOverlay(null);
  toast('Rakip odaya katıldı');
}

function applyRemoteState(msg) {
  app.state = decodeState(msg.s);
  app.moves = Array.isArray(msg.mv) ? msg.mv : [];
  app.peerMc = app.state.moveCount;
  app.staleTicks = 0;
  if (!app.state.finished) {
    app.overShown = false;
    if (app.overlay === 'over') setOverlay(null);
  }
  refresh();
  if (app.state.finished) scheduleOver();
}

function handleMessage(msg) {
  markPeer();

  if (msg.t === 'bye') {
    app.peerOnline = false;
    refresh();
    return;
  }
  if (msg.t === 'pong') {
    if (msg.ts) app.ping = Math.max(1, Date.now() - msg.ts);
    refresh();
    return;
  }
  if (msg.t === 'ping') {
    app.peerMc = msg.mc;
    app.net.send({ t: 'pong', ts: msg.ts });
    if (msg.mc !== app.state.moveCount) {
      if (app.role === 'host') broadcast();
      else app.net.send({ t: 'hello' });
    }
    refresh();
    return;
  }
  if (msg.t === 'say') {
    toast('Rakip: “' + String(msg.text || '').slice(0, 60) + '”');
    return;
  }

  if (app.role === 'guest') {
    if (msg.t === 'state') applyRemoteState(msg);
    return;
  }

  if (msg.t === 'hello') {
    broadcast();
    refresh();
    return;
  }
  if (msg.t === 'move') {
    if (app.state.turn !== BLUE || app.state.finished) return;
    const next = play(app.state, msg.x, msg.y);
    if (next) commit(next, 'move');
    return;
  }
  if (msg.t === 'pass') {
    if (app.state.turn !== BLUE || app.state.finished) return;
    const next = pass(app.state);
    if (next) commit(next, 'pass');
    return;
  }
  if (msg.t === 'resign') {
    const next = resign(app.state, BLUE);
    if (!next) return;
    app.history = app.history.concat([app.state]);
    app.state = next;
    broadcast();
    refresh();
    scheduleOver();
    return;
  }
  if (msg.t === 'undo') {
    doUndo();
    return;
  }
  if (msg.t === 'restart') {
    newGame(app.state.w, app.state.h);
  }
}

function sendPing() {
  if (!isOnline() || !app.net || !app.state) return;
  app.net.send({ t: 'ping', mc: app.state.moveCount, ts: Date.now() });
}

async function rejoin() {
  if (!isOnline() || !app.room) return;
  const room = app.room;
  const role = app.role;
  if (app.net) app.net.close(true);
  app.net = new Net(room, { onMessage: handleMessage, onStatus: () => {} });
  try {
    await app.net.connect();
  } catch (err) {
    app.net = null;
    return;
  }
  if (role === 'guest') app.net.send({ t: 'hello' });
  else broadcast();
  sendPing();
}

setInterval(() => {
  sendPing();
  if (!isOnline()) return;
  if (app.peerOnline && Date.now() - app.peerAt > PEER_TIMEOUT) {
    app.peerOnline = false;
    app.peerMc = null;
    app.staleTicks = 0;
    refresh();
    return;
  }
  if (app.peerOnline && app.peerMc !== null && app.peerMc !== app.state.moveCount) {
    app.staleTicks++;
    if (app.staleTicks >= STALE_LIMIT) {
      app.staleTicks = 0;
      rejoin();
    }
  } else {
    app.staleTicks = 0;
  }
}, PING_EVERY);

function boot() {
  markSizePreset();
  const room = new URLSearchParams(location.search).get('room');
  if (room) {
    app.setupMode = 'online';
    [...el.modeGrid.children].forEach((b) => b.classList.toggle('on', b.dataset.mode === 'online'));
    el.inpRoom.value = room.toUpperCase().slice(0, 6);
    startOnline('guest', room.toUpperCase().slice(0, 6));
    return;
  }
  app.state = createState(39, 32);
  refresh();
  openSetup();
}

boot();
