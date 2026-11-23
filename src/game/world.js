// Levels: storage, field of view, path fields, and the two maps of chapter one
// (the Sundown valley and the Cinder Mine). Generation is deterministic.

import { TILE, T } from './data.js';
import { hash2, vnoise, DIRS } from './util.js';

export class Level {
  constructor(id, w, h, dark = false) {
    this.id = id; this.w = w; this.h = h; this.dark = dark;
    const n = w * h;
    this.t = new Uint8Array(n);
    this.glyph = new Uint8Array(n); // per-cell character override (sign letters, wagon parts)
    this.tint = new Uint32Array(n); // per-cell colour override
    this.seen = new Uint8Array(n);
    this.vis = new Uint8Array(n);
    this.lit = new Uint8Array(n);
    this.occ = new Array(n).fill(null);
    this.items = new Map();
    this.decal = new Map();
    this.actors = [];
    this.poi = {};
    this.signs = {};
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  tile(x, y) { return this.inb(x, y) ? TILE[this.t[y * this.w + x]] : TILE[0]; }
  set(x, y, t, glyph = 0, tint = 0) {
    if (!this.inb(x, y)) return;
    const i = y * this.w + x;
    this.t[i] = t;
    this.glyph[i] = typeof glyph === 'string' ? glyph.charCodeAt(0) : glyph;
    this.tint[i] = tint;
  }
  walk(x, y) { return this.tile(x, y).walk; }
  // a step from (x,y) by (dx,dy) may not squeeze between two solid corners
  canStep(x, y, dx, dy) {
    if (!this.walk(x + dx, y + dy)) return false;
    if (dx && dy && !this.walk(x + dx, y) && !this.walk(x, y + dy)) return false;
    return true;
  }
  // clear line of sight / fire between two cells (ends excluded)
  los(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === x1 && y === y1) return true;
      if (!TILE[this.t[y * this.w + x]].clear) return false;
    }
  }
  computeLight() {
    this.lit.fill(0);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!TILE[this.t[y * this.w + x]].light) continue;
      for (let j = -5; j <= 5; j++) for (let i = -7; i <= 7; i++) {
        const X = x + i, Y = y + j;
        if (this.inb(X, Y) && i * i + j * j * 2 <= 50 && this.los(x, y, X, Y)) this.lit[Y * this.w + X] = 1;
      }
    }
  }
}

// ---- field of view: recursive shadowcasting ------------------------------------------------
const MULT = [[1, 0, 0, -1, -1, 0, 0, 1], [0, 1, -1, 0, 0, -1, 1, 0], [0, 1, 1, 0, 0, -1, -1, 0], [1, 0, 0, 1, -1, 0, 0, -1]];
function cast(lv, cx, cy, row, start, end, radius, xx, xy, yx, yy, out) {
  if (start < end) return;
  const r2 = radius * radius;
  let newStart = 0;
  for (let j = row; j <= radius; j++) {
    let dx = -j - 1, blocked = false;
    const dy = -j;
    while (dx <= 0) {
      dx++;
      const X = cx + dx * xx + dy * xy, Y = cy + dx * yx + dy * yy;
      const ls = (dx - 0.5) / (dy + 0.5), rs = (dx + 0.5) / (dy - 0.5);
      if (start < rs) continue;
      if (end > ls) break;
      const inb = lv.inb(X, Y);
      if (inb && dx * dx + dy * dy < r2) out[Y * lv.w + X] = 1;
      const wall = !inb || !TILE[lv.t[Y * lv.w + X]].clear;
      if (blocked) {
        if (wall) { newStart = rs; continue; }
        blocked = false;
        start = newStart;
      } else if (wall && j < radius) {
        blocked = true;
        cast(lv, cx, cy, j + 1, start, ls, radius, xx, xy, yx, yy, out);
        newStart = rs;
      }
    }
    if (blocked) break;
  }
}
// Fills lv.vis for an eye at (px,py). In the dark you see `near` steps, plus anything lit.
export function fov(lv, px, py, radius, near = radius) {
  const out = lv.vis;
  out.fill(0);
  out[py * lv.w + px] = 1;
  for (let o = 0; o < 8; o++) cast(lv, px, py, 1, 1, 0, radius, MULT[0][o], MULT[1][o], MULT[2][o], MULT[3][o], out);
  if (near < radius) {
    const n2 = near * near;
    for (let y = Math.max(0, py - radius); y <= Math.min(lv.h - 1, py + radius); y++) {
      for (let x = Math.max(0, px - radius); x <= Math.min(lv.w - 1, px + radius); x++) {
        const i = y * lv.w + x;
        if (out[i] && !lv.lit[i] && (x - px) * (x - px) + (y - py) * (y - py) > n2) out[i] = 0;
      }
    }
  }
  for (let i = 0; i < out.length; i++) if (out[i]) lv.seen[i] = 1;
}

