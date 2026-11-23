// A terminal: a fixed grid of upright ASCII characters, each with a colour and a background.
// Nothing else is ever drawn. Only cells that changed since the last frame are repainted.

const FAMILY = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace';

export class Term {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.css = new Map();
    this.cols = 0; this.rows = 0;
    this.fit();
  }
  color(c) {
    let s = this.css.get(c);
    if (!s) this.css.set(c, (s = '#' + c.toString(16).padStart(6, '0')));
    return s;
  }
  // Choose a type size so a phone held upright gets about 42 columns, and a desk gets a wide map.
  fit() {
    const W = this.cv.clientWidth || 800, H = this.cv.clientHeight || 600, dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.max(11, Math.min(20, Math.floor(Math.min(W / (0.6 * 42), H / (1.18 * 30)))));
    const key = W + 'x' + H + '@' + dpr;
    if (key === this.key) return false;
    this.key = key;
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    const ctx = this.ctx;
    this.font = `600 ${px * dpr}px ${FAMILY}`;
    ctx.font = this.font;
    this.cw = Math.max(1, Math.round(ctx.measureText('M').width));
    this.ch = Math.round(px * dpr * 1.18);
    this.cols = Math.floor(this.cv.width / this.cw);
    this.rows = Math.floor(this.cv.height / this.ch);
    this.ox = Math.floor((this.cv.width - this.cols * this.cw) / 2);
    this.oy = Math.floor((this.cv.height - this.rows * this.ch) / 2);
    this.dpr = dpr;
    const n = this.cols * this.rows;
    this.c = new Uint8Array(n).fill(32); this.fg = new Uint32Array(n); this.bg = new Uint32Array(n);
    this.pc = new Uint8Array(n); this.pfg = new Uint32Array(n).fill(0xffffffff); this.pbg = new Uint32Array(n).fill(0xffffffff);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    return true;
  }
  clear() { this.c.fill(32); this.fg.fill(0); this.bg.fill(0); }
  put(x, y, ch, fg, bg = 0) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x, code = typeof ch === 'number' ? ch : ch.charCodeAt(0);
    this.c[i] = code < 32 || code > 126 ? 63 : code; // printable ASCII only
    this.fg[i] = fg; this.bg[i] = bg;
  }
  write(x, y, s, fg, bg = 0) { for (let i = 0; i < s.length; i++) this.put(x + i, y, s.charCodeAt(i), fg, bg); }
  center(y, s, fg, bg = 0) { this.write(Math.floor((this.cols - s.length) / 2), y, s, fg, bg); }
  fill(x, y, w, h, ch, fg, bg = 0) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, ch, fg, bg); }
  box(x, y, w, h, fg, bg = 0, title = '') {
    this.fill(x, y, w, h, ' ', fg, bg);
    for (let i = 1; i < w - 1; i++) { this.put(x + i, y, '-', fg, bg); this.put(x + i, y + h - 1, '-', fg, bg); }
    for (let j = 1; j < h - 1; j++) { this.put(x, y + j, '|', fg, bg); this.put(x + w - 1, y + j, '|', fg, bg); }
    for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) this.put(cx, cy, '+', fg, bg);
    if (title) this.write(x + 2, y, ' ' + title + ' ', fg, bg);
  }
  flush() {
    const { ctx, cols, rows, cw, ch, c, fg, bg, pc, pfg, pbg } = this;
    ctx.font = this.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const n = cols * rows;
    for (let i = 0; i < n; i++) {
      if (c[i] === pc[i] && fg[i] === pfg[i] && bg[i] === pbg[i]) continue;
      pc[i] = c[i]; pfg[i] = fg[i]; pbg[i] = bg[i];
      const x = this.ox + (i % cols) * cw, y = this.oy + ((i / cols) | 0) * ch;
      ctx.fillStyle = this.color(bg[i]);
      ctx.fillRect(x, y, cw, ch);
      if (c[i] !== 32) { ctx.fillStyle = this.color(fg[i]); ctx.fillText(String.fromCharCode(c[i]), x + cw / 2, y + ch / 2 + ch * 0.04); }
    }
  }
  // which cell is under a pointer event
  cell(e) {
    const r = this.cv.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) * this.dpr - this.ox) / this.cw), Math.floor(((e.clientY - r.top) * this.dpr - this.oy) / this.ch)];
  }
}

// colour helpers (0xRRGGBB)
export function shade(c, k) {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}
export function tint(c, t, k = 1) {
  const r = Math.min(255, ((c >> 16) & 255) * t[0] * k) | 0, g = Math.min(255, ((c >> 8) & 255) * t[1] * k) | 0, b = Math.min(255, (c & 255) * t[2] * k) | 0;
  return (r << 16) | (g << 8) | b;
}
export function wrap(text, w) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let ln = '';
    for (const word of para.split(' ')) {
      if (ln.length + word.length + (ln ? 1 : 0) > w) { out.push(ln); ln = word; }
      else ln += (ln ? ' ' : '') + word;
    }
    out.push(ln);
  }
  return out;
}
