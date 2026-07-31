/* 재사용 가능한 바둑판 렌더러 (Canvas 기반) */
const EMPTY = 0, BLACK = 1, WHITE = 2;

class GoBoardView {
  /**
   * @param {HTMLElement} container
   * @param {object} opts { size, cell, onPointClick, showCoords }
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.size = opts.size || 9;
    this.cell = opts.cell || 38;
    this.margin = opts.margin ?? this.cell * 0.75;
    this.onPointClick = opts.onPointClick || null;
    this.showCoords = opts.showCoords ?? true;
    this.grid = makeEmptyGrid(this.size);
    this.marks = []; // [{x,y,label,color}]
    this.lastMove = null;
    this.readOnly = !this.onPointClick;

    this.canvas = document.createElement("canvas");
    const dim = this.margin * 2 + this.cell * (this.size - 1);
    this.canvas.width = dim;
    this.canvas.height = dim;
    this.canvas.style.width = dim + "px";
    this.canvas.style.height = dim + "px";
    this.canvas.style.cursor = this.readOnly ? "default" : "pointer";
    this.ctx = this.canvas.getContext("2d");
    this.container.innerHTML = "";
    this.container.appendChild(this.canvas);

    if (this.onPointClick) {
      this.canvas.addEventListener("click", (e) => this._handleClick(e));
    }
    this.draw();
  }

  setSize(size) {
    this.size = size;
    this.grid = makeEmptyGrid(size);
    const dim = this.margin * 2 + this.cell * (this.size - 1);
    this.canvas.width = dim;
    this.canvas.height = dim;
    this.canvas.style.width = dim + "px";
    this.canvas.style.height = dim + "px";
  }

  setGrid(grid) {
    this.grid = grid;
    this.draw();
  }

  setMarks(marks) {
    this.marks = marks || [];
    this.draw();
  }

  setLastMove(pt) {
    this.lastMove = pt;
    this.draw();
  }

  _handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const x = Math.round((px - this.margin) / this.cell);
    const y = Math.round((py - this.margin) / this.cell);
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return;
    const dx = px - (this.margin + x * this.cell);
    const dy = py - (this.margin + y * this.cell);
    if (Math.sqrt(dx * dx + dy * dy) > this.cell * 0.45) return;
    this.onPointClick(x, y);
  }

  draw() {
    const ctx = this.ctx;
    const { cell, margin, size } = this;
    const dim = this.canvas.width;
    ctx.clearRect(0, 0, dim, dim);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--board-bg") || "#e3b878";
    ctx.fillRect(0, 0, dim, dim);

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--board-line") || "#5a4630";
    ctx.lineWidth = 1;
    for (let i = 0; i < size; i++) {
      const p = margin + i * cell;
      ctx.beginPath();
      ctx.moveTo(margin, p);
      ctx.lineTo(margin + cell * (size - 1), p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, margin);
      ctx.lineTo(p, margin + cell * (size - 1));
      ctx.stroke();
    }

    // 화점
    for (const [sx, sy] of starPoints(size)) {
      ctx.beginPath();
      ctx.arc(margin + sx * cell, margin + sy * cell, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }

    if (this.showCoords) {
      ctx.fillStyle = "#6b6357";
      ctx.font = `${cell * 0.28}px sans-serif`;
      ctx.textAlign = "center";
      const letters = "ABCDEFGHJKLMNOPQRST";
      for (let i = 0; i < size; i++) {
        ctx.fillText(letters[i] || "", margin + i * cell, margin - cell * 0.4);
        ctx.fillText(String(size - i), margin - cell * 0.5, margin + i * cell + cell * 0.1);
      }
    }

    // 돌
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const v = this.grid[x][y];
        if (v === EMPTY) continue;
        this._drawStone(x, y, v === BLACK ? "black" : "white");
      }
    }

    // 마지막 수 표시
    if (this.lastMove) {
      const [lx, ly] = this.lastMove;
      const cx = margin + lx * cell, cy = margin + ly * cell;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.15, 0, Math.PI * 2);
      ctx.strokeStyle = this.grid[lx][ly] === BLACK ? "#fff" : "#000";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // 마크(급소 등)
    for (const m of this.marks) {
      const cx = margin + m.x * cell, cy = margin + m.y * cell;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2);
      ctx.strokeStyle = m.color || "#c0392b";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      if (m.label) {
        ctx.fillStyle = m.color || "#c0392b";
        ctx.font = `bold ${cell * 0.26}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(m.label, cx, cy - cell * 0.42);
      }
    }
  }

  _drawStone(x, y, color) {
    const ctx = this.ctx;
    const { cell, margin } = this;
    const cx = margin + x * cell, cy = margin + y * cell;
    const r = cell * 0.46;
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    if (color === "black") {
      grad.addColorStop(0, "#5a5a5a");
      grad.addColorStop(1, "#0a0a0a");
    } else {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#c9c9c9");
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function makeEmptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

function starPoints(size) {
  if (size === 19) {
    const p = [3, 9, 15];
    const pts = [];
    for (const a of p) for (const b of p) pts.push([a, b]);
    return pts;
  }
  if (size === 13) {
    const p = [3, 6, 9];
    const pts = [];
    for (const a of p) for (const b of p) pts.push([a, b]);
    return pts;
  }
  if (size === 9) {
    return [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];
  }
  return [];
}

function gridFromStones(size, blackPts, whitePts) {
  const g = makeEmptyGrid(size);
  for (const [x, y] of blackPts || []) g[x][y] = BLACK;
  for (const [x, y] of whitePts || []) g[x][y] = WHITE;
  return g;
}
