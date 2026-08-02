import { EMPTY, RED } from './rules.js';

export const COLORS = {
  paper: '#fffdf7',
  grid: '#d3e2f2',
  gridStrong: '#bcd3ea',
  red: '#c8102e',
  blue: '#1c5fbe',
};

const dotColor = (p) => (p === RED ? COLORS.red : COLORS.blue);

export class BoardView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = 20;
    this.state = null;
    this.hover = null;
    this.showHover = false;
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
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
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
    const dist = Math.hypot(clientX - r.left - px, clientY - r.top - py);
    if (dist > this.cell * 0.62) return null;
    return { x, y };
  }

  draw() {
    const s = this.state;
    if (!s) return;
    const ctx = this.ctx;
    const cell = this.cell;
    const w = this.pad * 2 + (s.w - 1) * cell;
    const h = this.pad * 2 + (s.h - 1) * cell;

    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (let x = 0; x < s.w; x++) {
      const px = Math.round(this.pad + x * cell) + 0.5;
      ctx.moveTo(px, this.pad);
      ctx.lineTo(px, h - this.pad);
    }
    for (let y = 0; y < s.h; y++) {
      const py = Math.round(this.pad + y * cell) + 0.5;
      ctx.moveTo(this.pad, py);
      ctx.lineTo(w - this.pad, py);
    }
    ctx.stroke();

    for (const cap of s.captures) {
      this.drawCapture(cap);
    }

    const r = Math.max(2.5, cell * 0.3);
    for (let i = 0; i < s.owner.length; i++) {
      const p = s.owner[i];
      if (p === EMPTY) continue;
      const gx = i % s.w;
      const gy = (i / s.w) | 0;
      const [px, py] = this.toPixel(gx, gy);
      const captive = s.terr[i] !== EMPTY && s.terr[i] !== p;
      ctx.beginPath();
      ctx.arc(px, py, captive ? r * 0.75 : r, 0, Math.PI * 2);
      if (captive) {
        ctx.fillStyle = COLORS.paper;
        ctx.fill();
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.strokeStyle = dotColor(p);
        ctx.globalAlpha = 0.55;
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
      ctx.arc(px, py, r + Math.max(2, cell * 0.2), 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#3b4250';
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (this.showHover && this.hover) {
      const [px, py] = this.toPixel(this.hover.x, this.hover.y);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = dotColor(s.turn);
      ctx.globalAlpha = 0.32;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
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
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.min(3, Math.max(1.5, this.cell * 0.08));
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.stroke();
      return;
    }
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.2;
    const half = this.cell / 2;
    for (const i of cap.cells) {
      const [px, py] = this.toPixel(i % this.state.w, (i / this.state.w) | 0);
      ctx.fillRect(px - half, py - half, this.cell, this.cell);
    }
    ctx.globalAlpha = 1;
  }
}