// ---- path field: steps to (tx,ty) from every cell within maxR --------------------------------
export function flow(lv, tx, ty, maxR = 40, known = false, avoid = null) {
  const d = new Int16Array(lv.w * lv.h).fill(32767);
  const q = new Int32Array(lv.w * lv.h);
  let head = 0, tail = 0;
  d[ty * lv.w + tx] = 0;
  q[tail++] = ty * lv.w + tx;
  while (head < tail) {
    const i = q[head++], x = i % lv.w, y = (i / lv.w) | 0, nd = d[i] + 1;
    if (nd > maxR) continue;
    for (const [dx, dy] of DIRS) {
      const X = x + dx, Y = y + dy;
      if (!lv.inb(X, Y)) continue;
      const k = Y * lv.w + X;
      if (d[k] <= nd) continue;
      if (!lv.canStep(x, y, dx, dy)) continue;
      if (known && !lv.seen[k]) continue;
      if (avoid && avoid.has(k)) continue;
      d[k] = nd;
      q[tail++] = k;
    }
  }
  return d;
}

// ---- building blocks -------------------------------------------------------------------------
const CH = {
  '#': [T.WALL], '.': [T.FLOOR], '+': [T.DOOR], "'": [T.DOOR_OPEN], '=': [T.WINDOW], n: [T.TABLE], o: [T.BARREL], x: [T.CRATE], '0': [T.KEG],
  '-': [T.FENCE], '|': [T.FENCEV], i: [T.LANTERN], _: [T.PLANK], u: [T.TROUGH], t: [T.GRAVE], '&': [T.FIRE], '[': [T.WAGON, '['], ']': [T.WAGON, ']'], w: [T.WAGON, '='],
  '/': [T.TENT, '/'], '\\': [T.TENT, '\\'], v: [T.TENT, '_'], '@': [T.STONE], ',': [T.SAND], ':': [T.ROAD], '%': [T.BOULDER], Y: [T.CACTUS], b: [T.BONES],
};
function stamp(lv, x0, y0, rows, tint = 0) {
  const w = rows[0].length;
  rows.forEach((row, j) => {
    if (row.length !== w) throw new Error(`stamp row ${j} is ${row.length} wide, expected ${w}: "${row}"`);
    [...row].forEach((c, i) => {
      if (c === ' ') return;
      if (c >= 'A' && c <= 'Z' && c !== 'Y') return lv.set(x0 + i, y0 + j, T.WALL, c, 0xf2e6c6);
      const m = CH[c];
      if (!m) throw new Error('unknown stamp char ' + c);
      lv.set(x0 + i, y0 + j, m[0], m[1] || 0, c === '#' ? tint : 0);
    });
  });
}
const sandy = (t) => t === T.SAND || t === T.DUST || t === T.GRIT || t === T.SCRUB || t === T.SAGE || t === T.GRASS;

