// Western props, sculpted from distance fields into glyph clouds.

import { Sculpt } from '../engine/sculpt.js';
import { GlyphBuffer, FLAG } from '../engine/batch.js';
import { RAMP, G } from '../engine/atlas.js';
import { srgb, rng, TAU } from '../engine/math.js';

export const COL = {
  cactus: srgb(0x62803c),
  cactusPale: srgb(0x86995a),
  bloom: srgb(0xf6f0d6),
  sage: srgb(0x8f9e7c),
  sageDry: srgb(0xa59a72),
  rock: srgb(0xa5643f),
  rockPale: srgb(0xc69c6e),
  rockDark: srgb(0x6e4632),
  bark: srgb(0x6e5743),
  deadwood: srgb(0xa39584),
  leaf: srgb(0x6c9440),
  leafGold: srgb(0xb9a43e),
  wood: srgb(0x8c6c4a),
  woodDark: srgb(0x584231),
  woodPale: srgb(0xb39874),
  hide: srgb(0xdcc8a0),
  canvas: srgb(0xe8dec6),
  iron: srgb(0x53535a),
  red: srgb(0xa33a2a),
  ochre: srgb(0xc98a2e),
  teal: srgb(0x2f7f7a),
  black: [0.012, 0.011, 0.012],
  bone: srgb(0xe6e0cf),
  tumble: srgb(0xa8905c),
};

const SOLID = FLAG.RAMP | FLAG.CONTOUR;

export function saguaro(seed) {
  const r = rng(seed), s = new Sculpt();
  const H = 4.4 + r() * 3.6, R = 0.27 + r() * 0.09;
  const m = { color: COL.cactus, ramp: RAMP.CACTUS, k: 0.14, flags: SOLID };
  s.capsule([0, 0, 0], [0, H, 0], R, m);
  const arms = (r() * 3.4) | 0;
  for (let a = 0; a < arms; a++) {
    const ang = r() * TAU, h0 = H * (0.3 + 0.32 * r()), out = 0.72 + 0.4 * r(), up = 0.9 + r() * 2.2, ra = R * 0.72;
    const ex = Math.cos(ang) * out, ez = Math.sin(ang) * out;
    s.capsule([Math.cos(ang) * R * 0.5, h0, Math.sin(ang) * R * 0.5], [ex, h0 + 0.12, ez], ra, m);
    s.capsule([ex, h0 + 0.12, ez], [ex, h0 + 0.12 + up, ez], ra, m);
    if (r() < 0.5) s.sphere([ex, h0 + 0.12 + up + ra, ez], 0.1, { color: COL.bloom, glyph: G('*'), flags: 0, k: 0 });
  }
  if (r() < 0.6) s.sphere([0, H + R * 0.95, 0], 0.11, { color: COL.bloom, glyph: G('*'), flags: 0, k: 0 });
  return s.bake({ res: 0.13, clipY: 0.03, seed });
}

export function barrelCactus(seed) {
  const r = rng(seed), s = new Sculpt();
  const n = 1 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 0.9, z = (r() - 0.5) * 0.9, rr = 0.24 + r() * 0.16;
    s.ellipsoid([x, rr * 1.1, z], [rr, rr * 1.35, rr], { color: COL.cactusPale, ramp: RAMP.CACTUS, flags: SOLID, k: 0.02 });
    if (r() < 0.6) s.sphere([x, rr * 2.45, z], 0.07, { color: srgb(0xe06a8a), glyph: G('*'), flags: 0, k: 0 });
  }
  return s.bake({ res: 0.11, clipY: 0.03, seed });
}

export function pricklyPear(seed) {
  const r = rng(seed), s = new Sculpt();
  const m = { color: COL.cactusPale, ramp: RAMP.CACTUS, flags: SOLID, k: 0.03 };
  const pads = 4 + ((r() * 5) | 0);
  let px = 0, py = 0.3, pz = 0;
  for (let i = 0; i < pads; i++) {
    const a = r() * TAU, c = Math.cos(a), sn = Math.sin(a);
    // a flat pad: thin along one horizontal axis
    s.ellipsoid([px, py, pz], [0.1 + 0.2 * Math.abs(c), 0.3, 0.1 + 0.2 * Math.abs(sn)], m);
    if (r() < 0.35) s.sphere([px, py + 0.33, pz], 0.06, { color: srgb(0xd9406a), glyph: G('o'), flags: 0, k: 0 });
    px += (r() - 0.5) * 0.55; pz += (r() - 0.5) * 0.55; py = 0.3 + r() * 0.75;
  }
  return s.bake({ res: 0.11, clipY: 0.03, seed });
}

