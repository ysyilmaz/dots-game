import { EMPTY, RED } from './rules.js';

export const COLORS = {
  paper: '#fffdf7',
  grid: '#dfe7f0',
  gridStrong: '#c3d4e6',
  coord: '#b9b0a3',
  red: '#c8102e',
  blue: '#1c5fbe',
  chance: '#2e9e5b',
  risk: '#d2691e',
};

const dotColor = (p) => (p === RED ? COLORS.red : COLORS.blue);
const COORD_ALPHABET = 'ABCDEFGHJKLMNPRSTUVYZ';

export function columnLabel(x) {
  const a = COORD_ALPHABET;
  return x < a.length ? a[x] : a[Math.floor(x / a.length) - 1] + a[x % a.length];
}

export function coordLabel(x, y) {
  return columnLabel(x) + (y + 1);
}

export class BoardView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = 20;
    this.state = null;
    this.hover = null;
    this.showHover = false;
    this.gridEmphasis = 0.6;
    this.showCoords = false;
    this.analysis = null;
  }

  get pad() {
    return this.cell;
  }

  layout(state, cell) {
    this.state = state;
    this.cell = cell;
    const w = this.pad * 2 + (state.w - 1) * cell;
    const h = this.pad * 2 + (state.h - 1) * cell;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toPixel(x, y) {
    return [this.pad + x * this.cell, this.pad + y * this.cell];
  }

  toGrid(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.round((clientX - r.left - this.pad) / this.cell);
    const y = Math.round((clientY - r.top - this.pad) / this.cell);
    if (!this.state) return null;
    if (x < 0 || y < 0 || x >= this.state.w || y >= this.state.h) return null;
    const [px, py] = this.toPixel(x, y);
    if (Math.hypot(clientX - r.left - px, clientY - r.top - py) > this.cell * 0.62) return null;
    return { x, y };
  }

  draw() {
    const s = this.state;
    if (!s) return;
    const ctx = this.ctx;
    const cell = this.cell;
    const pad = this.pad;
    const w = pad * 2 + (s.w - 1) * cell;
    const h = pad * 2 + (s.h - 1) * cell;

    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, w, h);

    const emph = Math.max(0, Math.min(1, this.gridEmphasis));
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (let x = 0; x < s.w; x++) {
      if (emph > 0 && x % 5 === 0) continue;
      const gx = Math.round(pad + x * cell) + 0.5;
      ctx.moveTo(gx, pad);
      ctx.lineTo(gx, h - pad);
    }
    for (let y = 0; y < s.h; y++) {
      if (emph > 0 && y % 5 === 0) continue;
      const gy = Math.round(pad + y * cell) + 0.5;
      ctx.moveTo(pad, gy);
      ctx.lineTo(w - pad, gy);
    }
    ctx.stroke();

    if (emph > 0) {
      ctx.strokeStyle = COLORS.gridStrong;
      ctx.globalAlpha = 0.35 + emph * 0.65;
      ctx.beginPath();
      for (let x = 0; x < s.w; x += 5) {
        const gx = Math.round(pad + x * cell) + 0.5;
        ctx.moveTo(gx, pad);
        ctx.lineTo(gx, h - pad);
      }
      for (let y = 0; y < s.h; y += 5) {
        const gy = Math.round(pad + y * cell) + 0.5;
        ctx.moveTo(pad, gy);
        ctx.lineTo(w - pad, gy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (this.showCoords) {
      ctx.fillStyle = COLORS.coord;
      ctx.font = '500 ' + Math.max(8, Math.min(11, cell * 0.5)) + "px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let x = 0; x < s.w; x += 5) ctx.fillText(columnLabel(x), pad + x * cell, pad * 0.45);
      ctx.textAlign = 'right';
      for (let y = 0; y < s.h; y += 5) ctx.fillText(String(y + 1), pad * 0.8, pad + y * cell);
    }

    for (const cap of s.captures) this.drawCapture(cap);

    const r = Math.max(2.5, cell * 0.3);
    for (let i = 0; i < s.owner.length; i++) {
      const p = s.owner[i];
      if (p === EMPTY) continue;
      const [px, py] = this.toPixel(i % s.w, (i / s.w) | 0);
      const captive = s.terr[i] !== EMPTY && s.terr[i] !== p;
      ctx.beginPath();
      ctx.arc(px, py, captive ? r * 0.72 : r, 0, Math.PI * 2);
      if (captive) {
        ctx.fillStyle = COLORS.paper;
        ctx.fill();
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.strokeStyle = dotColor(p);
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = dotColor(p);
        ctx.fill();
      }
    }

    if (s.lastMove) {
      const [px, py] = this.toPixel(s.lastMove.x, s.lastMove.y);
      ctx.beginPath();
      ctx.arc(px, py, r + Math.max(2.5, cell * 0.24), 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = dotColor(s.owner[s.lastMove.y * s.w + s.lastMove.x] || s.turn);
      ctx.globalAlpha = 0.45;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (this.analysis) {
      const ana = this.analysis;
      const maxR = ana.worst ? ana.worst.v : 1;
      for (const t of ana.risks) this.drawMark(t, COLORS.risk, true, maxR, r);
      const maxC = ana.best ? ana.best.v : 1;
      for (const c of ana.chances) this.drawMark(c, COLORS.chance, false, maxC, r);
    }

    if (this.showHover && this.hover) {
      const [px, py] = this.toPixel(this.hover.x, this.hover.y);
      ctx.fillStyle = dotColor(s.turn);
      ctx.strokeStyle = dotColor(s.turn);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, r + 3, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawMark(pt, color, dashed, maxV, r) {
    const ctx = this.ctx;
    const cell = this.cell;
    const [a, b] = this.toPixel(pt.x, pt.y);
    const rr = r + Math.max(4, cell * 0.36) * (0.78 + 0.22 * (pt.v / maxV));
    ctx.beginPath();
    ctx.arc(a, b, rr, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.14;
    ctx.fill();
    ctx.setLineDash(dashed ? [Math.max(3, cell * 0.2), Math.max(2, cell * 0.15)] : []);
    ctx.lineWidth = Math.max(2, cell * 0.13);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.95;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (cell < 14) return;

    const size = Math.max(12, Math.round(cell * 0.54));
    const label = (dashed ? '−' : '+') + pt.v;
    ctx.font = '700 ' + size + "px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(label).width;
    const right = a + rr * 0.74 + width < this.canvas.clientWidth - 2;
    ctx.textAlign = right ? 'left' : 'right';
    const lx = right ? a + rr * 0.74 : a - rr * 0.74;
    const ly = b - rr * 0.62;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.36);
    ctx.strokeStyle = COLORS.paper;
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
  }

  drawCapture(cap) {
    const ctx = this.ctx;
    const color = dotColor(cap.player);
    if (cap.polygon && cap.polygon.length >= 3) {
      ctx.beginPath();
      cap.polygon.forEach(([x, y], k) => {
        const [px, py] = this.toPixel(x, y);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.16;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(1.5, this.cell * 0.1);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16;
    const half = this.cell / 2;
    for (const i of cap.cells) {
      const [px, py] = this.toPixel(i % this.state.w, (i / this.state.w) | 0);
      ctx.fillRect(px - half, py - half, this.cell, this.cell);
    }
    ctx.globalAlpha = 1;
  }
}