// ---- the valley --------------------------------------------------------------------------------
export function buildWorld() {
  const W = 160, H = 100, lv = new Level('world', W, H);
  const R = (x, y, s) => hash2(x, y, s);
  const ground = (x, y, rough = 0) => { const n = R(x, y, 1); return n < 0.56 - rough ? T.SAND : n < 0.88 - rough * 0.5 ? T.DUST : T.GRIT; };

  // sand and scrub
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let t = ground(x, y);
    const s = vnoise(x / 11, y / 5, 7);
    if (s > 0.6 && R(x, y, 2) < 0.5) t = T.SCRUB;
    if (s > 0.7 && R(x, y, 3) < 0.16) t = T.SAGE;
    lv.set(x, y, t);
  }
  // red rock: the northern range, the badlands round the mine, a few buttes, and the rim of the world
  const blobs = [[74, 13, 48, 17], [24, 19, 21, 13], [30, 64, 7, 3], [132, 84, 9, 4], [100, 86, 6, 3], [17, 50, 6, 3], [149, 42, 6, 4], [60, 82, 5, 2]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let f = -9;
    for (const [bx, by, rx, ry] of blobs) f = Math.max(f, 1 - ((x - bx) / rx) ** 2 - ((y - by) / ry) ** 2);
    f += (vnoise(x / 7, y / 3.5, 11) - 0.5) * 0.5;
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (f > 0 || e < 2 + vnoise(x / 5, y / 3, 13) * 3) lv.set(x, y, R(x, y, 5) < 0.55 ? T.MESA : T.MESA2);
  }
  const brush = (cx, cy, rx, ry, rough = 0.12) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 2 || y < 2 || x > W - 3 || y > H - 3) continue;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) lv.set(x, y, ground(x, y, rough));
    }
  };
  const along = (pts, fn) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let i = 0; i <= n; i++) fn(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n);
    }
  };
  // Red Canyon: a crooked box canyon with two side pockets
  along([[76, 36], [75, 30], [79, 25], [73, 19], [71, 13]], (x, y) => brush(x, y, 4.5, 2));
  brush(72, 10.5, 9, 4);
  along([[73, 20], [65, 21]], (x, y) => brush(x, y, 2.2, 1.2));
  along([[75, 15], [83, 14]], (x, y) => brush(x, y, 2.2, 1.2));
  // the pocket in the badlands where the mine opens
  along([[32, 38], [27, 33], [24, 30]], (x, y) => brush(x, y, 4, 2));
  brush(24, 28.5, 5, 2);

  // Cottonwood Creek
  const creekX = (y) => Math.round(119 + 4 * Math.sin(y / 7) + 2 * Math.sin(y / 3.1 + 1));
  for (let y = 1; y < H - 1; y++) {
    const cx = creekX(y);
    for (let dx = -5; dx <= 5; dx++) {
      const x = cx + dx, a = Math.abs(dx);
      if (a <= 1) lv.set(x, y, T.WATER);
      else if (a <= 3) lv.set(x, y, R(x, y, 21) < 0.6 ? T.GRASS : T.SAND);
      else if (!TILE[lv.t[y * W + x]].walk && y > 3 && y < H - 4) lv.set(x, y, T.SAND);
      if (a >= 2 && (y < 49 || y > 57) && R(x, y, 22) < 0.1) lv.set(x, y, T.TREE);
    }
  }
  // trails
  const road = (pts, wide = 0) => along(pts, (fx, fy) => {
    for (let j = 0; j <= wide; j++) {
      const x = Math.round(fx), y = Math.round(fy) + j, t = lv.t[y * W + x];
      if (t === T.WATER || t === T.PLANK) lv.set(x, y, T.PLANK);
      else if (t !== T.MESA && t !== T.MESA2) lv.set(x, y, T.ROAD);
    }
  });
  road([[13, 86], [30, 78], [44, 64], [51, 54]]);
  road([[50, 52], [107, 52]], 2);
  road([[107, 53], [141, 53]]);
  road([[125, 54], [132, 60]]);
  road([[76, 51], [76, 37]]);
  road([[51, 52], [46, 51], [40, 51], [34, 44], [32, 38]]);
  road([[122, 52], [126, 40], [131, 26], [134, 22]]);
  road([[78, 55], [78, 66]]);
  for (let x = 2; x < W - 2; x++) if (lv.t[70 * W + x] !== T.WATER) lv.set(x, 70, T.RAIL); else lv.set(x, 70, T.PLANK);

  // ---- Sundown ----
  for (let y = 43; y <= 63; y++) for (let x = 52; x <= 104; x++) if (!sandy(lv.t[y * W + x]) || lv.t[y * W + x] === T.SCRUB) lv.set(x, y, ground(x, y));
  for (let x = 53; x <= 104; x++) { lv.set(x, 51, T.PLANK); lv.set(x, 55, T.PLANK); }
  for (let y = 52; y <= 54; y++) for (let x = 50; x <= 107; x++) lv.set(x, y, T.ROAD);
  const WOOD = [0x9a7a52, 0xa8875a, 0x8c6c4a, 0xb0906a, 0x9c5e48, 0xb9b09c];
  stamp(lv, 54, 44, [
    '############',
    '#..x..x....#',
    '#..........=',
    '#.xx.....o.#',
    '=..........#',
    '#..........#',
    '#LIVERY+++##'], WOOD[4]);
  stamp(lv, 68, 44, [
    '##############',
    '#.n..n...nnnn#',
    '#............#',
    '#.n..n.......=',
    '=............#',
    '#.n.....o.o..#',
    '#SALOON##++###'], WOOD[0]);
  stamp(lv, 84, 44, [
    '##########',
    '#.....n..#',
    '#........=',
    '#..n.....#',
    '=........#',
    '#........#',
    '#SHERIFF+#'], WOOD[2]);
  stamp(lv, 96, 44, [
    '########',
    '#..n...#',
    '#......=',
    '#......#',
    '=...n..#',
    '#......#',
    '#DOC#+##'], WOOD[5]);
  stamp(lv, 54, 56, [
    '#STORE##++###',
    '#...........#',
    '=.xx.....o..#',
    '#...........=',
    '#.nnnnn.....#',
    '#...........#',
    '#############'], WOOD[1]);
  stamp(lv, 69, 56, [
    '#HOTEL#++##',
    '#.........#',
    '=..n......#',
    '#.........=',
    '#.n...n...#',
    '#.........#',
    '###########'], WOOD[3]);
  stamp(lv, 82, 56, [
    '##BANK###',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#########'], WOOD[5]);
  stamp(lv, 93, 56, [
    '#CHURCH+#',
    '#.......#',
    '=.nn.nn.=',
    '#.......#',
    '=.nn.nn.=',
    '#.......#',
    '#...t...#',
    '#########'], WOOD[5]);
  stamp(lv, 73, 66, [
    '####++#####',
    '#.........#',
    '=....n....=',
    '#DEPOT#####'], WOOD[4]);
  // things to hide behind in the street
  for (const [x, y, c] of [[66, 51, 'o'], [67, 51, 'o'], [82, 51, 'u'], [83, 51, 'u'], [94, 51, 'x'], [67, 55, 'x'], [68, 55, 'x'], [80, 55, 'o'], [91, 55, 'u'], [92, 55, 'u'],
    [53, 51, 'i'], [81, 51, 'i'], [104, 51, 'i'], [53, 55, 'i'], [79, 55, 'i'], [104, 55, 'i'], [60, 53, 'o'], [88, 53, 'x'], [89, 53, 'x'], [98, 54, 'o']]) stamp(lv, x, y, [c]);
  stamp(lv, 72, 53, ['[ww]']);
  // Boot Hill
  for (let i = 0; i < 9; i++) stamp(lv, 57 + (i % 5) * 2, 38 + ((i / 5) | 0) * 2, ['t']);
  // the stockyard
  stamp(lv, 36, 43, [
    '------,------',
    '|,,,,,,,,x,,|',
    '|,,xx,,,,,,,,',
    '|,,,,,,,,,,,|',
    '|,u,,,,,,x,,|',
    '|,,,,,,,,,,,|',
    '-----,-------']);

  // ---- where it starts ----
  stamp(lv, 12, 85, ['&']);
  lv.set(12, 85, T.ASH);
  lv.set(27, 80, T.SIGN);
  lv.signs[80 * W + 27] = 'SUNDOWN. East along the trail.';
  lv.set(49, 51, T.SIGN);
  lv.signs[51 * W + 49] = 'SUNDOWN. Pop. 61 and falling.';
  lv.set(77, 38, T.SIGN);
  lv.signs[38 * W + 77] = 'RED CANYON. The stage road. No water.';
  lv.set(33, 40, T.SIGN);
  lv.signs[40 * W + 33] = 'CINDER MINE. Closed. KEEP OUT.';
  lv.set(123, 51, T.SIGN);
  lv.signs[51 * W + 123] = 'North: the mesa people. Go as a guest.';

  // ---- the rustlers' camp, east of the creek ----
  for (let y = 56; y <= 67; y++) for (let x = 126; x <= 141; x++) if (!lv.walk(x, y) && lv.t[y * W + x] !== T.MESA && lv.t[y * W + x] !== T.MESA2) lv.set(x, y, T.SAND);
  stamp(lv, 127, 57, [' /\\ ', '/vv\\']);
  stamp(lv, 136, 57, [' /\\ ', '/vv\\']);
  stamp(lv, 133, 61, ['&']);
  stamp(lv, 129, 62, ['xx']);
  stamp(lv, 136, 61, ['o']); stamp(lv, 137, 62, ['o']); stamp(lv, 139, 63, ['0']);
  stamp(lv, 128, 65, ['[ww]']);
  stamp(lv, 131, 59, ['x']); stamp(lv, 135, 64, ['%']); stamp(lv, 126, 60, ['%']);

  // ---- Red Canyon: rocks to fight from, and what is left of the stage ----
  for (const [x, y] of [[77, 33], [74, 31], [78, 28], [80, 26], [76, 24], [78, 22], [71, 21], [75, 19], [70, 18], [74, 17], [69, 13], [76, 12], [67, 10], [73, 8], [78, 10], [72, 13]]) if (lv.walk(x, y)) lv.set(x, y, T.BOULDER);
  stamp(lv, 70, 10, ['[ww]']);
  stamp(lv, 75, 10, ['x']); stamp(lv, 69, 11, ['x']); stamp(lv, 74, 11, ['b']);

  // ---- the mesa people's camp, and the standing stones ----
  for (let y = 13; y <= 29; y++) for (let x = 126; x <= 153; x++) if (!sandy(lv.t[y * W + x]) && lv.t[y * W + x] !== T.ROAD && lv.t[y * W + x] !== T.WATER) lv.set(x, y, ground(x, y));
  for (const [x, y] of [[128, 16], [135, 15], [140, 18], [129, 22], [138, 23]]) stamp(lv, x, y, [' /\\ ', '/vv\\']);
  stamp(lv, 134, 20, ['&']);
  for (const [x, y] of [[145, 22], [148, 21], [151, 22], [153, 24], [151, 26], [148, 27], [145, 26], [143, 24]]) stamp(lv, x, y, ["@"]);

  // ---- the mine mouth ----
  lv.set(24, 27, T.DOWN);
  stamp(lv, 21, 29, ['x']); stamp(lv, 27, 29, ['o']); stamp(lv, 26, 31, ['%']); stamp(lv, 22, 31, ['x']); stamp(lv, 28, 34, ['%']); stamp(lv, 30, 36, ['x']);

  // ---- campfires in the wild: places to rest ----
  for (const [x, y] of [[80, 38], [36, 39], [112, 49]]) lv.set(x, y, T.FIRE);

  // ---- saguaros and boulders ----
  const keep = [[48, 40, 108, 66], [8, 80, 24, 90], [34, 41, 50, 51], [124, 54, 142, 68], [122, 10, 154, 30], [18, 26, 36, 40], [60, 4, 90, 37], [70, 64, 86, 71]];
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
    const t = lv.t[y * W + x];
    if (t !== T.SAND && t !== T.DUST && t !== T.GRIT) continue;
    if (keep.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) continue;
    let nearRoad = false, nearRock = false;
    for (const [dx, dy] of DIRS) {
      const n = lv.t[(y + dy) * W + x + dx];
      if (n === T.ROAD || n === T.RAIL || n === T.PLANK) nearRoad = true;
      if (n === T.MESA || n === T.MESA2) nearRock = true;
    }
    if (nearRoad) continue;
    const r = R(x, y, 31);
    if (r < 0.012) lv.set(x, y, T.CACTUS);
    else if (r < (nearRock ? 0.07 : 0.02)) lv.set(x, y, T.BOULDER);
  }
  lv.poi = {
    start: [13, 85], knife: [19, 84], odalys: [62, 51], sheriff: [92, 51], marisol: [77, 46], hollis: [60, 59], doc: [99, 47], clerk: [73, 59],
    yard: [42, 46], yardGate: [41, 50], camp: [133, 62], campEdge: [123, 55], canyonMouth: [76, 36], wreck: [72, 12], mesaCamp: [133, 21], stones: [148, 24],
    mineDoor: [24, 27], mineEdge: [31, 37], street: [78, 53], townW: [52, 53], townE: [106, 53], townN: [76, 42], fenn: [73, 11],
  };
  lv.computeLight();
  return lv;
}