export function sagebrush(seed) {
  const r = rng(seed), s = new Sculpt();
  const col = r() < 0.5 ? COL.sage : COL.sageDry;
  const blobs = 2 + ((r() * 3) | 0);
  for (let i = 0; i < blobs; i++) {
    const rr = 0.35 + r() * 0.4;
    s.ellipsoid([(r() - 0.5) * 0.8, rr * 0.6, (r() - 0.5) * 0.8], [rr, rr * 0.75, rr],
      { color: col, ramp: RAMP.LEAF, flags: FLAG.RAMP | FLAG.SWAY | FLAG.TWO_SIDED, sway: 0.5, k: 0.1, ink: true });
  }
  const ink = new GlyphBuffer(256);
  const cards = s.bake({ res: 0.17, clipY: 0.04, seed, ink });
  return { cards, ink };
}

export function rock(seed, size = 1) {
  const r = rng(seed), s = new Sculpt();
  const col = [COL.rock, COL.rockPale, COL.rockDark][(r() * 3) | 0];
  const n = 2 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const hx = (0.4 + r() * 0.5) * size, hy = (0.3 + r() * 0.45) * size, hz = (0.4 + r() * 0.5) * size;
    s.box([(r() - 0.5) * size * 0.9, hy * 0.75, (r() - 0.5) * size * 0.9], [hx, hy, hz], Math.min(hx, hy, hz) * 0.55,
      { color: col, ramp: RAMP.ROCK, flags: SOLID, k: 0.18 * size }, r() * TAU);
  }
  return s.bake({ res: 0.14 * Math.max(1, size * 0.7), clipY: 0.03, seed });
}

export function deadTree(seed) {
  const r = rng(seed), s = new Sculpt();
  const m = { color: COL.deadwood, ramp: RAMP.WOOD, flags: SOLID, k: 0.08 };
  const H = 2.8 + r() * 1.6;
  s.cone([0, 0, 0], [0.25 * (r() - 0.5), H, 0.25 * (r() - 0.5)], 0.2, 0.1, m);
  const nb = 3 + ((r() * 3) | 0);
  for (let i = 0; i < nb; i++) {
    const a = r() * TAU, h = H * (0.45 + 0.5 * r()), l = 0.8 + r() * 1.4;
    const ex = Math.cos(a) * l, ez = Math.sin(a) * l, ey = h + l * (0.4 + 0.5 * r());
    s.cone([0, h, 0], [ex, ey, ez], 0.095, 0.055, m);
    if (r() < 0.6) s.cone([ex * 0.6, h + (ey - h) * 0.6, ez * 0.6], [ex * 0.6 + (r() - 0.5), ey + 0.4, ez * 0.6 + (r() - 0.5)], 0.06, 0.05, m);
  }
  return s.bake({ res: 0.085, clipY: 0.03, seed });
}

export function cottonwood(seed) {
  const r = rng(seed), s = new Sculpt();
  const bark = { color: COL.bark, ramp: RAMP.WOOD, flags: SOLID, k: 0.15 };
  const H = 3.6 + r() * 1.8;
  s.cone([0, 0, 0], [0.3 * (r() - 0.5), H, 0.3 * (r() - 0.5)], 0.42, 0.26, bark);
  const gold = r() < 0.35;
  const leaf = { color: gold ? COL.leafGold : COL.leaf, ramp: RAMP.LEAF, flags: FLAG.RAMP | FLAG.SWAY | FLAG.TWO_SIDED, sway: 0.75, k: 0.5, ink: true };
  const n = 4 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = 1.2 + r() * 2.2, y = H + 0.8 + r() * 3.2, rr = 1.5 + r() * 1.2;
    s.cone([0, H * 0.9, 0], [Math.cos(a) * d * 0.8, y - 0.6, Math.sin(a) * d * 0.8], 0.16, 0.08, bark);
    s.ellipsoid([Math.cos(a) * d, y, Math.sin(a) * d], [rr, rr * 0.8, rr], leaf);
  }
  const ink = new GlyphBuffer(2048);
  const cards = s.bake({ res: 0.24, clipY: 0.03, seed, ink });
  return { cards, ink };
}

