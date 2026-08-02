import { RED, BLUE, createState, play, pass, resign, scores, opponent, encodeState, decodeState } from './rules.js';
import { BoardView } from './render.js';
import { Net, makeRoomCode } from './net.js';
import { pickBotMove } from './bot.js';

const $ = (id) => document.getElementById(id);

const MIN_CELL = 10;
const MAX_CELL = 40;
const PEER_TIMEOUT = 24000;
const PING_EVERY = 7000;

const el = {
  overlay: $('overlay'),
  status: $('status'),
  board: $('board'),
  boardWrap: $('boardWrap'),
  scoreRed: $('scoreRed'),
  scoreBlue: $('scoreBlue'),
  nameRed: $('nameRed'),
  nameBlue: $('nameBlue'),
  sideRed: $('sideRed'),
  sideBlue: $('sideBlue'),
  modeSeg: $('modeSeg'),
  sizeSeg: $('sizeSeg'),
  sizeField: $('sizeField'),
  onlineField: $('onlineField'),
  roomBox: $('roomBox'),
  roomCode: $('roomCode'),
  roomHint: $('roomHint'),
  roomActions: $('roomActions'),
  shareLink: $('shareLink'),
  inpW: $('inpW'),
  inpH: $('inpH'),
  inpRoom: $('inpRoom'),
};

const view = new BoardView(el.board);

const app = {
  mode: 'local',
  setupMode: 'local',
  role: null,
  myColor: 0,
  state: null,
  history: [],
  net: null,
  room: null,
  peerAt: 0,
  peerOnline: false,
  zoom: null,
  busy: false,
};

const boardSize = () => ({
  w: clampInt(el.inpW.value, 5, 120, 39),
  h: clampInt(el.inpH.value, 5, 120, 32),
});

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isOnline() {
  return app.mode === 'online';
}

function myTurn() {
  if (!app.state || app.state.finished) return false;
  if (app.mode === 'local') return true;
  if (!app.myColor) return false;
  if (isOnline() && !app.peerOnline) return false;
  return app.state.turn === app.myColor;
}

function colorName(p) {
  return p === RED ? 'Kırmızı' : 'Mavi';
}

function fitCell() {
  if (!app.state) return 20;
  if (app.zoom) return Math.min(MAX_CELL, Math.max(MIN_CELL, app.zoom));
  const rect = el.boardWrap.getBoundingClientRect();
  const availW = rect.width - 30;
  const availH = rect.height - 30;
  const c = Math.floor(Math.min(availW / (app.state.w + 1), availH / (app.state.h + 1)));
  return Math.min(MAX_CELL, Math.max(MIN_CELL, c));
}

function redraw() {
  if (!app.state) return;
  view.layout(app.state, fitCell());
  view.showHover = myTurn();
  view.draw();
}

function refresh() {
  if (!app.state) return;
  const sc = scores(app.state);
  el.scoreRed.textContent = sc.red;
  el.scoreBlue.textContent = sc.blue;
  el.sideRed.classList.toggle('active', !app.state.finished && app.state.turn === RED);
  el.sideBlue.classList.toggle('active', !app.state.finished && app.state.turn === BLUE);

  el.nameRed.textContent = labelFor(RED);
  el.nameBlue.textContent = labelFor(BLUE);

  el.status.textContent = statusText(sc);

  const idle = !app.state || app.state.finished;
  $('btnPass').disabled = idle || !myTurn();
  $('btnResign').disabled = idle || (isOnline() && !app.myColor);
  $('btnUndo').disabled = app.mode === 'local' || app.mode === 'bot'
    ? app.history.length === 0
    : !isOnline() || !app.peerOnline;

  redraw();
}

function labelFor(p) {
  if (app.mode === 'bot') return p === app.myColor ? 'Sen' : 'Bot';
  if (isOnline() && app.myColor) return p === app.myColor ? colorName(p) + ' (sen)' : colorName(p);
  return colorName(p);
}

function statusText(sc) {
  const s = app.state;
  if (isOnline() && !app.peerOnline) {
    return app.role === 'host'
      ? `Oda ${app.room} — rakip bekleniyor. Linki arkadaşına gönder.`
      : `Oda ${app.room} — bağlanılıyor…`;
  }
  if (s.finished) {
    const res = s.resigned ? `${colorName(s.resigned)} pes etti. ` : '';
    if (!s.winner) return `${res}Oyun bitti — berabere (${sc.red}–${sc.blue}).`;
    return `${res}Oyun bitti — ${colorName(s.winner)} kazandı (${sc.red}–${sc.blue}).`;
  }
  const who = colorName(s.turn);
  if (app.mode === 'local') return `Sıra: ${who}`;
  if (s.turn === app.myColor) return `Sıra sende (${who})`;
  return app.mode === 'bot' ? 'Bot düşünüyor…' : `Sıra rakipte (${who})`;
}

