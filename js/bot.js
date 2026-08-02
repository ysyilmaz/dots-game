import { EMPTY, canPlay, captureGain, opponent } from './rules.js';

const MAX_HEAVY_EVALS = 200;

function neighbourCounts(s, x, y, p) {
  let own = 0;
  let opp = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      const o = s.owner[ny * s.w + nx];
      if (o === p) own++;
      else if (o !== EMPTY) opp++;
    }
  }
  return { own, opp };
}

export function pickBotMove(s) {
  const p = s.turn;
  const opp = opponent(p);
  const candidates = [];
  let anyDot = false;

  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (s.owner[y * s.w + x] !== EMPTY) anyDot = true;
      if (!canPlay(s, x, y)) continue;
      const { own, opp: oppAdj } = neighbourCounts(s, x, y, p);
      if (own === 0 && oppAdj === 0) continue;
      candidates.push({ x, y, own, oppAdj, base: oppAdj * 3 + own * 2 });
    }
  }

  if (!anyDot || candidates.length === 0) {
    const cx = Math.floor(s.w / 2);
    const cy = Math.floor(s.h / 2);
    for (let r = 0; r < Math.max(s.w, s.h); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (canPlay(s, cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
        }
      }
    }
    return null;
  }

  candidates.sort((a, b) => b.base - a.base);
  const heavy = candidates.slice(0, MAX_HEAVY_EVALS);
  const defensive = { ...s, turn: opp };

  let best = null;
  let bestScore = -Infinity;
  for (const c of heavy) {
    const gain = captureGain(s, c.x, c.y);
    const threat = captureGain(defensive, c.x, c.y);
    const score = gain * 100 + threat * 80 + c.base + Math.random() * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ? { x: best.x, y: best.y } : { x: candidates[0].x, y: candidates[0].y };
}
