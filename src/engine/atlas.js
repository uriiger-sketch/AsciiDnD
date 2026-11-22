// Glyph atlas: the 95 printable ASCII characters rasterised at runtime in the device's own
// monospace font, converted to signed distance fields (crisp at any size, morphable between
// glyphs, weight-adjustable), stored one glyph per texture-array layer (layer = charCode - 32).
//
// Ramps: each material owns a small palette of characters. The palette is sorted by the ink
// coverage *measured on this device's font*, so "brighter = denser glyph" holds for any typeface.

import { texture } from './gl.js';

export const CELL_W = 64;
export const CELL_H = 96;
export const GLYPH_ASPECT = CELL_W / CELL_H;
export const RAMP_LEVELS = 16;
const SDF_RADIUS = 16; // texels spanned by the full 0..1 SDF range
const FONT_PX = 72;
const FONT =
  `700 ${FONT_PX}px ui-monospace,"SF Mono",Menlo,Consolas,"JetBrains Mono","DejaVu Sans Mono","Liberation Mono",monospace`;

// Material palettes. Order here is irrelevant: they are re-sorted by measured coverage.
export const RAMP_CHARS = {
  SAND: ' .,:;~=sozeaSZ8',
  DIRT: ' .,:;-=+x',
  ROCK: ' .:-=+rcxkEKM#W@',
  WATER: ' .-~=+sS$',
  LEAF: ';:!*vyY%&@',
  WOOD: ':;|!lItTHNM#',
  FULL: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  CLOTH: ':;+=xX#',
  FIRE: ' .\'^"*(&%$W@',
  SKY: " .'-~:=+*",
  CLOUD: ' .,:;coO0Q@',
  BONE: ' .:coO0Q@',
  STRATA: ' ._-=EZ#',
  METAL: ' .:+*#',
  ADOBE: ':;=+oebdB#',
  HIDE: ':;=zvVZ%',
  CACTUS: ':;!|lI1[]#',
  SHINGLE: '_-=^nmM',
  GLASS: ' .:=+#',
};
export const RAMP = {};
Object.keys(RAMP_CHARS).forEach((k, i) => (RAMP[k] = i));

export const G = (ch) => ch.charCodeAt(0) - 32; // glyph layer for a character

// Felzenszwalb & Huttenlocher 1D squared distance transform.
function edt1d(f, d, v, z, n) {
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1, k = 0; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

function edt(grid, w, h, f, d, v, z) {
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
}

export function buildAtlas(gl) {
  const N = 95;
  const cv = document.createElement('canvas');
  cv.width = CELL_W;
  cv.height = CELL_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  const mt = ctx.measureText('M');
  const asc = mt.fontBoundingBoxAscent || FONT_PX * 0.8;
  const desc = mt.fontBoundingBoxDescent || FONT_PX * 0.22;
  const baseY = Math.round((CELL_H + asc - desc) / 2);

  const size = CELL_W * CELL_H;
  const data = new Uint8Array(size * N);
  const coverage = new Float32Array(N);
  const outer = new Float64Array(size), inner = new Float64Array(size);
  const n = Math.max(CELL_W, CELL_H);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int16Array(n), z = new Float64Array(n + 1);
  const INF = 1e20;

  for (let g = 0; g < N; g++) {
    ctx.clearRect(0, 0, CELL_W, CELL_H);
    if (g > 0) ctx.fillText(String.fromCharCode(32 + g), CELL_W / 2, baseY);
    const img = ctx.getImageData(0, 0, CELL_W, CELL_H).data;
    let sum = 0;
    for (let i = 0; i < size; i++) {
      const a = img[i * 4 + 3] / 255;
      sum += a;
      outer[i] = a === 1 ? 0 : a === 0 ? INF : Math.pow(Math.max(0, 0.5 - a), 2);
      inner[i] = a === 1 ? INF : a === 0 ? 0 : Math.pow(Math.max(0, a - 0.5), 2);
    }
    coverage[g] = sum / size;
    edt(outer, CELL_W, CELL_H, f, d, v, z);
    edt(inner, CELL_W, CELL_H, f, d, v, z);
    const off = g * size;
    for (let i = 0; i < size; i++) {
      const dist = outer[i] - inner[i];
      data[off + i] = Math.max(0, Math.min(255, Math.round(255 * (0.5 - dist / SDF_RADIUS))));
    }
  }

  const tex = texture(gl, {
    target: gl.TEXTURE_2D_ARRAY,
    w: CELL_W, h: CELL_H, layers: N,
    internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE,
    data, mips: true,
  });

  // Ramp LUT: RAMP_LEVELS columns x ramps rows, value = glyph layer.
  const names = Object.keys(RAMP_CHARS);
  const lut = new Uint8Array(RAMP_LEVELS * names.length);
  names.forEach((name, row) => {
    const set = [...new Set(RAMP_CHARS[name])].map((c) => ({ g: G(c), cov: coverage[G(c)] }));
    set.sort((a, b) => a.cov - b.cov);
    const max = set[set.length - 1].cov || 1;
    for (let i = 0; i < RAMP_LEVELS; i++) {
      const want = (i / (RAMP_LEVELS - 1)) * max;
      let best = set[0];
      for (const s of set) if (Math.abs(s.cov - want) < Math.abs(best.cov - want)) best = s;
      // never fall back to blank above the darkest level: darkness is silence, light is ink
      if (i > 0 && best.g === 0 && set.length > 1) best = set[1];
      lut[row * RAMP_LEVELS + i] = best.g;
    }
  });
  const ramps = texture(gl, {
    w: RAMP_LEVELS, h: names.length,
    internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE,
    data: lut, filter: gl.NEAREST,
  });

  return { tex, ramps, coverage, lut, rampCount: names.length };
}
