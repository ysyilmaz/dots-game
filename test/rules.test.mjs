import { createState, play, scores, RED, encodeState, decodeState, canPlay } from '../js/rules.js';

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}

function run(w, h, moves) {
  let s = createState(w, h);
  for (const [x, y] of moves) {
    const n = play(s, x, y);
    if (!n) throw new Error(`illegal move ${x},${y} (turn ${s.turn})`);
    s = n;
  }
  return s;
}

console.log('1) diamond capture of one blue dot');
{
  const s = run(7, 7, [[1,0],[1,1],[0,1],[6,6],[2,1],[6,5],[1,2]]);
  const sc = scores(s);
  check('red scores 1', sc.red === 1, sc);
  check('blue scores 0', sc.blue === 0, sc);
  check('captured cell marked', s.terr[1 * 7 + 1] === RED);
  check('polygon traced', !!(s.captures[0] && s.captures[0].polygon && s.captures[0].polygon.length >= 3), s.captures[0] && s.captures[0].polygon);
  check('inside cell not playable', !canPlay(s, 1, 1));
}

console.log('2) empty enclosure scores nothing');
{
  const s = run(7, 7, [[1,0],[6,6],[0,1],[6,5],[2,1],[6,4],[1,2]]);
  const sc = scores(s);
  check('no score', sc.red === 0 && sc.blue === 0, sc);
  check('no captures', s.captures.length === 0);
  check('empty cell still playable', canPlay(s, 1, 1));
}

console.log('3) leak through a 4-dir gap -> no capture');
{
  const s = run(7, 7, [[1,0],[1,1],[0,1],[6,6],[2,1],[6,5],[3,3]]);
  const sc = scores(s);
  check('no score (bottom open)', sc.red === 0, sc);
}

console.log('4) diagonal-only ring of 8, own dot inside stays free');
{
  const s = run(9, 9, [
    [2,4],[4,4],[3,3],[3,4],[4,2],[8,8],[5,3],[8,7],[6,4],[8,6],
    [5,5],[8,5],[4,6],[8,4],[5,4],[8,3],[3,5],
  ]);
  const sc = scores(s);
  check('red captures both blue dots', sc.red === 2, sc);
  check('one region', s.captures.length === 1, s.captures.length);
  check('own red dot inside is not captured', s.terr[4 * 9 + 5] === 0, s.terr[4 * 9 + 5]);
  check('polygon has 8+ points', s.captures[0].polygon.length >= 8, s.captures[0].polygon);
}

console.log('5) board edge is not a wall');
{
  const s = run(7, 7, [[1,0],[0,0],[0,1],[6,6],[1,1],[6,5],[2,2]]);
  const sc = scores(s);
  check('corner not capturable via edge', sc.red === 0, sc);
  check('blue corner dot alive', s.terr[0] === 0);
}

console.log('6) two separate regions captured in one move');
{
  const moves = [
    [1,0],[1,1],[0,1],[3,1],[1,2],[8,8],[3,0],[8,7],[4,1],[8,6],[3,2],[8,5],[2,1],
  ];
  const s = run(9, 9, moves);
  const sc = scores(s);
  check('red scores 2 across 2 regions', sc.red === 2, { sc, caps: s.captures.length });
  check('two capture records', s.captures.length === 2, s.captures.length);
}

console.log('7) encode/decode roundtrip');
{
  const s = run(7, 7, [[1,0],[1,1],[0,1],[6,6],[2,1],[6,5],[1,2]]);
  const r = decodeState(JSON.parse(JSON.stringify(encodeState(s))));
  check('owner equal', JSON.stringify(r.owner) === JSON.stringify(s.owner));
  check('terr equal', JSON.stringify(r.terr) === JSON.stringify(s.terr));
  check('turn equal', r.turn === s.turn);
  check('scores equal', JSON.stringify(scores(r)) === JSON.stringify(scores(s)));
  check('captures equal', JSON.stringify(r.captures) === JSON.stringify(s.captures));
}

console.log('8) big board fill performance + termination');
{
  const t0 = process.hrtime.bigint();
  let s = createState(39, 32);
  let guard = 0;
  while (!s.finished && guard < 39 * 32 + 10) {
    let placed = false;
    for (let i = 0; i < s.owner.length && !placed; i++) {
      const x = i % s.w, y = (i / s.w) | 0;
      if (canPlay(s, x, y)) { s = play(s, x, y); placed = true; }
    }
    if (!placed) break;
    guard++;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check('game terminates when board is full', s.finished, { moveCount: s.moveCount, guard });
  check('full 39x32 playout under 4s', ms < 4000, ms.toFixed(0) + 'ms');
  console.log('       playout: ' + ms.toFixed(0) + 'ms, ' + s.moveCount + ' moves, score ' + JSON.stringify(scores(s)));
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
