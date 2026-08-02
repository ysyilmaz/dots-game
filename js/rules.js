export const EMPTY = 0;
export const RED = 1;
export const BLUE = 2;

const DIRS8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export function opponent(p) {
  return p === RED ? BLUE : RED;
}

export function createState(w, h) {
  return {
    w,
    h,
    owner: new Array(w * h).fill(EMPTY),
    terr: new Array(w * h).fill(EMPTY),
    turn: RED,
    passes: 0,
    moveCount: 0,
    captures: [],
    lastMove: null,
    finished: false,
    winner: 0,
    resigned: 0,
  };
}

export function cloneState(s) {
  return {
    w: s.w,
    h: s.h,
    owner: s.owner.slice(),
    terr: s.terr.slice(),
    turn: s.turn,
    passes: s.passes,
    moveCount: s.moveCount,
    captures: s.captures.map((c) => ({ player: c.player, cells: c.cells.slice(), polygon: c.polygon })),
    lastMove: s.lastMove ? { x: s.lastMove.x, y: s.lastMove.y } : null,
    finished: s.finished,
    winner: s.winner,
    resigned: s.resigned,
  };
}

export function canPlay(s, x, y) {
  if (s.finished) return false;
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false;
  const i = y * s.w + x;
  return s.owner[i] === EMPTY && s.terr[i] === EMPTY;
}

export function hasMoves(s) {
  for (let i = 0; i < s.owner.length; i++) {
    if (s.owner[i] === EMPTY && s.terr[i] === EMPTY) return true;
  }
  return false;
}

export function scores(s) {
  let red = 0;
  let blue = 0;
  for (let i = 0; i < s.owner.length; i++) {
    const o = s.owner[i];
    const t = s.terr[i];
    if (o === EMPTY || t === EMPTY || t === o) continue;
    if (t === RED) red++;
    else blue++;
  }
  return { red, blue };
}

function settleEnd(s) {
  s.finished = true;
  const sc = scores(s);
  s.winner = sc.red > sc.blue ? RED : sc.blue > sc.red ? BLUE : 0;
}

export function play(s, x, y) {
  if (!canPlay(s, x, y)) return null;
  const n = cloneState(s);
  const p = n.turn;
  n.owner[y * n.w + x] = p;
  n.lastMove = { x, y };
  n.passes = 0;
  n.moveCount++;

  const found = findCaptures(n, p);
  for (const c of found) {
    for (const i of c.cells) n.terr[i] = p;
  }
  if (found.length) {
    n.captures = n.captures.filter((c) => c.cells.some((i) => n.terr[i] === c.player));
    n.captures.push(...found);
  }

  n.turn = opponent(p);
  if (!hasMoves(n)) settleEnd(n);
  return n;
}

export function pass(s) {
  if (s.finished) return null;
  const n = cloneState(s);
  n.passes++;
  n.moveCount++;
  n.turn = opponent(n.turn);
  if (n.passes >= 2 || !hasMoves(n)) settleEnd(n);
  return n;
}

export function resign(s, player) {
  if (s.finished) return null;
  const n = cloneState(s);
  n.finished = true;
  n.resigned = player;
  n.winner = opponent(player);
  return n;
}

export function captureGain(s, x, y) {
  if (!canPlay(s, x, y)) return -1;
  const p = s.turn;
  const owner = s.owner.slice();
  const terr = s.terr.slice();
  owner[y * s.w + x] = p;
  const probe = { w: s.w, h: s.h, owner, terr };
  const found = findCaptures(probe, p);
  const opp = opponent(p);
  let gain = 0;
  for (const c of found) {
    for (const i of c.cells) {
      if (owner[i] === opp && terr[i] !== p) gain++;
    }
  }
  return gain;
}

function findCaptures(s, p) {
  const { w, h, owner, terr } = s;
  const n = w * h;
  const wall = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (owner[i] === p && terr[i] === EMPTY) wall[i] = 1;
  }

  const outside = new Uint8Array(n);
  const stack = [];
  const seed = (i) => {
    if (!wall[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }

  const opp = opponent(p);
  const seen = new Uint8Array(n);
  const result = [];
  for (let start = 0; start < n; start++) {
    if (wall[start] || outside[start] || seen[start]) continue;
    const cells = [];
    const queue = [start];
    seen[start] = 1;
    let valid = false;
    while (queue.length) {
      const i = queue.pop();
      cells.push(i);
      if (owner[i] === opp && terr[i] !== p) valid = true;
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0 && !wall[i - 1] && !outside[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue.push(i - 1); }
      if (x < w - 1 && !wall[i + 1] && !outside[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue.push(i + 1); }
      if (y > 0 && !wall[i - w] && !outside[i - w] && !seen[i - w]) { seen[i - w] = 1; queue.push(i - w); }
      if (y < h - 1 && !wall[i + w] && !outside[i + w] && !seen[i + w]) { seen[i + w] = 1; queue.push(i + w); }
    }
    if (!valid) continue;
    result.push({ player: p, cells, polygon: traceChain(w, h, wall, cells) });
  }
  return result;
}

function traceChain(w, h, wall, cells) {
  const n = w * h;
  const inChain = new Uint8Array(n);
  const chain = [];
  for (const i of cells) {
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (wall[j] && !inChain[j]) {
        inChain[j] = 1;
        chain.push(j);
      }
    }
  }
  if (chain.length < 4) return null;

  let start = chain[0];
  for (const i of chain) if (i < start) start = i;

  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : inChain[y * w + x]);
  const dirIndex = (dx, dy) => DIRS8.findIndex((d) => d[0] === dx && d[1] === dy);

  const poly = [];
  let cx = start % w;
  let cy = (start / w) | 0;
  let bx = cx - 1;
  let by = cy;
  const limit = chain.length * 8 + 32;

  for (let step = 0; step < limit; step++) {
    poly.push([cx, cy]);
    const d0 = dirIndex(bx - cx, by - cy);
    if (d0 < 0) break;
    let px = bx;
    let py = by;
    let moved = false;
    for (let k = 1; k <= 8; k++) {
      const d = DIRS8[(d0 + k) % 8];
      const nx = cx + d[0];
      const ny = cy + d[1];
      if (at(nx, ny)) {
        bx = px;
        by = py;
        cx = nx;
        cy = ny;
        moved = true;
        break;
      }
      px = nx;
      py = ny;
    }
    if (!moved) break;
    if (cx + cy * w === start) break;
  }

  return poly.length >= 3 ? poly : null;
}

export function encodeState(s) {
  return {
    w: s.w,
    h: s.h,
    o: s.owner.join(''),
    t: s.terr.join(''),
    tu: s.turn,
    pa: s.passes,
    mc: s.moveCount,
    ca: s.captures.map((c) => ({ p: c.player, c: c.cells, g: c.polygon })),
    lm: s.lastMove,
    fi: s.finished,
    wi: s.winner,
    re: s.resigned,
  };
}

export function decodeState(d) {
  return {
    w: d.w,
    h: d.h,
    owner: Array.from(d.o, Number),
    terr: Array.from(d.t, Number),
    turn: d.tu,
    passes: d.pa,
    moveCount: d.mc,
    captures: (d.ca || []).map((c) => ({ player: c.p, cells: c.c, polygon: c.g })),
    lastMove: d.lm || null,
    finished: !!d.fi,
    winner: d.wi || 0,
    resigned: d.re || 0,
  };
}