function commit(next) {
  app.history.push(app.state);
  app.state = next;
  broadcast();
  refresh();
}

function broadcast() {
  if (isOnline() && app.role === 'host' && app.net) {
    app.net.send({ t: 'state', s: encodeState(app.state) });
  }
}

function requestMove(x, y) {
  if (!myTurn() || app.busy) return;
  if (isOnline() && app.role === 'guest') {
    app.net.send({ t: 'move', x, y });
    return;
  }
  const next = play(app.state, x, y);
  if (!next) return;
  commit(next);
  scheduleBot();
}

function scheduleBot() {
  if (app.mode !== 'bot' || !app.state || app.state.finished) return;
  if (app.state.turn === app.myColor) return;
  app.busy = true;
  refresh();
  setTimeout(() => {
    const mv = pickBotMove(app.state);
    const next = mv ? play(app.state, mv.x, mv.y) : pass(app.state);
    app.busy = false;
    if (next) commit(next);
    else refresh();
  }, 220);
}

function doPass() {
  if (!myTurn()) return;
  if (isOnline() && app.role === 'guest') {
    app.net.send({ t: 'pass' });
    return;
  }
  const next = pass(app.state);
  if (next) commit(next);
  scheduleBot();
}

function doResign() {
  if (!app.state || app.state.finished) return;
  const who = app.mode === 'local' ? app.state.turn : app.myColor;
  if (!who) return;
  if (isOnline() && app.role === 'guest') {
    app.net.send({ t: 'resign' });
    return;
  }
  const next = resign(app.state, who);
  if (next) commit(next);
}

function doUndo(steps) {
  if (isOnline() && app.role === 'guest') {
    app.net.send({ t: 'undo' });
    return;
  }
  let n = steps;
  while (n > 0 && app.history.length) {
    app.state = app.history.pop();
    n--;
  }
  app.busy = false;
  broadcast();
  refresh();
}

function newGame(w, h) {
  app.state = createState(w, h);
  app.history = [];
  app.busy = false;
  broadcast();
  refresh();
  scheduleBot();
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
$('btnResign').addEventListener('click', doResign);
$('btnUndo').addEventListener('click', () => doUndo(app.mode === 'bot' ? 2 : 1));
$('btnSetup').addEventListener('click', openSetup);
$('btnCloseSetup').addEventListener('click', () => el.overlay.classList.add('hidden'));

$('btnZoomIn').addEventListener('click', () => { app.zoom = Math.min(MAX_CELL, fitCell() + 4); redraw(); });
$('btnZoomOut').addEventListener('click', () => { app.zoom = Math.max(MIN_CELL, fitCell() - 4); redraw(); });
$('btnZoomFit').addEventListener('click', () => { app.zoom = null; redraw(); });

window.addEventListener('resize', redraw);

el.modeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  app.setupMode = btn.dataset.mode;
  [...el.modeSeg.children].forEach((b) => b.classList.toggle('on', b === btn));
  const online = app.setupMode === 'online';
  el.onlineField.classList.toggle('hidden', !online);
  $('btnStart').classList.toggle('hidden', online);
});

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

$('btnStart').addEventListener('click', () => {
  const { w, h } = boardSize();
  leaveRoom();
  app.mode = app.setupMode === 'bot' ? 'bot' : 'local';
  app.myColor = app.mode === 'bot' ? RED : 0;
  app.zoom = null;
  el.overlay.classList.add('hidden');
  newGame(w, h);
});

$('btnHost').addEventListener('click', () => startOnline('host', makeRoomCode()));
$('btnJoin').addEventListener('click', () => {
  const code = el.inpRoom.value.trim().toUpperCase();
  if (code.length < 4) {
    el.roomHint.textContent = 'Geçerli bir oda kodu gir.';
    el.roomBox.classList.remove('hidden');
    return;
  }
  startOnline('guest', code);
});

$('btnCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.shareLink.value);
    $('btnCopy').textContent = 'Kopyalandı';
    setTimeout(() => { $('btnCopy').textContent = 'Kopyala'; }, 1500);
  } catch (err) {
    el.shareLink.select();
  }
});

