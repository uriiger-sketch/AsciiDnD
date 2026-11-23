// Small shared helpers: integer hashing, value noise, Bresenham lines, distances.

export function hash2(x, y, s = 0) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// smooth value noise in 0..1
export function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a + (a - b - c + d) * u) * v;
}

// Cells from (x0,y0) to (x1,y1), excluding the start, including the end.
export function line(x0, y0, x1, y1) {
  const out = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    out.push([x, y]);
  }
  return out;
}

// The same line carried on past its end for `extra` more cells (a bullet does not stop at its target).
export function ray(x0, y0, x1, y1, len) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  const k = Math.ceil(len / d) + 1;
  return line(x0, y0, x0 + dx * k, y0 + dy * k).slice(0, len);
}

export const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Glyph for a stroke travelling in direction (dx, dy).
export function strokeChar(dx, dy) {
  if (dy === 0) return '-';
  if (dx === 0) return '|';
  return dx * dy > 0 ? '\\' : '/';
}