// ---- the Cinder Mine -----------------------------------------------------------------------------
export function buildMine() {
  const W = 70, H = 44, lv = new Level('mine', W, H, true);
  lv.t.fill(T.ROCK);
  for (let i = 0; i < W * H; i++) lv.tint[i] = hash2(i % W, (i / W) | 0, 3) < 0.5 ? 0x57483e : 0x4a3d35;
  const room = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) lv.set(x, y, T.CAVE); };
  room(33, 36, 37, 42); // the way in
  room(26, 28, 44, 35); // the hall
  room(14, 31, 26, 32); room(4, 26, 14, 36); // west: the powder store
  room(44, 31, 52, 32); room(52, 26, 66, 36); // east: the bunkroom
  room(34, 18, 36, 28); // the shaft
  for (let y = 5; y <= 18; y++) for (let x = 20; x <= 50; x++) if (((x - 35) / 15) ** 2 + ((y - 11.5) / 6.5) ** 2 + (vnoise(x / 4, y / 2.5, 9) - 0.5) * 0.5 <= 1) lv.set(x, y, T.CAVE);
  room(48, 10, 55, 11); room(55, 5, 65, 14); // the vault
  lv.set(35, 41, T.UP);
  for (let y = 19; y <= 40; y++) lv.set(35, y, T.TRACK);
  for (let x = 6; x <= 34; x++) lv.set(x, 31, T.TRACK);
  for (const [x, y] of [[31, 34], [39, 29], [20, 32], [48, 32], [36, 23], [9, 27], [60, 27], [35, 13], [59, 6], [35, 38], [53, 33], [13, 35]]) lv.set(x, y, T.LANTERN);
  for (const [x, y] of [[6, 28], [7, 28], [6, 34], [11, 34], [12, 29], [8, 35], [28, 29], [42, 34], [26, 9], [44, 14], [36, 7]]) lv.set(x, y, T.KEG);
  for (const [x, y, c] of [[30, 30, 'x'], [31, 30, 'x'], [40, 32, 'o'], [29, 33, 'o'], [38, 34, 'x'], [10, 31, 'x'], [9, 30, 'x'], [56, 29, 'n'], [57, 29, 'n'], [61, 33, 'n'], [62, 33, 'n'], [58, 34, 'x'], [64, 28, 'o'],
    [54, 31, 'x'], [30, 14, 'x'], [39, 9, 'o'], [33, 12, '%'], [37, 12, '%'], [27, 13, '%'], [43, 9, '%'], [35, 15, 'x'], [57, 9, 'x'], [58, 9, 'x'], [62, 12, 'o'], [34, 20, 'x'], [36, 25, 'o'], [34, 37, 'x'], [36, 39, 'o']]) {
    if (lv.walk(x, y)) stamp(lv, x, y, [c]);
  }
  for (const [x, y] of [[30, 10], [40, 13], [35, 9], [25, 12], [45, 11]]) if (lv.walk(x, y)) lv.set(x, y, T.ROCK, 0, 0x57483e);
  lv.poi = { up: [35, 41], hall: [35, 31], west: [9, 31], east: [59, 31], shaft: [35, 22], cavern: [35, 11], vault: [60, 9], box: [62, 7] };
  lv.computeLight();
  return lv;
}