export function tipi(seed) {
  const r = rng(seed), s = new Sculpt();
  const H = 5.2 + r() * 0.8, R = 2.2 + r() * 0.4;
  const bandA = [COL.red, COL.ochre, COL.teal][(r() * 3) | 0], bandB = [COL.black, COL.red, COL.ochre][(r() * 3) | 0];
  const color = (x, y, z) => {
    const ang = Math.atan2(z, x);
    if (y < 1.9 && Math.abs(ang - Math.PI / 2) < 0.2 + (1.9 - y) * 0.06) return COL.black; // door flap, facing +z
    if (y < 0.55) return bandA;
    const zig = Math.abs(((ang * 7) / TAU * 2) % 2 + 2) % 2 - 1;
    if (y > 1.25 + Math.abs(zig) * 0.5 && y < 1.5 + Math.abs(zig) * 0.5) return bandB;
    if (y > H * 0.78) return [COL.hide[0] * 0.3, COL.hide[1] * 0.26, COL.hide[2] * 0.22]; // smoke stain
    if (y > H * 0.7 && y < H * 0.73) return bandA;
    return COL.hide;
  };
  s.cone([0, 0, 0], [0, H, 0], R, 0.14, { color, ramp: RAMP.HIDE, flags: SOLID, k: 0 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + r(), l = 0.7 + r() * 0.5;
    s.capsule([Math.cos(a) * 0.12, H - 0.35, Math.sin(a) * 0.12], [-Math.cos(a) * l * 0.55, H + l, -Math.sin(a) * l * 0.55], 0.09,
      { color: COL.woodDark, ramp: RAMP.WOOD, flags: SOLID, k: 0 });
  }
  return s.bake({ res: 0.15, clipY: 0.03, seed });
}

export function waterTower() {
  const s = new Sculpt();
  const wood = { color: COL.wood, ramp: RAMP.WOOD, flags: SOLID, k: 0.04 };
  const dark = { color: COL.woodDark, ramp: RAMP.WOOD, flags: SOLID, k: 0.04 };
  const L = 2.0, T = 1.45, H = 6.2;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    s.cone([sx * L, 0, sz * L], [sx * T, H, sz * T], 0.16, 0.13, dark);
  }
  for (const y of [2.1, 4.3]) {
    const k = L + ((T - L) * y) / H;
    s.capsule([-k, y, -k], [k, y, -k], 0.1, dark); s.capsule([k, y, -k], [k, y, k], 0.1, dark);
    s.capsule([k, y, k], [-k, y, k], 0.1, dark); s.capsule([-k, y, k], [-k, y, -k], 0.1, dark);
  }
  s.capsule([-L * 0.95, 0.4, L * 0.95], [T * 0.97, 4.2, T * 0.97], 0.09, dark);
  s.capsule([L * 0.95, 0.4, -L * 0.95], [-T * 0.97, 4.2, -T * 0.97], 0.09, dark);
  s.box([0, H + 0.12, 0], [T + 0.5, 0.12, T + 0.5], 0.04, dark);
  const band = (x, y) => (Math.abs(((y - H) % 0.9) - 0.45) < 0.07 ? COL.iron : COL.wood);
  s.cylinder([0, H + 0.24, 0], [0, H + 3.3, 0], 2.05, { color: band, ramp: RAMP.WOOD, flags: SOLID, k: 0 });
  s.cone([0, H + 3.3, 0], [0, H + 4.5, 0], 2.25, 0.1, { color: COL.woodDark, ramp: RAMP.SHINGLE, flags: SOLID, k: 0 });
  s.capsule([2.0, H + 0.6, 0], [3.4, H - 0.6, 0], 0.09, { color: COL.iron, ramp: RAMP.METAL, flags: SOLID, k: 0 });
  return s.bake({ res: 0.15, clipY: 0.03, seed: 5 });
}

export function windmill() {
  const s = new Sculpt();
  const m = { color: COL.woodPale, ramp: RAMP.WOOD, flags: SOLID, k: 0.02 };
  const H = 9, L = 1.5, T = 0.3;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) s.cone([sx * L, 0, sz * L], [sx * T, H, sz * T], 0.09, 0.07, m);
  for (let y = 1.5; y < H; y += 1.9) {
    const k = L + ((T - L) * y) / H;
    s.capsule([-k, y, -k], [k, y, -k], 0.065, m); s.capsule([k, y, -k], [k, y, k], 0.065, m);
    s.capsule([k, y, k], [-k, y, k], 0.065, m); s.capsule([-k, y, k], [-k, y, -k], 0.065, m);
  }
  s.box([0, H + 0.1, 0], [0.5, 0.08, 0.5], 0.02, m);
  // tail vane (the fan itself is a separate, spinning object)
  s.box([-1.5, H + 0.5, 0], [0.9, 0.5, 0.07], 0.01, { color: COL.red, ramp: RAMP.METAL, flags: SOLID, k: 0 });
  s.capsule([0, H + 0.5, 0], [-0.8, H + 0.5, 0], 0.07, m);
  return s.bake({ res: 0.1, clipY: 0.03, seed: 9 });
}