$('btnRestart').addEventListener('click', () => {
  if (app.role === 'guest') {
    app.net.send({ t: 'restart' });
  } else {
    const { w, h } = boardSize();
    newGame(w, h);
  }
  el.overlay.classList.add('hidden');
});

$('btnLeave').addEventListener('click', () => {
  leaveRoom();
  app.mode = 'local';
  app.myColor = 0;
  el.roomBox.classList.add('hidden');
  newGame(boardSize().w, boardSize().h);
});

function openSetup() {
  el.overlay.classList.remove('hidden');
  markSizePreset();
}

function leaveRoom() {
  if (app.net) {
    app.net.close();
    app.net = null;
  }
  app.role = null;
  app.room = null;
  app.peerOnline = false;
  el.roomActions.classList.add('hidden');
}

async function startOnline(role, code) {
  leaveRoom();
  app.mode = 'online';
  app.role = role;
  app.room = code;
  app.myColor = role === 'host' ? RED : BLUE;
  app.zoom = null;
  app.peerOnline = false;

  el.roomBox.classList.remove('hidden');
  el.roomCode.textContent = code;
  el.shareLink.value = `${location.origin}${location.pathname}?room=${code}`;
  el.roomHint.textContent = 'Aktarım sunucusuna bağlanılıyor…';

  if (role === 'host') {
    const { w, h } = boardSize();
    app.state = createState(w, h);
    app.history = [];
  } else if (!app.state) {
    app.state = createState(boardSize().w, boardSize().h);
    app.history = [];
  }
  refresh();

  app.net = new Net(code, { onMessage: handleMessage, onStatus: () => {} });
  try {
    await app.net.connect();
  } catch (err) {
    el.roomHint.textContent = 'Bağlanılamadı. Ağ engelliyor olabilir, tekrar dene.';
    app.net = null;
    return;
  }

  el.roomHint.textContent = role === 'host'
    ? 'Bu linki arkadaşına gönder, açtığında oyun başlar.'
    : 'Odaya girildi, oyun durumu bekleniyor…';
  el.roomActions.classList.remove('hidden');

  if (role === 'guest') app.net.send({ t: 'hello' });
  else app.net.send({ t: 'state', s: encodeState(app.state) });

  refresh();
}

function markPeer() {
  app.peerAt = Date.now();
  if (!app.peerOnline) {
    app.peerOnline = true;
    el.overlay.classList.add('hidden');
    el.roomHint.textContent = 'Rakip bağlandı.';
  }
}

function handleMessage(msg) {
  markPeer();
  if (msg.t === 'bye') {
    app.peerOnline = false;
    refresh();
    return;
  }
  if (msg.t === 'ping') {
    if (app.role === 'host') broadcast();
    refresh();
    return;
  }

  if (app.role === 'guest') {
    if (msg.t === 'state') {
      app.state = decodeState(msg.s);
      refresh();
    }
    return;
  }

  if (msg.t === 'hello') {
    broadcast();
    refresh();
    return;
  }
  if (msg.t === 'move') {
    if (app.state.turn !== BLUE) return;
    const next = play(app.state, msg.x, msg.y);
    if (next) commit(next);
    return;
  }
  if (msg.t === 'pass') {
    if (app.state.turn !== BLUE) return;
    const next = pass(app.state);
    if (next) commit(next);
    return;
  }
  if (msg.t === 'resign') {
    const next = resign(app.state, BLUE);
    if (next) commit(next);
    return;
  }
  if (msg.t === 'undo') {
    doUndo(1);
    return;
  }
  if (msg.t === 'restart') {
    const { w, h } = boardSize();
    newGame(w, h);
  }
}

setInterval(() => {
  if (!isOnline() || !app.net) return;
  app.net.send({ t: 'ping' });
  if (app.peerOnline && Date.now() - app.peerAt > PEER_TIMEOUT) {
    app.peerOnline = false;
    refresh();
  }
}, PING_EVERY);

function boot() {
  markSizePreset();
  const room = new URLSearchParams(location.search).get('room');
  if (room) {
    app.setupMode = 'online';
    [...el.modeSeg.children].forEach((b) => b.classList.toggle('on', b.dataset.mode === 'online'));
    el.onlineField.classList.remove('hidden');
    $('btnStart').classList.add('hidden');
    el.inpRoom.value = room.toUpperCase();
    startOnline('guest', room.toUpperCase());
    return;
  }
  app.state = createState(39, 32);
  refresh();
  openSetup();
}

boot();