export function windmillFan() {
  const s = new Sculpt();
  const m = { color: srgb(0xb8bcc0), ramp: RAMP.METAL, flags: FLAG.RAMP | FLAG.TWO_SIDED, k: 0 };
  s.torus([0, 0, 0], [0, 0, 1], 1.45, 0.07, m);
  s.torus([0, 0, 0], [0, 0, 1], 0.5, 0.07, m);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, c = Math.cos(a), sn = Math.sin(a);
    // a flat blade lying along the radius at angle a (in the fan's own xy plane)
    s._add({
      d: (x, y, z) => {
        const qx = Math.abs(x * c + y * sn - 1.0) - 0.42, qy = Math.abs(-x * sn + y * c) - 0.14, qz = Math.abs(z) - 0.065;
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
      },
    }, m, [-1.6, -1.6, -0.08, 1.6, 1.6, 0.08]);
  }
  return s.bake({ res: 0.085, seed: 11 });
}

export function barrel() {
  const s = new Sculpt();
  const band = (x, y) => (Math.abs(y - 0.25) < 0.05 || Math.abs(y - 0.75) < 0.05 ? COL.iron : COL.wood);
  s.cylinder([0, 0, 0], [0, 1.0, 0], 0.36, { color: band, ramp: RAMP.WOOD, flags: SOLID, k: 0 });
  return s.bake({ res: 0.12, clipY: 0.02, seed: 3 });
}

export function crate() {
  const s = new Sculpt();
  s.box([0, 0.4, 0], [0.42, 0.4, 0.42], 0.03, { color: COL.woodPale, ramp: RAMP.WOOD, flags: SOLID, k: 0 });
  return s.bake({ res: 0.13, clipY: 0.02, seed: 4 });
}

export function wagon() {
  const s = new Sculpt();
  const wood = { color: COL.wood, ramp: RAMP.WOOD, flags: SOLID, k: 0.02 };
  const dark = { color: COL.woodDark, ramp: RAMP.WOOD, flags: SOLID, k: 0 };
  s.box([0, 1.25, 0], [1.9, 0.32, 0.72], 0.04, wood);
  for (const [x, rr] of [[1.25, 0.62], [-1.25, 0.72]]) {
    for (const z of [0.86, -0.86]) {
      s.torus([x, rr, z], [0, 0, 1], rr - 0.09, 0.09, dark);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI, c = Math.cos(a) * (rr - 0.06), sn = Math.sin(a) * (rr - 0.06);
        s.capsule([x - c, rr - sn, z], [x + c, rr + sn, z], 0.07, dark);
      }
    }
  }
  // canvas bonnet: hoops and cloth
  const canvas = { color: COL.canvas, ramp: RAMP.CLOTH, flags: SOLID, k: 0.12 };
  for (let i = 0; i <= 6; i++) {
    const x = -1.75 + (i / 6) * 3.5;
    s.torus([x, 1.5, 0], [1, 0, 0], 0.86, 0.19, canvas);
  }
  s.capsule([1.9, 1.1, 0], [3.9, 0.7, 0], 0.08, dark);
  return s.bake({ res: 0.12, clipY: 0.03, seed: 6 });
}

export function well() {
  const s = new Sculpt();
  const stone = { color: srgb(0x9d9285), ramp: RAMP.ROCK, flags: SOLID, k: 0.06 };
  const wood = { color: COL.woodDark, ramp: RAMP.WOOD, flags: SOLID, k: 0.02 };
  for (const y of [0.2, 0.52, 0.84]) s.torus([0, y, 0], [0, 1, 0], 0.95, 0.2, stone);
  for (const x of [-1.08, 1.08]) s.capsule([x, 0, 0], [x, 2.55, 0], 0.1, wood);
  s.capsule([-1.3, 2.55, 0], [1.3, 2.55, 0], 0.1, wood);
  s.box([0, 2.9, 0], [1.5, 0.09, 0.8], 0.03, { color: COL.woodDark, ramp: RAMP.SHINGLE, flags: SOLID, k: 0 });
  s.cylinder([0, 1.3, 0], [0, 1.66, 0], 0.2, { color: COL.wood, ramp: RAMP.WOOD, flags: SOLID, k: 0 });
  s.capsule([0, 1.66, 0], [0, 2.5, 0], 0.07, { color: COL.woodPale, ramp: RAMP.HIDE, flags: SOLID, k: 0 });
  return s.bake({ res: 0.1, clipY: 0.02, seed: 21 });
}

export function hayBale(seed = 1) {
  const s = new Sculpt();
  s.box([0, 0.32, 0], [0.62, 0.32, 0.34], 0.08, { color: srgb(0xcbab52), ramp: RAMP.HIDE, flags: SOLID, k: 0 });
  return s.bake({ res: 0.12, clipY: 0.02, seed });
}

export function sack(seed = 1) {
  const s = new Sculpt();
  s.ellipsoid([0, 0.27, 0], [0.34, 0.27, 0.25], { color: srgb(0xb79c6c), ramp: RAMP.CLOTH, flags: SOLID, k: 0 });
  return s.bake({ res: 0.11, clipY: 0.02, seed });
}

export function anvil() {
  const s = new Sculpt();
  const iron = { color: COL.iron, ramp: RAMP.METAL, flags: SOLID, k: 0.03 };
  s.box([0, 0.3, 0], [0.22, 0.3, 0.2], 0.03, { color: COL.woodDark, ramp: RAMP.WOOD, flags: SOLID, k: 0 });
  s.box([0, 0.72, 0], [0.36, 0.13, 0.15], 0.03, iron);
  s.cone([0.36, 0.74, 0], [0.62, 0.78, 0], 0.11, 0.06, iron);
  return s.bake({ res: 0.085, clipY: 0.02, seed: 8 });
}

export function headstone() {
  const s = new Sculpt();
  s.box([0, 0.55, 0], [0.62, 0.55, 0.11], 0.1, { color: srgb(0x8f8a84), ramp: RAMP.ROCK, flags: SOLID, k: 0 });
  return s.bake({ res: 0.1, clipY: 0.02, seed: 14 });
}

export function tumbleweed(seed) {
  const s = new Sculpt();
  const chars = '%&#@*+xX';
  s.sphere([0, 0, 0], 0.48, {
    color: COL.tumble, flags: FLAG.TWO_SIDED, k: 0,
    glyph: (x, y, z, r) => G(chars[(r() * chars.length) | 0]),
  });
  return s.bake({ res: 0.11, seed });
}

// --- direct glyph writing (no sculpting): lines of characters in space --------------------

// A vertical run of card glyphs (posts, poles).
export function post(buf, x, y, z, h, size, col, glyph = G('|'), ramp = null) {
  const n = Math.max(1, Math.round(h / (size * 0.78)));
  for (let i = 0; i < n; i++) {
    buf.push(x, y + ((i + 0.5) * h) / n, z, size, col[0], col[1], col[2], 0, 0, 0.3, 0.95, 0,
      ramp !== null ? ramp : glyph, (ramp !== null ? FLAG.RAMP : 0) | FLAG.TWO_SIDED);
  }
}

// A run of ink glyphs along a line (rails, wires, ropes). sag > 0 hangs it like a wire.
export function strand(buf, a, b, size, col, glyph, o = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.round(len / (size * (o.gap ?? 0.5))));
  for (let i = 0; i <= n; i++) {
    const t = i / n, sg = (o.sag || 0) * 4 * t * (1 - t);
    buf.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sg, a[2] + (b[2] - a[2]) * t, size,
      col[0], col[1], col[2], o.emis || 0, 0, 1, 0, o.sway ? o.sway * 4 * t * (1 - t) : 0, glyph,
      FLAG.TWO_SIDED | (o.sway ? FLAG.SWAY : 0) | (o.flags || 0));
  }
}

export function fence(buf, cards, pts, land, col) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      post(cards, x, land.heightAt(x, z), z, 1.3, 0.5, col);
      if (k < n) {
        const xn = x0 + ((x1 - x0) * (k + 1)) / n, zn = z0 + ((z1 - z0) * (k + 1)) / n;
        for (const hy of [0.55, 1.05]) {
          strand(buf, [x, land.heightAt(x, z) + hy, z], [xn, land.heightAt(xn, zn) + hy, zn], 0.42, col, G('='), { gap: 0.62 });
        }
      }
    }
  }
}

export { GlyphBuffer };
